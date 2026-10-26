import type { AgentTool } from '@earendil-works/pi-agent-core'
import { Type, StringEnum } from '@earendil-works/pi-ai'
import { writingLanguageText, type WritingLanguage } from '../../../src/shared/writing-language'

export type DelegatableAssistantType = 'architect' | 'blueprint' | 'review'

export type AssistantDelegateHandler = (params: {
  target: DelegatableAssistantType
  task: string
  chapter_number?: number
  instructions?: string
}) => Promise<{
  success: boolean
  result?: string
  conversationId?: string
  error?: string
}>

const AssistantEnum = StringEnum([
  'architect',
  'blueprint',
  'review',
] as const, {
  description: '目标助手："architect"（架构助手，专职世界观/核心设定/全书分卷大纲与战力体系）、"blueprint"（章节蓝图助手，专职单章细纲/场景节拍/出场人物与章末悬念）或 "review"（审稿助手，专职章节草稿质量审查、前后文矛盾与伏笔排查、章节目标验收与审稿报告出具）',
})

const Schema = Type.Object({
  assistant: AssistantEnum,
  task: Type.String({
    description: '分配给目标助手的核心指令或推演目标（例如：审查草稿、规划细纲、扩充魔道宗门体系）。传递核心意图即可，严禁在此复制草稿正文、大纲或世界观设定；所有助手共享底层数据库，目标助手会自动调用其专属工具读取最新事实。',
  }),
  chapter_number: Type.Optional(Type.Integer({
    minimum: 1,
    description: '目标章节号（可选）。当任务针对具体章节时提供（例如审查第N章草稿、规划第N章细纲）。目标助手将以此指针直接查取草稿、蓝图与连续性事实。',
  })),
  instructions: Type.Optional(Type.String({
    description: '作者提出的额外特殊要求、重点侧重维度或风格约束（可选，例如"重点关注打斗节奏"、"排查玉佩设定的前后矛盾"）。仅传递指示与关注点，严禁复制大段前文背景。',
  })),
})

export function createDelegateToAssistantTool(
  language: WritingLanguage,
  handler: AssistantDelegateHandler,
): AgentTool<typeof Schema> {
  const isEn = language === 'en-US'
  return {
    name: 'delegate_to_assistant',
    label: isEn ? 'Delegate to Assistant' : '委派助手任务',
    description: writingLanguageText(
      language,
      '向专门领域助手（架构助手、章节蓝图助手或审稿助手）委派专门任务并获取执行结果。所有助手共享项目权威数据库并自带专属读取工具。委派时遵守【指针传递】原则：仅需指定目标助手、核心任务、目标章节（chapter_number，如适用）以及作者的关注重点（instructions）。严禁在此复制大段正文或设定，目标助手会以专业角色自行调用工具精准调取事实并深入推演。',
      'Delegate a dedicated task to the Architecture Assistant, Chapter Blueprint Assistant, or Review Assistant and retrieve their response. All assistants share the project authoritative database and possess dedicated tools. Follow the "Pass Pointers, Not Payloads" principle: supply only the target assistant, core task, chapter_number (if applicable), and author focus instructions. Never copy draft text or settings into the parameters; the target assistant will query the database directly using its own tools.',
    ),
    parameters: Schema,
    isWriteOperation: () => true,
    execute: async (_callId, params) => {
      const target = params.assistant
      const targetLabel = target === 'architect'
        ? (isEn ? 'Architecture Assistant' : '架构助手')
        : target === 'blueprint'
          ? (isEn ? 'Chapter Blueprint Assistant' : '蓝图助手')
          : (isEn ? 'Review Assistant' : '审稿助手')

      const response = await handler({
        target,
        task: params.task,
        chapter_number: params.chapter_number,
        instructions: params.instructions,
      })

      if (!response.success || !response.result) {
        throw new Error(
          response.error || (isEn ? `Failed to delegate task to ${targetLabel}` : `向${targetLabel}委派任务失败`),
        )
      }

      const guidance = writingLanguageText(
        language,
        `\n\n[系统协同提示：成果已由${targetLabel}直接调用工具在主工作区打开呈现。向作者汇报时，请保持极简卡片式导读（3-5句话概括核心结论，严禁在对话框长篇复读清单），明确引导作者直接在主界面的主工作区面板中查阅与交互操作。]`,
        `\n\n[System Coordination Note: The deliverable has been opened in the main workspace by the ${targetLabel}. When reporting to the author, provide a concise qualitative overview (3-5 sentences; do NOT restate lengthy checklists in the chat), and guide the author to view details directly in the main workspace.]`,
      )

      return {
        content: [{
          type: 'text',
          text: writingLanguageText(
            language,
            `【${targetLabel}已完成任务】\n\n${response.result}${guidance}`,
            `[${targetLabel} completed the task]\n\n${response.result}${guidance}`,
          ),
        }],
        details: {
          assistant: target,
          conversationId: response.conversationId,
          result: response.result,
        },
      }
    },
  }
}
