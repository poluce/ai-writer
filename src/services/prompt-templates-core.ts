/**
 * Prompt 组合核心 — 环境无关的纯函数模块。
 *
 * 只依赖 src/shared、src/prompts 数据与 i18n 类型，不依赖渲染端 IPC 或任何
 * UI。主进程（electron/pi 的系统提示词装配）与渲染端共用本模块；
 * 渲染端的持久化生命周期（全局/项目级覆盖）在 prompt-templates.ts 门面中。
 */

import type { Locale } from '../i18n/types'
import type { WritingLanguage } from '../shared/writing-language'
import { resolveWritingLanguage } from '../shared/writing-language'
import { internalPrompt } from '../prompts/internal/load'
import { BUILTIN_PROMPTS, EN_US_BUILTIN_PROMPTS } from '../prompts/load'
import { isCoreLocalizedBuiltinPromptKey } from '../prompts/manifest'
import type { PromptLanguageOverlay, PromptTemplate } from '../prompts/types'

/**
 * Prompt 正文保持原始创作语言；这里只维护设置页会显示的变量说明。
 * 以变量名集中索引，便于自动检查所有可编辑模板是否都有英文 UI 文案。
 */
export const PROMPT_VARIABLE_DESCRIPTIONS_EN: Readonly<Record<string, string>> = Object.freeze({
  existing_config: 'Existing author-confirmed novel configuration',
  field_label: 'Requested configuration field',
  field_requirements: 'Field-specific guidance',
  edit_instruction: 'Author request for the selected prose',
  selected_text: 'Selected prose from the editor',
  user_idea: 'Idea or premise provided by the author',
  number_of_chapters: 'Planned total number of chapters',
  word_number: 'Target words per chapter',
  genre: 'Novel genre',
  sub_genre: 'Novel subgenre',
  topic: 'Core theme or story summary',
  target_audience: 'Target audience',
  core_setting: 'Core world setting',
  golden_finger: 'Special advantage or progression system',
  protagonist_profile: 'Protagonist profile',
  global_guidance: 'Global writing guidance',
  step_guidance: 'Additional guidance for this step (optional)',
  reference_works: 'Reference works (optional)',
  novel_config: 'Author-confirmed novel configuration',
  premise: 'Story premise',
  world_building: 'World setting',
  character_dynamics: 'Character map',
  plot_structure_guide: 'Plot-structure guide',
  narrative_pov: 'Narrative point of view',
  architecture: 'Story architecture',
  chapter_info: 'Chapter information (JSON)',
  future_blueprints: 'Future chapter blueprints',
  writing_style: 'Writing style (optional)',
  user_guidance: 'Author guidance for this chapter (optional)',
  global_summary: 'Chapter timeline summary',
  character_states: 'Character states',
  short_summary: 'Recent chapter summary',
  previous_ending: 'Last 800 characters of the previous chapter',
  filtered_context: 'Knowledge-base search results',
  draft_content: 'Chapter draft',
  user_refine_prompt: 'Author revision guidance (optional)',
  chapter_content: 'Chapter content',
  review_focus: 'Review areas requested by the author (optional)',
  sample_text: 'Writing sample (3–5 chapters)',
  review_report: 'Review report',
  novel_architecture: 'Complete story architecture',
  chapter_list: 'Existing chapter blueprint list',
  n: 'Starting chapter number for this segment',
  m: 'Ending chapter number for this segment',
  pacing_guidance: 'Author pacing guidance (optional)',
  chapter_number: 'Chapter number',
  chapter_title: 'Chapter title',
  existing_cards_json: 'Existing character records as JSON',
  sample_content: 'Imported manuscript sample',
  novel_config_summary: 'Established novel configuration summary',
  sampled_worldview: 'Retrieved world-building evidence',
  sampled_protagonist: 'Retrieved protagonist evidence',
  sampled_conflict: 'Retrieved conflict evidence',
  sampled_style: 'Retrieved prose-style evidence',
  first_chapter: 'Opening chapter sample',
  latest_chapter: 'Latest chapter sample',
  total_chapters: 'Existing number of chapters',
  mode_instruction: 'Current assistant mode instruction',
})

export function getPromptVariableDescription(
  template: Pick<PromptTemplate, 'variables'>,
  variableName: string,
  locale: Locale,
): string {
  const zhDescription = template.variables[variableName] ?? variableName
  if (locale === 'zh-CN') return zhDescription
  return PROMPT_VARIABLE_DESCRIPTIONS_EN[variableName] ?? variableName.replaceAll('_', ' ')
}

/** Immutable system contract appended after the editable creative role. */
export function composePromptSystemRole(
  template: Pick<PromptTemplate, 'systemRole'>,
  writingLanguage: WritingLanguage,
): string {
  const role = template.systemRole?.trim()
  const contract = internalPrompt('immutable_system_contract', writingLanguage)
  return role ? `${role}\n\n${contract}` : contract
}

const OPTIONAL_PROMPT_LABEL_PATTERN = [
  '★【[^】]*】★[：:]',
  '【[^】]*（如有[^）]*）[^】]*】',
  '【(?:作者补充指导|作者节奏\\/风格指导|作者要求重点检查的维度)】',
].join('|')

/**
 * 清理可选变量为空时留下的提示词标签。
 * 只删除“标签后立即是空行或文本末尾”的可选标签；如果作者确实填写了指导内容，标签与内容会保留。
 */
export function pruneEmptyOptionalPromptSections(content: string): string {
  return content
    .replace(new RegExp(`^\\s*(?:${OPTIONAL_PROMPT_LABEL_PATTERN})\\s*\\r?\\n[ \\t]*(?=\\r?\\n|$)`, 'gm'), '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '')
}

/** 全部内置 Prompt 模板 */
/**
 * 内置提示词正文已外置：
 *   正文 → `src/prompts/zh-CN/*.md`、`src/prompts/en-US/*.md`
 *   结构 → `src/prompts/manifest.ts`
 *   加载 → `src/prompts/load.ts`（构建期内联，等价 Qt 的 .qrc）
 * 这里只做转发，保持既有导入路径不变。
 */
export { BUILTIN_PROMPTS, EN_US_BUILTIN_PROMPTS } from '../prompts/load'
export {
  EDITABLE_PROMPT_KEYS,
  CORE_LOCALIZED_BUILTIN_PROMPT_KEYS,
  isCoreLocalizedBuiltinPromptKey,
} from '../prompts/manifest'
export type { PromptLanguageOverlay, PromptTemplate } from '../prompts/types'

/** Resolve only model-facing built-ins through the project's writing language. */
export function getBuiltinPromptTemplate(
  key: string,
  writingLanguage: WritingLanguage,
): PromptTemplate | undefined {
  const builtin = BUILTIN_PROMPTS.find(template => template.key === key)
  if (!builtin) return undefined
  if (resolveWritingLanguage(writingLanguage) !== 'en-US') return builtin
  const translated: PromptLanguageOverlay | undefined = EN_US_BUILTIN_PROMPTS[key]
  if (!translated && isCoreLocalizedBuiltinPromptKey(key)) {
    throw new Error(`Missing en-US built-in prompt contract: ${key}`)
  }
  return translated ? { ...builtin, ...translated } : builtin
}

/** Appends only authoritative values that a custom prompt body omitted. */
export function appendRequiredPromptContext(
  content: string,
  template: PromptTemplate,
  variables: Record<string, string>,
  writingLanguage: WritingLanguage,
): string {
  const builtinTemplate = getBuiltinPromptTemplate(template.key, writingLanguage)
  const referencedSources = [
    template.content,
    template.taskGuidance ?? '',
    builtinTemplate?.systemSuffix ?? '',
  ]
  const requiredContext = (builtinTemplate?.requiredContextVariables ?? [])
    .filter(key => !referencedSources.some(source => source.includes(`{{${key}}}`)))
    .flatMap((key) => {
      const value = variables[key]?.trim()
      if (!value || !builtinTemplate) return []
      return [`${getPromptVariableDescription(builtinTemplate, key, writingLanguage)}:\n${value}`]
    })
  if (requiredContext.length === 0) return content
  const heading = writingLanguage === 'en-US'
    ? '[Authoritative project context omitted by the custom template — must still be followed]'
    : '【自定义模板未引用但仍必须遵循的权威项目设定】'
  return `${content}\n\n${heading}\n${requiredContext.join('\n\n')}`
}

/** Render only the editable creative guidance, without the template body or hidden output suffix. */
export function renderPromptTaskGuidance(
  template: Pick<PromptTemplate, 'taskGuidance'>,
  variables: Record<string, string>,
  writingLanguage: WritingLanguage,
): string {
  if (!template.taskGuidance?.trim()) return ''
  let guidance = template.taskGuidance
  for (const [key, value] of Object.entries(variables)) {
    guidance = guidance.replaceAll(`{{${key}}}`, value)
  }
  const heading = writingLanguage === 'en-US'
    ? '[User-defined creative guidance]'
    : '【用户自定义创作指导】'
  return `${heading}\n${guidance.trim()}`
}

/** 渲染 Prompt 模板（填充变量 + 自动追加内置 systemSuffix + 空段落裁剪） */
export function renderPrompt(
  template: PromptTemplate,
  variables: Record<string, string>,
  writingLanguage: WritingLanguage,
): string {
  let content = template.content
  for (const [key, value] of Object.entries(variables)) {
    content = content.replaceAll(`{{${key}}}`, value)
  }

  const taskGuidance = renderPromptTaskGuidance(template, variables, writingLanguage)
  if (taskGuidance) content += `\n\n${taskGuidance}`

  // 自动追加系统约束（始终从内置模板获取，不受用户自定义影响）
  const builtinTemplate = getBuiltinPromptTemplate(template.key, writingLanguage)
  const suffix = builtinTemplate?.systemSuffix
  if (suffix) {
    let renderedSuffix = suffix
    for (const [key, value] of Object.entries(variables)) {
      renderedSuffix = renderedSuffix.replaceAll(`{{${key}}}`, value)
    }
    content = content + '\n\n' + renderedSuffix
  }

  return pruneEmptyOptionalPromptSections(
    appendRequiredPromptContext(content, template, variables, writingLanguage),
  )
}