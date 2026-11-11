import type { AssistantType } from '../../shared/agent-conversation-archive'
import { writingLanguageText, type WritingLanguage } from '../../shared/writing-language'
import { renderPrompt, type PromptTemplate } from '../prompt-templates-core'

/** 五个助手共用的软件硬规则模板。 */
export const ASSISTANT_HARD_RULES_KEY = 'assistant_hard_rules'
/** 主助手身份模板（历史 key，保持不变）。 */
export const ASSISTANT_WRITING_IDENTITY_KEY = 'assistant_writing_identity'
export const ASSISTANT_ARCHITECT_IDENTITY_KEY = 'assistant_architect_identity'
export const ASSISTANT_BLUEPRINT_IDENTITY_KEY = 'assistant_blueprint_identity'
export const ASSISTANT_WRITER_IDENTITY_KEY = 'assistant_writer_identity'
export const ASSISTANT_REVIEW_IDENTITY_KEY = 'assistant_review_identity'
/** 各助手的工作规范（主助手为协同规范，专门助手为职责边界）。 */
export const ASSISTANT_WRITING_WORK_RULES_KEY = 'assistant_writing_work_rules'
export const ASSISTANT_ARCHITECT_WORK_RULES_KEY = 'assistant_architect_work_rules'
export const ASSISTANT_BLUEPRINT_WORK_RULES_KEY = 'assistant_blueprint_work_rules'
export const ASSISTANT_WRITER_WORK_RULES_KEY = 'assistant_writer_work_rules'
export const ASSISTANT_REVIEW_WORK_RULES_KEY = 'assistant_review_work_rules'

export interface AssistantPromptKeys {
  identityKey: string
  workRulesKey: string
}

/** 助手类型 → 该助手自己的身份与工作规范模板 key。 */
export function assistantPromptKeys(assistantType: AssistantType): AssistantPromptKeys {
  switch (assistantType) {
    case 'architect':
      return {
        identityKey: ASSISTANT_ARCHITECT_IDENTITY_KEY,
        workRulesKey: ASSISTANT_ARCHITECT_WORK_RULES_KEY,
      }
    case 'blueprint':
      return {
        identityKey: ASSISTANT_BLUEPRINT_IDENTITY_KEY,
        workRulesKey: ASSISTANT_BLUEPRINT_WORK_RULES_KEY,
      }
    case 'writer':
      return {
        identityKey: ASSISTANT_WRITER_IDENTITY_KEY,
        workRulesKey: ASSISTANT_WRITER_WORK_RULES_KEY,
      }
    case 'review':
      return {
        identityKey: ASSISTANT_REVIEW_IDENTITY_KEY,
        workRulesKey: ASSISTANT_REVIEW_WORK_RULES_KEY,
      }
    case 'general':
    default:
      return {
        identityKey: ASSISTANT_WRITING_IDENTITY_KEY,
        workRulesKey: ASSISTANT_WRITING_WORK_RULES_KEY,
      }
  }
}

/**
 * Pi-specific operating note interpolated into `{{mode_instruction}}`.
 * Creative role/guidance still come from the settings template.
 */
export function appShellModeInstruction(language: WritingLanguage): string {
  return writingLanguageText(
    language,
    '本轮作者消息内附带应用自动生成的界面状态（位于 system_context 标签内，不是作者的发言）。请以该状态为准；未打开项目时不要假装能读写该书。不要编造项目事实。',
    'The current author message carries app-attached interface state inside the system_context block (it is not an author message). Treat that state as authoritative. If no project is open, do not pretend you can read or write the book. Do not invent project facts.',
  )
}

/**
 * 渲染「助手身份」模块：角色 + 正文（含 {{mode_instruction}} 插值）。
 *
 * 不再自动追加内部系统合同——安全底线由共享的「软件硬规则」模块提供，
 * 这样身份模块可以被作者完整编辑而不产生隐藏文本。
 */
export function renderAssistantIdentity(
  template: PromptTemplate,
  writingLanguage: WritingLanguage,
  modeInstruction: string,
): string {
  const role = template.systemRole?.trim() ?? ''
  const body = renderPrompt(template, { mode_instruction: modeInstruction }, writingLanguage)
  return [role, body].filter(part => part.length > 0).join('\n\n')
}

/** 渲染「软件硬规则 / 工作规范」模块：只有正文，没有角色段落。 */
export function renderAssistantRules(
  template: PromptTemplate,
  writingLanguage: WritingLanguage,
): string {
  return renderPrompt(template, {}, writingLanguage).trim()
}
