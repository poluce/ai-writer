import { writingLanguageText, type WritingLanguage } from '../shared/writing-language'

/** 内置提示词正文与结构已外置到 src/prompts/；这里只转发，保持既有导入路径。 */
export { EN_US_BUILTIN_PROMPTS } from '../prompts/load'
export {
  CORE_LOCALIZED_BUILTIN_PROMPT_KEYS,
  isCoreLocalizedBuiltinPromptKey,
} from '../prompts/manifest'
export type { CoreLocalizedBuiltinPromptKey } from '../prompts/manifest'

/**
 * Model-facing built-in prompt translations. UI copy is deliberately absent:
 * the project writing language, not the application locale, selects this map.
 */
export function promptLanguageText(
  language: WritingLanguage,
  zhCNText: string,
  enUSText: string,
): string {
  return writingLanguageText(language, zhCNText, enUSText)
}
