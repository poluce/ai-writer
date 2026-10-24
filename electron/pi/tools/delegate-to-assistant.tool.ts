import type { AgentTool } from '@earendil-works/pi-agent-core'
import { Type, StringEnum } from '@earendil-works/pi-ai'
import { writingLanguageText, type WritingLanguage } from '../../../src/shared/writing-language'

export type DelegatableAssistantType = 'architect' | 'blueprint' | 'review'

export type AssistantDelegateHandler = (params: {
  target: DelegatableAssistantType
  task: string
  context?: string
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
    description: '分配给目标助手的具体任务内容与推演目标（例如让架构助手完善某门派设定，让蓝图助手规划第N章细纲，或让审稿助手审查第N章草稿）',
  }),
  context: Type.Optional(Type.String({
    description: '可选的补充背景信息、前文事实或对该任务的具体要求',
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
      '向专门领域助手（架构助手、章节蓝图助手或审稿助手）委派专门任务并获取执行结果。当你需要推演宏观世界观、主线大纲、设定与战力体系时，委派给架构助手（assistant: "architect"）；当你需要规划具体章节细纲、场景节拍、出场人物与章末悬念时，委派给蓝图助手（assistant: "blueprint"）；当你需要对某一章节草稿进行质量审查、排查前后文矛盾、验收章节目标或出具审稿报告时，委派给审稿助手（assistant: "review"）。目标助手在收到任务后会以其专业角色进行深入推演，并可主动调用其专属工具（如修改设定、写入章节细纲或提交审稿报告）。',
      'Delegate a dedicated task to the Architecture Assistant, Chapter Blueprint Assistant, or Review Assistant and retrieve their response. Delegate to "architect" for macro premise, synopsis, worldbuilding, and power systems; delegate to "blueprint" for concrete chapter blueprints, scene beats, and cliffhangers; delegate to "review" for chapter draft quality audit, continuity and foreshadowing checks, chapter goal verification, or review reports. The target assistant will deduce thoroughly using its specialized domain tools.',
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
        context: params.context,
      })

      if (!response.success || !response.result) {
        throw new Error(
          response.error || (isEn ? `Failed to delegate task to ${targetLabel}` : `向${targetLabel}委派任务失败`),
        )
      }

      return {
        content: [{
          type: 'text',
          text: writingLanguageText(
            language,
            `【${targetLabel}已完成任务】\n\n${response.result}`,
            `[${targetLabel} completed the task]\n\n${response.result}`,
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
