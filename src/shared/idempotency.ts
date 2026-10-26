/**
 * 通用幂等键的共享契约：主进程仓储、旧收据表迁移与项目清空流程共用。
 *
 * 设计约束：
 * - 一张表按 (scope, key) 唯一定位，request_hash 防止同 key 绑定不同载荷；
 * - response_json 保存首次执行结果，重试时直接返回；
 * - 只保留最近 90 天（重试窗口远小于该期限），避免再次出现只增不减。
 */
export const IDEMPOTENCY_RETENTION_DAYS = 90

export const IDEMPOTENCY_SCOPES = {
  characterRoster: 'character-roster',
  blueprintCommit: 'blueprint-commit',
  finalizedDraftImport: 'finalized-draft-import',
  importGlobalFacts: 'import-global-facts',
} as const

export type IdempotencyScope = typeof IDEMPOTENCY_SCOPES[keyof typeof IDEMPOTENCY_SCOPES]
