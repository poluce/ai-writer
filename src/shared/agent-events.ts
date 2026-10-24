/**
 * Agent 事件与渲染端动作的共享类型（主进程 → 渲染进程，可序列化）。
 */

/** Serializable tool-call lifecycle card. */
export interface PiToolCallInfo {
  id: string
  toolName: string
  arguments: unknown
  status: 'running' | 'waiting_confirm' | 'completed' | 'failed'
  error?: string
  result?: unknown
}

/** Normalized agent event forwarded from main to the renderer UI. */
export type PiAgentEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call_start'; call: PiToolCallInfo }
  | { type: 'tool_call_confirm'; call: PiToolCallInfo }
  /**
   * 确认落定后的状态翻转（待确认 → 执行中 / 已拒绝）。
   * 真实 `tool_start` 事件被确认卡补发逻辑抑制，缺了它卡片只能等工具跑完才变。
   */
  | { type: 'tool_call_status'; call: PiToolCallInfo }
  | { type: 'tool_call_complete'; call: PiToolCallInfo }
  | { type: 'done'; fullText: string }
  | { type: 'error'; message: string }

/** 内置（数据库驱动）编辑器页面：不需要文件路径，直接打开对应页面。 */
export type BuiltinEditorTarget =
  | 'config'
  | 'blueprints'
  | 'characters'
  | 'architecture'
  | 'synopsis'

/** Serializable renderer-side action a main-process tool asks the renderer to perform. */
export type RendererAction =
  | { type: 'open_editor'; target: 'builtin'; editor: BuiltinEditorTarget }
  | { type: 'open_editor'; target: 'file'; filePath: string; content: string; fileName: string }
  | { type: 'open_editor'; target: 'draft'; chapterNumber: number; draftId?: number }
  | {
      type: 'replace_draft_excerpt'
      chapterNumber: number
      oldText?: string
      newText?: string
      replacements?: Array<{ old_text: string; new_text: string }>
      draftId?: number
    }
  | { type: 'refresh_project_config' }
  | { type: 'refresh_blueprint' }
  | { type: 'refresh_architecture'; section?: string }
  | { type: 'refresh_character_roster' }
  | { type: 'sync_draft_content'; chapterNumber: number; draftId: number; content: string; isNewVersion: boolean }
  /** 打开审稿助手刚写入的审稿报告 Tab（原始报告与人工确认快照都以此为来源）。 */
  | {
      type: 'open_review_report'
      chapterNumber: number
      draftId: number
      draftPath: string
      chapterDir: string
      reportPath: string
      reviewId: number
      reviewIndex: number
      content: string
    }

/** 工作流启动收据：产物卡片与工具 details 都用它，避免再解析摘要文本。 */
export interface WorkflowLaunchReceipt {
  runId: string
  status: string
  name: string
}

/** Receipt from the renderer after a blocking action actually finished (or failed). */
export type RendererActionResult =
  | { ok: true; summary: string; workflow?: WorkflowLaunchReceipt }
  | { ok: false; error: string }

export type RendererActionSink = (
  action: RendererAction,
) => void | Promise<RendererActionResult | void>

/** Renderer-owned editor/workflow facts sent with each agent prompt (L1). */
export interface AgentEditorTabSnapshot {
  name: string
  type: string
  active: boolean
  unsaved: boolean
  /** 草稿类 Tab 的章节号，让助手知道作者正在看哪一章。 */
  chapterNumber?: number
}

export interface AgentWorkflowSnapshot {
  title: string
  type: string
  currentStepIndex: number
  stepCount: number
}

export interface AgentProjectSnapshot {
  open: boolean
  name?: string
  path?: string
}

export interface AgentLayoutSnapshot {
  sidebarView: string
  rightView: string
  bottomPanelOpen: boolean
  bottomTab: string
  settingsOpen: boolean
  newProjectOpen: boolean
  importNovelOpen: boolean
  chapterCreationOpen: boolean
}

export interface AgentAppChange {
  kind: 'project' | 'sidebar' | 'right_panel' | 'settings' | 'dialog'
  from: string
  to: string
}

export interface AgentEditorSnapshot {
  tabs: AgentEditorTabSnapshot[]
  workflow?: AgentWorkflowSnapshot
  /** App-wide shell: which book is open, which pane is active. */
  project?: AgentProjectSnapshot
  recentProjects?: Array<{ name: string }>
  layout?: AgentLayoutSnapshot
  mcp?: { connectedServers: number; tools: number }
  changes?: AgentAppChange[]
}
