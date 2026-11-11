import type { AgentEditorSnapshot } from '../../shared/agent-events'
import { writingLanguageText, type WritingLanguage } from '../../shared/writing-language'

/** 系统附加上下文的 XML 标签；与作者真实输入区分，避免模型把界面状态当成作者指令。 */
export const APP_CONTEXT_TAG = 'system_context'
/** 作者真实输入的 XML 标签。 */
export const USER_MESSAGE_TAG = 'user_message'

/**
 * 把 L1 界面快照包装成 XML 片段，供调用方嵌入本轮作者消息。
 *
 * 刻意不新增一条 user 消息：连续 user 角色在部分供应商（如 Gemini）上会
 * 破坏多轮角色交替约束。返回 null 表示当前没有可注入的界面状态。
 */
export function buildAppContextEnvelope(
  snapshot: AgentEditorSnapshot | null | undefined,
  language: WritingLanguage,
): string | null {
  const l1 = buildL1AgentContext(snapshot, language)
  if (!l1) return null
  const notice = writingLanguageText(
    language,
    '以下内容是应用自动附加的界面状态，不是作者的发言，也不是新的任务指令；若与本轮作者消息冲突，以作者消息为准。',
    'The block below is app-attached interface state, not an author message and not a new task. If it conflicts with the author message in this turn, the author message wins.',
  )
  return [
    `<${APP_CONTEXT_TAG}>`,
    notice,
    '',
    l1,
    `</${APP_CONTEXT_TAG}>`,
  ].join('\n')
}

/** 把作者原文与系统上下文信封拼成一条完整的 user 消息内容。 */
export function composeUserMessageWithAppContext(userText: string, envelope: string): string {
  return `${envelope}\n\n<${USER_MESSAGE_TAG}>\n${userText}\n</${USER_MESSAGE_TAG}>`
}

/**
 * 从持久化的 user 消息里还原作者原文。
 *
 * 存档保存的是带 `<system_context>` 的完整消息：这样同一轮的工具循环与后续
 * 回合都能看到当时的界面状态。侧栏聊天记录必须只展示作者真正输入的内容，
 * 因此读取存档时用本函数剥离应用附加的块；历史里没有信封的旧消息原样返回。
 */
export function extractAuthorMessageText(content: string): string {
  const open = `<${USER_MESSAGE_TAG}>`
  const close = `</${USER_MESSAGE_TAG}>`
  const start = content.indexOf(open)
  const end = content.lastIndexOf(close)
  if (start === -1 || end <= start) return content
  const inner = content.slice(start + open.length, end)
  return inner.replace(/^\r?\n/, '').replace(/\r?\n$/, '')
}

/**
 * Format the renderer L1 snapshot as the body of the app-context XML block.
 * Tool catalogs stay on AgentTool schemas — this is app-shell awareness.
 * Active-file bodies are not included; the agent should read them with tools.
 * Callers embed it through `buildAppContextEnvelope`, never as a standalone
 * user message.
 */
export function buildL1AgentContext(
  snapshot: AgentEditorSnapshot | null | undefined,
  language: WritingLanguage,
): string | null {
  if (!snapshot) return null
  const label = (zhCN: string, enUS: string) => writingLanguageText(language, zhCN, enUS)
  const parts: string[] = []

  parts.push(`## ${label('应用状态', 'App state')}`)
  if (snapshot.project?.open) {
    parts.push(label(
      `当前小说项目：已打开「${snapshot.project.name ?? snapshot.project.path ?? ''}」`,
      `Current novel project: open "${snapshot.project.name ?? snapshot.project.path ?? ''}"`,
    ))
  } else {
    parts.push(label(
      '当前小说项目：未打开。读写项目工具会失败，除非用户先打开一本书。',
      'Current novel project: none open. Project read/write tools will fail until the user opens a book.',
    ))
  }

  if (snapshot.recentProjects && snapshot.recentProjects.length > 0) {
    const names = snapshot.recentProjects.map(item => item.name).join('、')
    parts.push(`${label('最近项目', 'Recent projects')}: ${names}`)
  }

  if (snapshot.layout) {
    const layout = snapshot.layout
    const sidebar = labelSidebar(layout.sidebarView, language)
    const right = labelRightView(layout.rightView, language)
    const bottom = layout.bottomPanelOpen
      ? `${label('已打开', 'open')} (${layout.bottomTab})`
      : label('关闭', 'closed')
    const dialogs: string[] = []
    if (layout.settingsOpen) dialogs.push(label('设置', 'settings'))
    if (layout.newProjectOpen) dialogs.push(label('新建项目', 'new project'))
    if (layout.importNovelOpen) dialogs.push(label('导入小说', 'import novel'))
    parts.push(
      `${label('左侧栏', 'Sidebar')}: ${sidebar}`,
      `${label('右侧栏', 'Right panel')}: ${right}`,
      `${label('底部面板', 'Bottom panel')}: ${bottom}`,
    )
    if (dialogs.length > 0) {
      parts.push(`${label('打开的对话框', 'Open dialogs')}: ${dialogs.join('、')}`)
    }
  }

  if (snapshot.mcp) {
    parts.push(label(
      `MCP：已连接 ${snapshot.mcp.connectedServers} 个服务器，${snapshot.mcp.tools} 个工具`,
      `MCP: ${snapshot.mcp.connectedServers} connected server(s), ${snapshot.mcp.tools} tool(s)`,
    ))
  }

  if (snapshot.changes && snapshot.changes.length > 0) {
    const lines = snapshot.changes.map(change => `  - ${change.kind}: ${change.from} → ${change.to}`)
    parts.push(`${label('自上一轮以来的界面变更', 'UI changes since the last turn')}:\n${lines.join('\n')}`)
  }

  if (snapshot.tabs.length > 0) {
    const tabSummaries = snapshot.tabs.map(tab => {
      const active = tab.active ? ` [${label('当前活跃', 'active')}]` : ''
      const dirty = tab.unsaved ? ` [${label('未保存', 'unsaved')}]` : ''
      const chapter = typeof tab.chapterNumber === 'number'
        ? label(`第${tab.chapterNumber}章`, `Chapter ${tab.chapterNumber}`) + ' · '
        : ''
      return `  - ${chapter}${tab.name} (${tab.type})${active}${dirty}`
    }).join('\n')
    parts.push(`## ${label('编辑器状态', 'Editor state')}\n${label('打开的文件', 'Open files')}:\n${tabSummaries}`)

    const activeTab = snapshot.tabs.find(tab => tab.active)
    if (activeTab) {
      const chapterHint = typeof activeTab.chapterNumber === 'number'
        ? label(`（这是第 ${activeTab.chapterNumber} 章）`, ` (this is Chapter ${activeTab.chapterNumber})`)
        : ''
      parts.push(label(
        `用户正在查看「${activeTab.name}」（${activeTab.type}）${chapterHint}。需要正文时请用工具读取，不要假设已经看到文件内容。`,
        `The user is viewing "${activeTab.name}" (${activeTab.type})${chapterHint}. Read the body with tools; do not assume file contents are already in context.`,
      ))
    }
  }

  if (snapshot.workflow) {
    const runName = language === 'en-US' ? snapshot.workflow.type : snapshot.workflow.title
    parts.push(
      `## ${label('工作流状态', 'Workflow status')}\n${label('正在运行', 'Running')}: ${runName} (${label('进度', 'progress')}: ${snapshot.workflow.currentStepIndex + 1}/${snapshot.workflow.stepCount})`,
    )
  }

  return parts.length > 0 ? parts.join('\n\n') : null
}

function labelSidebar(view: string, language: WritingLanguage): string {
  const map: Record<string, [string, string]> = {
    project: ['项目', 'project'],
    knowledge: ['知识库', 'knowledge'],
    characters: ['角色', 'characters'],
    settings: ['设置', 'settings'],
  }
  const pair = map[view]
  return pair ? writingLanguageText(language, pair[0], pair[1]) : view
}

function labelRightView(view: string, language: WritingLanguage): string {
  const map: Record<string, [string, string]> = {
    agent: ['助手对话', 'assistant chat'],
    architect: ['架构助手', 'architect assistant'],
    blueprint: ['蓝图助手', 'blueprint assistant'],
    writer: ['写作助手', 'writing assistant'],
    review: ['审稿助手', 'review assistant'],
  }
  const pair = map[view]
  return pair ? writingLanguageText(language, pair[0], pair[1]) : writingLanguageText(language, '助手对话', 'assistant chat')
}
