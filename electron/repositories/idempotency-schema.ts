import type BetterSqlite3 from 'better-sqlite3'

/** 通用幂等键表结构（纯 DDL，无运行时依赖，供各仓储与迁移复用）。 */
export function ensureIdempotencySchema(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      scope TEXT NOT NULL,
      key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (scope, key)
    );
    CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created
      ON idempotency_keys(created_at);
  `)
}
