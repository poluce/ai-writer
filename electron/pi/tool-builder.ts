
import type { WritingLanguage } from '../../src/shared/writing-language'
import type { RendererActionSink } from '../../src/shared/agent-events'

import { createReadArchitectureTool } from './tools/read-architecture.tool'
import { createNovelConfigTool } from './tools/novel-config.tool'
import { createStoryArchitectureTool } from './tools/story-architecture.tool'
import { createReadBlueprintTool } from './tools/read-blueprint.tool'
import { createManageDraftsTool, resolveDraftAction, type DraftAction } from './tools/manage-drafts.tool'
import { createManageReviewReportsTool } from './tools/manage-review-reports.tool'
import { createDeleteReviewReportTool } from './tools/delete-review-report.tool'
import { createReadProjectStateTool } from './tools/read-project-state.tool'
import { createSearchKnowledgeTool } from './tools/search-knowledge.tool'
import { createManageKnowledgeBaseTool } from './tools/manage-knowledge-base.tool'
import { createReadFileTool } from './tools/read-file.tool'
import { createListFilesTool } from './tools/list-files.tool'
import { createManageSkillsTool } from './tools/manage-skills.tool'
import { createOpenEditorTool } from './tools/open-editor.tool'
import { createProposeChapterBlueprintTool } from './tools/propose-chapter-blueprint.tool'
import { createManageCharactersTool } from './tools/manage-characters.tool'
import { createManageMcpTool } from './tools/manage-mcp.tool'
import { createWebFetchTool } from './tools/web-fetch.tool'
import { buildMcpAgentTools } from './tools/mcp.tool'
import { createReadContinuityFactsTool } from './tools/read-continuity-facts.tool'
import { createReadNarrativeThreadsTool } from './tools/read-narrative-threads.tool'
import { createManageNarrativeThreadsTool } from './tools/manage-narrative-threads.tool'
import { createSubmitChapterReviewTool } from './tools/submit-chapter-review.tool'
import { createDelegateToAssistantTool, type AssistantDelegateHandler, type DelegatableAssistantType } from './tools/delegate-to-assistant.tool'
import type { AnyAgentTool } from './tool-types'
import {
  SourceFreshnessGuard,
  describeSourceRead,
  formatFreshnessRefusal,
  toolResultText,
  type FreshnessViolation,
  type SourceReadRequest,
  SOURCE_FRESHNESS_TRACKED_READS,
} from './source-freshness'
import { filterAgentSkillCatalog, type AgentSkillCatalogEntry } from '../../src/shared/agent-skills'
import type { AssistantType } from '../../src/shared/agent-conversation-archive'

export type { AssistantDelegateHandler, DelegatableAssistantType }

/**
 * 需要串行执行的工具名单（写操作、环境变动与命令执行）。
 * 其它纯只读工具默认并行执行。
 */
export function sequentialToolNames(): ReadonlySet<string> {
  return new Set([
    'write',
    'edit',
    'bash',
    'open_editor',
    'manage_drafts',
    'novel_config',
    'story_architecture',
    'propose_chapter_blueprint',
    'manage_characters',
    'manage_narrative_threads',
    'manage_mcp',
    'manage_skills',
    'manage_knowledge_base',
    'submit_chapter_review',
    'manage_review_reports',
    'delete_review_report',
    'delegate_to_assistant',
  ])
}

/**
 * Agent 级执行是并行的，这里只把写入类与 MCP 工具钉成 sequential，
 * 让它们不会互相重叠。结果截断由 Pi 的 afterToolCall 钩子统一处理
 * （见 pi-agent.ts），不再逐个包装 execute。
 */
export function withExecutionMode<T extends { name: string; executionMode?: 'sequential' | 'parallel' }>(tool: T): T {
  const sequential = sequentialToolNames().has(tool.name) || tool.name.startsWith('mcp__')
  return sequential ? { ...tool, executionMode: 'sequential' as const } : tool
}

/**
 * Build the tools one agent session may use.
 *
 * 助手只存在于项目内，因此始终挂完整的项目工具集；技能检查与 MCP
 * 不依赖项目，与项目工具一起装配。
 */
export function buildAgentTools(
  language: WritingLanguage,
  rendererAction: RendererActionSink,
  skills: readonly AgentSkillCatalogEntry[] = [],
  skillRoots: readonly string[] = [],
  delegateHandler?: AssistantDelegateHandler,
): AnyAgentTool[] {
  const tools: AnyAgentTool[] = [
    createNovelConfigTool(language, rendererAction),
    createStoryArchitectureTool(language, rendererAction),
    createReadArchitectureTool(language),
    createReadBlueprintTool(language),
    createManageDraftsTool(language, rendererAction, { readOnly: true }),
    createManageReviewReportsTool(language, rendererAction),
    createDeleteReviewReportTool(language, rendererAction),
    createReadProjectStateTool(language),
    createReadNarrativeThreadsTool(language),
    createManageNarrativeThreadsTool(language),
    createSearchKnowledgeTool(language),
    createManageKnowledgeBaseTool(language),
    createReadFileTool(language),
    createListFilesTool(language),
    createOpenEditorTool(language, rendererAction),
    createProposeChapterBlueprintTool(language, rendererAction),
    createManageCharactersTool(language, rendererAction),
    createManageMcpTool(language),
    createWebFetchTool(language),
    createManageSkillsTool(language, skills, skillRoots),
    ...buildMcpAgentTools(language),
  ]

  if (delegateHandler) {
    tools.push(createDelegateToAssistantTool(language, delegateHandler, rendererAction))
  }

  return tools.map(withExecutionMode)
}

/**
 * Build the tools dedicated to the Architecture Assistant.
 *
 * 架构助手专属工具集：聚焦于故事大纲、世界观设定、小说全局配置、人物体系与章节蓝图。
 * 严禁挂载底层破坏性写工具（write/edit/bash）与正文草稿工具（manage_drafts）。
 */
export function buildArchitectAgentTools(
  language: WritingLanguage,
  rendererAction: RendererActionSink,
  options: AssistantToolKitOptions = {},
): AnyAgentTool[] {
  return [
    createNovelConfigTool(language, rendererAction),
    createStoryArchitectureTool(language, rendererAction),
    createReadArchitectureTool(language),
    createReadBlueprintTool(language),
    createReadProjectStateTool(language),
    createReadNarrativeThreadsTool(language),
    createManageNarrativeThreadsTool(language),
    createSearchKnowledgeTool(language),
    createManageKnowledgeBaseTool(language),
    createReadFileTool(language),
    createListFilesTool(language),
    createOpenEditorTool(language, rendererAction),
    createProposeChapterBlueprintTool(language, rendererAction),
    createManageCharactersTool(language, rendererAction),
    createWebFetchTool(language),
    createManageSkillsTool(language, options.skills ?? [], options.skillRoots ?? [], {
      assistantType: 'architect',
    }),
  ].map(withExecutionMode)
}

/**
 * Build the tools dedicated to the Chapter Blueprint Assistant.
 *
 * 章节蓝图助手专属工具集：专注章节蓝图推演与落盘、前文状态感知、人物与世界观读取。
 * 严禁挂载底层写工具与正文草稿修改工具。
 */
export function buildBlueprintAgentTools(
  language: WritingLanguage,
  rendererAction: RendererActionSink,
  options: AssistantToolKitOptions = {},
): AnyAgentTool[] {
  return [
    createProposeChapterBlueprintTool(language, rendererAction),
    createReadBlueprintTool(language),
    createReadContinuityFactsTool(language),
    createReadNarrativeThreadsTool(language),
    createReadProjectStateTool(language),
    createReadArchitectureTool(language),
    createManageCharactersTool(language, rendererAction),
    createSearchKnowledgeTool(language),
    createReadFileTool(language),
    createListFilesTool(language),
    createOpenEditorTool(language, rendererAction),
    createWebFetchTool(language),
    createManageSkillsTool(language, options.skills ?? [], options.skillRoots ?? [], {
      assistantType: 'blueprint',
    }),
  ].map(withExecutionMode)
}

/**
 * Build the tools dedicated to the Chapter Review Assistant.
 *
 * 审稿助手是只读审查角色：只能读取草稿、设定、蓝图、连续性事实与知识库，
 * 唯一的写工具是把审稿结论落成审稿报告。不挂执行工具，也不挂任何正文/设定写工具。
 */
export function buildReviewAgentTools(
  language: WritingLanguage,
  rendererAction: RendererActionSink,
  options: AssistantToolKitOptions = {},
): AnyAgentTool[] {
  return [
    createReadProjectStateTool(language),
    createReadArchitectureTool(language),
    createReadBlueprintTool(language),
    createReadContinuityFactsTool(language),
    createReadNarrativeThreadsTool(language),
    createManageDraftsTool(language, rendererAction, { readOnly: true }),
    createManageCharactersTool(language, rendererAction, { readOnly: true }),
    createSearchKnowledgeTool(language),
    createReadFileTool(language),
    createListFilesTool(language),
    createOpenEditorTool(language, rendererAction),
    // 报告写入后必须能读回：审稿助手也挂报告读取工具。
    createManageReviewReportsTool(language, rendererAction),
    createSubmitChapterReviewTool(language, rendererAction),
    // 审稿助手可以维护技能（技能库写入不属于项目事实修改）。
    createManageSkillsTool(language, options.skills ?? [], options.skillRoots ?? [], {
      assistantType: 'review',
    }),
  ].map(withExecutionMode)
}

/**
 * Build the tools dedicated to the Prose Writing Assistant.
 *
 * 写作助手专属工具集：专注章节正文写作、局部精修与批注处理，同时可维护人物档案与伏笔线索。
 * 严禁修改小说配置、故事架构、章节蓝图或审稿报告，也不挂载底层 bash/write/edit 工具。
 */
export function buildWriterAgentTools(
  language: WritingLanguage,
  rendererAction: RendererActionSink,
  options: AssistantToolKitOptions = {},
): AnyAgentTool[] {
  return [
    createReadProjectStateTool(language),
    createReadArchitectureTool(language),
    createReadBlueprintTool(language),
    createReadContinuityFactsTool(language),
    createReadNarrativeThreadsTool(language),
    createManageNarrativeThreadsTool(language),
    createManageDraftsTool(language, rendererAction),
    createManageCharactersTool(language, rendererAction),
    createSearchKnowledgeTool(language),
    createReadFileTool(language),
    createListFilesTool(language),
    createOpenEditorTool(language, rendererAction),
    createWebFetchTool(language),
    createManageSkillsTool(language, options.skills ?? [], options.skillRoots ?? [], {
      assistantType: 'writer',
    }),
  ].map(withExecutionMode)
}

export interface AssistantToolKitOptions {
  skills?: readonly AgentSkillCatalogEntry[]
  skillRoots?: readonly string[]
  delegateHandler?: AssistantDelegateHandler
}

/** 助手类型到工具集的唯一分发点：五个助手各有一套职责边界。 */
export function buildToolsForAssistantType(
  assistantType: AssistantType,
  language: WritingLanguage,
  rendererAction: RendererActionSink,
  options: AssistantToolKitOptions = {},
): AnyAgentTool[] {
  const tools = buildAssistantToolSet(assistantType, language, rendererAction, options)
  // 只有写作助手能真正写草稿；读账本对所有角色都记，校验只在写草稿的回合生效。
  return withSourceFreshnessGuard(tools, language, { enforceDraftWrites: assistantType === 'writer' })
}

function buildAssistantToolSet(
  assistantType: AssistantType,
  language: WritingLanguage,
  rendererAction: RendererActionSink,
  options: AssistantToolKitOptions,
): AnyAgentTool[] {
  const visibleSkills = filterAgentSkillCatalog(options.skills ?? [], assistantType)
  switch (assistantType) {
    case 'architect':
      return buildArchitectAgentTools(language, rendererAction, { ...options, skills: visibleSkills })
    case 'blueprint':
      return buildBlueprintAgentTools(language, rendererAction, { ...options, skills: visibleSkills })
    case 'writer':
      return buildWriterAgentTools(language, rendererAction, { ...options, skills: visibleSkills })
    case 'review':
      return buildReviewAgentTools(language, rendererAction, { ...options, skills: visibleSkills })
    case 'general':
      return buildAgentTools(
        language,
        rendererAction,
        visibleSkills,
        options.skillRoots ?? [],
        options.delegateHandler,
      )
  }
}

const DRAFT_CONTENT_MUTATIONS: ReadonlySet<DraftAction> = new Set<DraftAction>(['write', 'replace_excerpt'])

function resolveDraftMutation(params: Record<string, unknown>): DraftAction {
  return resolveDraftAction(String(params.action ?? 'read').toLowerCase().trim())
}

function requiredDraftWriteReads(chapterNumber: number, language: WritingLanguage) {
  const params = { chapter_number: chapterNumber }
  const request: SourceReadRequest = { toolName: 'read_blueprint', params }
  return [{ request, label: describeSourceRead('read_blueprint', params, language) }]
}

function freshnessRefusalResult(violations: readonly FreshnessViolation[], language: WritingLanguage) {
  return {
    content: [{ type: 'text' as const, text: formatFreshnessRefusal(violations, language) }],
    details: { status: 'refused', reason: 'stale-source-facts', violations },
  }
}

/**
 * 给工具集套上源信息新鲜度守卫。
 *
 * 追踪的读取工具在成功返回后登记输出指纹；写作助手写草稿前，守卫会重新执行
 * 这些读取并比对：目标章节蓝图没读过、或读过的任一源信息已经变了，就直接拒绝
 * 写入（草稿一字不动），把“哪条信息变了、该重新读什么”返回给模型。
 *
 * 写工具执行成功后会刷新账本基线，避免助手把自己刚写的改动误判为外部变更。
 */
export function withSourceFreshnessGuard(
  tools: readonly AnyAgentTool[],
  language: WritingLanguage,
  wiring: { enforceDraftWrites: boolean },
): AnyAgentTool[] {
  const originals = new Map(tools.map(tool => [tool.name, tool]))
  const guard = new SourceFreshnessGuard({
    reread: async (request) => {
      const tool = originals.get(request.toolName)
      if (!tool) throw new Error(`Source freshness cannot re-read ${request.toolName}`)
      const result = await tool.execute('source-freshness-reread', request.params as never)
      return toolResultText(result)
    },
  })

  return tools.map(tool => {
    if (!SOURCE_FRESHNESS_TRACKED_READS.has(tool.name)) return tool
    return {
      ...tool,
      execute: async (toolCallId: string, params: unknown) => {
        const record = (params ?? {}) as Record<string, unknown>
        const isDraftTool = tool.name === 'manage_drafts'
        const draftMutation = isDraftTool ? resolveDraftMutation(record) : null
        const writes = Boolean(tool.isWriteOperation?.(record))
          || (draftMutation !== null && draftMutation === 'resolve_annotation')

        if (isDraftTool && wiring.enforceDraftWrites && draftMutation !== null && DRAFT_CONTENT_MUTATIONS.has(draftMutation)) {
          const chapterNumber = Number(record.chapter_number)
          const violations = Number.isInteger(chapterNumber) && chapterNumber > 0
            ? await guard.inspect(requiredDraftWriteReads(chapterNumber, language))
            : []
          if (violations.length > 0) return freshnessRefusalResult(violations, language)
        }

        const result = await tool.execute(toolCallId, params as never)
        if (writes) {
          await guard.rebaseline()
        } else {
          guard.record(
            { toolName: tool.name, params: record },
            describeSourceRead(tool.name, record, language),
            toolResultText(result),
          )
        }
        return result
      },
    } satisfies AnyAgentTool
  })
}

/**
 * Write tools that must be confirmed by the user before execution.
 *
 * `write` / `edit` / `bash` 是 Pi harness 自带的执行工具：它们能改文件、
 * 能跑命令，所以和领域写工具一样逐次确认。
 */
export function confirmationToolNames(): ReadonlySet<string> {
  return new Set([
    'write',
    'edit',
    'bash',
    'open_editor',
    'manage_drafts',
    'novel_config',
    'story_architecture',
    'propose_chapter_blueprint',
    'manage_characters',
    'manage_narrative_threads',
    'manage_mcp',
    'manage_skills',
    'manage_knowledge_base',
    'submit_chapter_review',
    'delete_review_report',
    'delegate_to_assistant',
  ])
}
