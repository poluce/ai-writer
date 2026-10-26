import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { closeProjectDatabase, getProjectDb, initProjectDatabase } from '../database'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')
const roots: string[] = []

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_C = 'c'.repeat(64)
const HASH_D = 'd'.repeat(64)
const HASH_E = 'e'.repeat(64)

function makeLegacyReceiptProject(): string {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-novel-idempotency-'))
  roots.push(projectRoot)
  const velaRoot = path.join(projectRoot, '.vela')
  fs.mkdirSync(velaRoot, { recursive: true })
  const db = new Database(path.join(velaRoot, 'vela.db'))
  db.exec(`
    CREATE TABLE character_roster_operations (
      operation_id TEXT PRIMARY KEY,
      payload_hash TEXT NOT NULL,
      committed_revision INTEGER NOT NULL,
      projection_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE blueprint_commit_operations (
      operation_id TEXT PRIMARY KEY,
      payload_hash TEXT NOT NULL,
      mode TEXT NOT NULL,
      start_chapter INTEGER NOT NULL,
      end_chapter INTEGER NOT NULL,
      character_sync_input TEXT NOT NULL,
      committed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE blueprint_character_sync_operations (
      operation_id TEXT PRIMARY KEY,
      blueprint_commit_operation_id TEXT NOT NULL UNIQUE,
      blueprint_commit_payload_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      start_chapter INTEGER NOT NULL,
      end_chapter INTEGER NOT NULL,
      character_sync_input TEXT NOT NULL,
      completion_receipt TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT DEFAULT NULL,
      FOREIGN KEY (blueprint_commit_operation_id)
        REFERENCES blueprint_commit_operations(operation_id) ON DELETE CASCADE
    );
    CREATE TABLE finalized_draft_import_operations (
      operation_id TEXT PRIMARY KEY,
      payload_hash TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE import_global_fact_operations (
      operation_id TEXT PRIMARY KEY,
      payload_hash TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  db.prepare(`
    INSERT INTO character_roster_operations (operation_id, payload_hash, committed_revision, projection_hash)
    VALUES ('roster-op-1', ?, 3, ?)
  `).run(HASH_A, HASH_B)
  db.prepare(`
    INSERT INTO blueprint_commit_operations (
      operation_id, payload_hash, mode, start_chapter, end_chapter, character_sync_input, committed_at
    ) VALUES ('commit-pending', ?, 'replace-range', 1, 1, '[]', '2026-01-02 00:00:00')
  `).run(HASH_C)
  db.prepare(`
    INSERT INTO blueprint_commit_operations (
      operation_id, payload_hash, mode, start_chapter, end_chapter, character_sync_input, committed_at
    ) VALUES ('commit-completed', ?, 'replace-range', 1, 1, '[]', '2026-01-03 00:00:00')
  `).run(HASH_D)
  db.prepare(`
    INSERT INTO blueprint_character_sync_operations (
      operation_id, blueprint_commit_operation_id, blueprint_commit_payload_hash,
      status, start_chapter, end_chapter, character_sync_input
    ) VALUES ('blueprint-sync-commit-pending', 'commit-pending', ?, 'pending', 1, 1, '[]')
  `).run(HASH_C)
  db.prepare(`
    INSERT INTO blueprint_character_sync_operations (
      operation_id, blueprint_commit_operation_id, blueprint_commit_payload_hash,
      status, start_chapter, end_chapter, character_sync_input,
      completion_receipt, completed_at
    ) VALUES ('blueprint-sync-commit-completed', 'commit-completed', ?, 'completed', 1, 1, '[]',
      '{"blueprintCommitOperationId":"commit-completed","operationId":"blueprint-sync-commit-completed","status":"already-satisfied"}',
      '2026-01-04 00:00:00')
  `).run(HASH_D)
  db.prepare(`
    INSERT INTO finalized_draft_import_operations (operation_id, payload_hash, receipt_json)
    VALUES ('import-op-1', ?, ?)
  `).run(HASH_D, JSON.stringify({
    operationId: 'import-op-1',
    payloadHash: HASH_D,
    chapterNumbers: [1],
    drafts: [],
  }))
  db.prepare(`
    INSERT INTO import_global_fact_operations (operation_id, payload_hash, receipt_json)
    VALUES ('global-op-1', ?, ?)
  `).run(HASH_E, JSON.stringify({ operationId: 'global-op-1', payloadHash: HASH_E }))
  db.close()
  return projectRoot
}

function tableExists(name: string): boolean {
  const db = getProjectDb()!
  return db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(name) !== undefined
}

afterEach(() => {
  closeProjectDatabase()
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('legacy receipt table migration', () => {
  it('migrates legacy per-domain receipt rows into one idempotency table and drops the old tables', () => {
    const projectRoot = makeLegacyReceiptProject()

    initProjectDatabase(projectRoot)
    const db = getProjectDb()!

    for (const legacyTable of [
      'character_roster_operations',
      'blueprint_commit_operations',
      'finalized_draft_import_operations',
      'import_global_fact_operations',
    ]) {
      expect(tableExists(legacyTable)).toBe(false)
    }
    expect(tableExists('blueprint_character_sync_operations')).toBe(true)
    expect(tableExists('idempotency_keys')).toBe(true)

    const rows = db.prepare(`
      SELECT scope, key, request_hash, response_json
      FROM idempotency_keys ORDER BY scope, key
    `).all() as Array<{ scope: string; key: string; request_hash: string; response_json: string }>
    expect(rows.map(row => [row.scope, row.key])).toEqual([
      ['blueprint-commit', 'commit-completed'],
      ['blueprint-commit', 'commit-pending'],
      ['character-roster', 'roster-op-1'],
      ['finalized-draft-import', 'import-op-1'],
      ['import-global-facts', 'global-op-1'],
    ])
    expect(JSON.parse(rows[0].response_json)).toMatchObject({
      mode: 'replace-range',
      sync: {
        operationId: 'blueprint-sync-commit-completed',
        completionReceipt: { status: 'already-satisfied' },
      },
    })
    expect(JSON.parse(rows[2].response_json)).toMatchObject({ revision: 3, projectionHash: HASH_B })

    // 同步队列只保留 pending；已完成回执合并进蓝图提交的幂等结果。
    expect(db.prepare(`
      SELECT operation_id FROM blueprint_character_sync_operations ORDER BY operation_id
    `).all()).toEqual([{ operation_id: 'blueprint-sync-commit-pending' }])
  })

  it('prunes idempotency keys older than the retention window on project open', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-novel-idempotency-ttl-'))
    roots.push(projectRoot)
    initProjectDatabase(projectRoot)
    const db = getProjectDb()!
    db.prepare(`
      INSERT INTO idempotency_keys (scope, key, request_hash, response_json, created_at)
      VALUES ('character-roster', 'stale-op', ?, '{}', datetime('now', '-91 days'))
    `).run(HASH_A)
    db.prepare(`
      INSERT INTO idempotency_keys (scope, key, request_hash, response_json)
      VALUES ('character-roster', 'fresh-op', ?, '{}')
    `).run(HASH_B)

    closeProjectDatabase()
    initProjectDatabase(projectRoot)

    const keys = (getProjectDb()!.prepare(
      "SELECT key FROM idempotency_keys WHERE scope = 'character-roster' ORDER BY key",
    ).all() as Array<{ key: string }>).map(row => row.key)
    expect(keys).toEqual(['fresh-op'])
  })

  it('does not create legacy receipt tables in a fresh project', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-novel-idempotency-fresh-'))
    roots.push(projectRoot)
    initProjectDatabase(projectRoot)

    for (const legacyTable of [
      'character_roster_operations',
      'blueprint_commit_operations',
      'finalized_draft_import_operations',
      'import_global_fact_operations',
    ]) {
      expect(tableExists(legacyTable)).toBe(false)
    }
    expect(tableExists('idempotency_keys')).toBe(true)
  })
})
