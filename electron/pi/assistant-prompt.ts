import type { AssistantType } from '../../src/shared/agent-conversation-archive'
import type { WritingLanguage } from '../../src/shared/writing-language'
import {
  ASSISTANT_HARD_RULES_KEY,
  appShellModeInstruction,
  assistantPromptKeys,
  renderAssistantIdentity,
  renderAssistantRules,
} from '../../src/services/agent/assistant-identity'
import type { AssistantPromptBlocks } from './agent-system-prompt'
import { loadAssistantPromptModule, type AssistantPromptLoadOptions } from './assistant-identity-loader'

/**
 * 解析一个助手的三块可编辑提示词（硬规则 / 身份 / 工作规范）。
 *
 * 每一块都按「项目覆盖 → 全局覆盖 → 内置默认」取模板并渲染；
 * 技能目录与项目信息由 `buildAssistantSystemPrompt` 自动追加。
 */
export function resolveAssistantPromptBlocks(
  assistantType: AssistantType,
  language: WritingLanguage,
  options: AssistantPromptLoadOptions = {},
): AssistantPromptBlocks {
  const keys = assistantPromptKeys(assistantType)
  const load = (key: string) => loadAssistantPromptModule(key, language, options)
  return {
    hardRules: renderAssistantRules(load(ASSISTANT_HARD_RULES_KEY), language),
    identity: renderAssistantIdentity(
      load(keys.identityKey),
      language,
      appShellModeInstruction(language),
    ),
    workRules: renderAssistantRules(load(keys.workRulesKey), language),
  }
}
