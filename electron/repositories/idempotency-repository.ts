import type BetterSqlite3 from 'better-sqlite3'

import { getProjectDb } from '../database'
import {
    IDEMPOTENCY_RETENTION_DAYS,
    IDEMPOTENCY_SCOPES,
    type IdempotencyScope,
} from '../../src/shared/idempotency'
import { ensureIdempotencySchema } from './idempotency-schema'

export { IDEMPOTENCY_RETENTION_DAYS, IDEMPOTENCY_SCOPES }
export type { IdempotencyScope }

/**
 * 通用幂等键表：所有“客户端可能重试、只需生效一次”的写操作共用一张表，
 * 用 (scope, key) 唯一定位，request_hash 防止同一 key 绑定不同载荷，
 * response_json 保存首次执行结果供重试直接返回。
 *
 * 与旧做法（每个领域一张只增不减的收据表）相比：
 * - 只有一张表，结构统一；
 * - 按 created_at 保留 90 天后自动清理（重试窗口远小于该期限）；
 * - 业务数据本身的清空动作按 scope 级联清理对应幂等记录。
 */
export interface IdempotencyRecord {
    scope: string
    key: string
    requestHash: string
    responseJson: string
    createdAt: string
}

function requireDb(): BetterSqlite3.Database {
    const db = getProjectDb()
    if (!db) throw new Error('[IdempotencyRepository] 数据库未连接')
    return db
}

export class IdempotencyRepository {
    /** 读取幂等记录（不存在返回 null）。 */
    static find(scope: IdempotencyScope, key: string): IdempotencyRecord | null {
        const db = requireDb()
        ensureIdempotencySchema(db)
        const row = db.prepare(`
      SELECT scope, key, request_hash, response_json, created_at
      FROM idempotency_keys WHERE scope = ? AND key = ?
    `).get(scope, key) as {
            scope: string
            key: string
            request_hash: string
            response_json: string
            created_at: string
        } | undefined
        if (!row) return null
        return {
            scope: row.scope,
            key: row.key,
            requestHash: row.request_hash,
            responseJson: row.response_json,
            createdAt: row.created_at,
        }
    }

    /** 读取并解析首次执行结果。 */
    static findResponse<T>(scope: IdempotencyScope, key: string): T | null {
        const record = IdempotencyRepository.find(scope, key)
        if (!record) return null
        try {
            return JSON.parse(record.responseJson) as T
        } catch {
            throw new Error('幂等回执已损坏')
        }
    }

    /** 在业务事务内登记一次操作及其结果（调用方需先确认该 key 不存在）。 */
    static put(
        scope: IdempotencyScope,
        key: string,
        requestHash: string,
        response: unknown,
    ): void {
        const db = requireDb()
        ensureIdempotencySchema(db)
        db.prepare(`
      INSERT INTO idempotency_keys (scope, key, request_hash, response_json)
      VALUES (?, ?, ?, ?)
    `).run(scope, key, requestHash, JSON.stringify(response))
    }

    /** 覆盖已有操作的结果（例如蓝图提交后角色同步完成，更新回执状态）。 */
    static updateResponse(scope: IdempotencyScope, key: string, response: unknown): void {
        const db = requireDb()
        ensureIdempotencySchema(db)
        const result = db.prepare(`
      UPDATE idempotency_keys SET response_json = ? WHERE scope = ? AND key = ?
    `).run(JSON.stringify(response), scope, key)
        if (result.changes !== 1) throw new Error('幂等回执不存在，无法更新')
    }

    /** 清空某个 scope 的全部幂等记录（项目清空/清空蓝图等显式动作使用）。 */
    static deleteScope(scope: IdempotencyScope): void {
        const db = requireDb()
        ensureIdempotencySchema(db)
        db.prepare('DELETE FROM idempotency_keys WHERE scope = ?').run(scope)
    }

    /** 删除超过保留期的幂等记录（项目打开时统一执行）。 */
    static prune(retentionDays = IDEMPOTENCY_RETENTION_DAYS): number {
        const db = requireDb()
        ensureIdempotencySchema(db)
        return db.prepare(`
      DELETE FROM idempotency_keys
      WHERE created_at < datetime('now', ?)
    `).run(`-${Math.max(1, Math.floor(retentionDays))} days`).changes
    }
}
