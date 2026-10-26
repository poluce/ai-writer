import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { closeProjectDatabase, getProjectDb, initProjectDatabase } from '../database'
import { ReviewRepository } from '../repositories/review-repository'
import {
  createHumanConfirmedReviewSnapshot,
  serializeHumanConfirmedReviewSnapshot,
} from '../../src/shared/human-confirmed-review'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')
const roots: string[] = []

function makeLegacyProject(): string {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-novel-review-kind-'))
  roots.push(projectRoot)
  const velaRoot = path.join(projectRoot, '.vela')
  fs.mkdirSync(velaRoot, { recursive: true })
  const db = new Database(path.join(velaRoot, 'vela.db'))
  db.exec(`
    CREATE TABLE contents (id INTEGER PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE drafts (
      id INTEGER PRIMARY KEY,
      chapter_number INTEGER NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'write',
      content_id INTEGER NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE reviews (
      id INTEGER PRIMARY KEY,
      base_draft_id INTEGER NOT NULL,
      review_index INTEGER NOT NULL,
      content_id INTEGER NOT NULL,
      created_at TEXT
    );
    INSERT INTO contents (id, body) VALUES (1, '原稿正文'), (2, '{"summary":"旧 AI 审稿"}');
    INSERT INTO drafts (id, chapter_number, version, status, content_id) VALUES (1, 1, 1, 'draft', 1);
    INSERT INTO reviews (id, base_draft_id, review_index, content_id) VALUES (1, 1, 1, 2);
  `)
  const snapshot = createHumanConfirmedReviewSnapshot({
    sourceReviewId: 1,
    sourceDraft: {
      id: 1,
      chapterNumber: 1,
      version: 1,
      status: 'draft',
      content: '原稿正文',
    },
    summary: '确认后的清单',
    authorGuidance: '',
    items: [{
      category: '情节逻辑',
      severity: 'warning',
      description: '角色位置冲突。',
      decision: 'apply',
      origin: 'ai',
    }],
  })
  if (!snapshot) throw new Error('failed to build review snapshot fixture')
  db.prepare('INSERT INTO contents (id, body) VALUES (3, ?)').run(serializeHumanConfirmedReviewSnapshot(snapshot))
  db.prepare('INSERT INTO reviews (id, base_draft_id, review_index, content_id) VALUES (2, 1, 2, 3)').run()
  db.close()
  return projectRoot
}

afterEach(() => {
  closeProjectDatabase()
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('review kind migration', () => {
  it('classifies legacy confirmation snapshots from their structured payload and keeps them out of report listings', () => {
    const projectRoot = makeLegacyProject()

    initProjectDatabase(projectRoot)
    const db = getProjectDb()!
    const columns = db.prepare('PRAGMA table_info(reviews)').all() as Array<{ name: string }>
    expect(columns.map(column => column.name)).toEqual(expect.arrayContaining(['kind', 'source_review_id']))

    const rows = db.prepare('SELECT id, kind, source_review_id FROM reviews ORDER BY id').all()
    expect(rows).toEqual([
      { id: 1, kind: 'review', source_review_id: null },
      { id: 2, kind: 'confirmation', source_review_id: 1 },
    ])

    // 侧栏/主智能体看到的报告清单只含 AI 审稿报告。
    expect(ReviewRepository.listSummaries({ chapterNumber: 1 }).map(row => row.id)).toEqual([1])
  })

  it('keeps legacy reports untouched when they are not confirmation snapshots', () => {
    const projectRoot = makeLegacyProject()

    initProjectDatabase(projectRoot)
    expect(getProjectDb()).not.toBeNull()

    // 再次打开（幂等迁移）不会重复分类或破坏既有行。
    closeProjectDatabase()
    initProjectDatabase(projectRoot)
    const db = getProjectDb()!
    const rows = db.prepare('SELECT id, kind, source_review_id FROM reviews ORDER BY id').all()
    expect(rows).toEqual([
      { id: 1, kind: 'review', source_review_id: null },
      { id: 2, kind: 'confirmation', source_review_id: 1 },
    ])
  })
})
