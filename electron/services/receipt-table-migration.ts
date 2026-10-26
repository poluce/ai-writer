import type BetterSqlite3 from 'better-sqlite3'

import { IDEMPOTENCY_SCOPES } from '../../src/shared/idempotency'

interface LegacyOperationRow {
  operation_id: string
  payload_hash: string
  receipt_json: string
}

interface LegacyRosterOperationRow {
  operation_id: string
  payload_hash: string
  committed_revision: number
  projection_hash: string
}

interface LegacyBlueprintCommitRow {
  operation_id: string
  payload_hash: string
  mode: 'full' | 'replace-range'
  start_chapter: number
  end_chapter: number
  character_sync_input: string
  committed_at: string
}

interface LegacyBlueprintSyncRow {
  operation_id: string
  blueprint_commit_operation_id: string
  blueprint_commit_payload_hash: string
  status: 'pending' | 'completed'
  start_chapter: number
  end_chapter: number
  character_sync_input: string
  completion_receipt: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

function tableExists(db: BetterSqlite3.Database, table: string): boolean {
  return db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(table) !== undefined
}

function parseJson<T>(serialized: string, label: string): T {
  try {
    return JSON.parse(serialized) as T
  } catch {
    throw new Error(`${label}已损坏，无法迁移到通用幂等表`)
  }
}

function insertIdempotencyRow(
  db: BetterSqlite3.Database,
  scope: string,
  key: string,
  requestHash: string,
  response: unknown,
): void {
  db.prepare(`
    INSERT OR IGNORE INTO idempotency_keys (scope, key, request_hash, response_json)
    VALUES (?, ?, ?, ?)
  `).run(scope, key, requestHash, JSON.stringify(response))
}

/** 蓝图角色同步队列重建为无外键版本（父表 blueprint_commit_operations 即将下线）。 */
function rebuildBlueprintCharacterSyncTable(
  db: BetterSqlite3.Database,
  keepOnlyPending: boolean,
): void {
  const table = 'blueprint_character_sync_operations'
  if (!tableExists(db, table)) return
  db.exec(`
    CREATE TABLE ${table}_migrated (
      operation_id TEXT PRIMARY KEY,
      blueprint_commit_operation_id TEXT NOT NULL UNIQUE,
      blueprint_commit_payload_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed')),
      start_chapter INTEGER NOT NULL,
      end_chapter INTEGER NOT NULL,
      character_sync_input TEXT NOT NULL,
      completion_receipt TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT DEFAULT NULL
    );
  `)
  const pendingFilter = keepOnlyPending ? "WHERE status = 'pending'" : ''
  db.exec(`
    INSERT INTO ${table}_migrated (
      operation_id, blueprint_commit_operation_id, blueprint_commit_payload_hash,
      status, start_chapter, end_chapter, character_sync_input, completion_receipt,
      created_at, updated_at, completed_at
    )
    SELECT
      operation_id, blueprint_commit_operation_id, blueprint_commit_payload_hash,
      status, start_chapter, end_chapter, character_sync_input, completion_receipt,
      created_at, updated_at, completed_at
    FROM ${table} ${pendingFilter};
  `)
  db.exec(`DROP TABLE ${table};`)
  db.exec(`ALTER TABLE ${table}_migrated RENAME TO ${table};`)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_blueprint_character_sync_status
      ON ${table}(status, created_at);
  `)
}

/**
 * 把四张领域收据表迁移到通用 idempotency_keys，然后删除旧表。
 *
 * 迁移是幂等的：旧表不存在时直接跳过；已迁移过的库不会重复写入。
 * 蓝图角色同步队列保留，重建为无外键版本并只保留 pending 行；
 * 已完成同步的完成回执合并进对应蓝图提交的幂等结果里。
 */
export function migrateLegacyReceiptTables(db: BetterSqlite3.Database): void {
  if (!tableExists(db, 'idempotency_keys')) return

  // 1) 角色名单提交回执
  if (tableExists(db, 'character_roster_operations')) {
    const rows = db.prepare(`
      SELECT operation_id, payload_hash, committed_revision, projection_hash
      FROM character_roster_operations
    `).all() as LegacyRosterOperationRow[]
    for (const row of rows) {
      insertIdempotencyRow(
        db,
        IDEMPOTENCY_SCOPES.characterRoster,
        row.operation_id,
        row.payload_hash,
        { revision: row.committed_revision, projectionHash: row.projection_hash },
      )
    }
    db.exec('DROP TABLE character_roster_operations;')
  }

  // 2) 蓝图提交回执 + 蓝图角色同步队列
  if (tableExists(db, 'blueprint_commit_operations')) {
    const commits = db.prepare(`
      SELECT operation_id, payload_hash, mode, start_chapter, end_chapter,
             character_sync_input, committed_at
      FROM blueprint_commit_operations
    `).all() as LegacyBlueprintCommitRow[]
    const syncRows = tableExists(db, 'blueprint_character_sync_operations')
      ? db.prepare(`
          SELECT operation_id, blueprint_commit_operation_id, blueprint_commit_payload_hash,
                 status, start_chapter, end_chapter, character_sync_input,
                 completion_receipt, created_at, updated_at, completed_at
          FROM blueprint_character_sync_operations
        `).all() as LegacyBlueprintSyncRow[]
      : []
    const syncByCommit = new Map(syncRows.map(row => [row.blueprint_commit_operation_id, row]))

    for (const commit of commits) {
      const sync = syncByCommit.get(commit.operation_id)
      const syncState: Record<string, unknown> = {
        operationId: sync?.operation_id ?? `blueprint-sync-${commit.operation_id}`,
        payloadHash: commit.payload_hash,
        createdAt: sync?.created_at ?? commit.committed_at,
        ...(sync ? { updatedAt: sync.updated_at } : {}),
      }
      if (sync?.status === 'completed' && sync.completion_receipt) {
        syncState.completedAt = sync.completed_at ?? sync.updated_at
        syncState.completionReceipt = parseJson(
          sync.completion_receipt,
          '蓝图角色同步完成回执',
        )
      }
      insertIdempotencyRow(
        db,
        IDEMPOTENCY_SCOPES.blueprintCommit,
        commit.operation_id,
        commit.payload_hash,
        {
          mode: commit.mode,
          startChapter: commit.start_chapter,
          endChapter: commit.end_chapter,
          characterSyncInput: parseJson(commit.character_sync_input, '蓝图提交冻结输入'),
          sync: syncState,
        },
      )
    }

    rebuildBlueprintCharacterSyncTable(db, true)
    db.exec('DROP TABLE blueprint_commit_operations;')
  } else if (tableExists(db, 'blueprint_character_sync_operations')) {
    const foreignKeys = db.prepare(
      'PRAGMA foreign_key_list(blueprint_character_sync_operations)',
    ).all() as Array<{ table: string }>
    if (foreignKeys.some(foreignKey => foreignKey.table === 'blueprint_commit_operations')) {
      // 极端情况：旧提交表已被手工删除，但同步表仍引用它。
      rebuildBlueprintCharacterSyncTable(db, false)
    }
  }

  // 3) 作者定稿导入回执
  if (tableExists(db, 'finalized_draft_import_operations')) {
    const rows = db.prepare(
      'SELECT operation_id, payload_hash, receipt_json FROM finalized_draft_import_operations',
    ).all() as LegacyOperationRow[]
    for (const row of rows) {
      insertIdempotencyRow(
        db,
        IDEMPOTENCY_SCOPES.finalizedDraftImport,
        row.operation_id,
        row.payload_hash,
        parseJson(row.receipt_json, '定稿导入回执'),
      )
    }
    db.exec('DROP TABLE finalized_draft_import_operations;')
  }

  // 4) 导入全局事实回执
  if (tableExists(db, 'import_global_fact_operations')) {
    const rows = db.prepare(
      'SELECT operation_id, payload_hash, receipt_json FROM import_global_fact_operations',
    ).all() as LegacyOperationRow[]
    for (const row of rows) {
      insertIdempotencyRow(
        db,
        IDEMPOTENCY_SCOPES.importGlobalFacts,
        row.operation_id,
        row.payload_hash,
        parseJson(row.receipt_json, '导入全局事实回执'),
      )
    }
    db.exec('DROP TABLE import_global_fact_operations;')
  }
}
