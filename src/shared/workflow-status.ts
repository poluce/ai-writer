/** 工作流运行状态 — 跨层共享的工作流契约类型，唯一定义处。 */
export type WorkflowStatus =
  | 'idle'
  | 'running'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'waiting'