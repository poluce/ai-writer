import { formatSkillsForSystemPrompt, type Skill } from '@earendil-works/pi-agent-core'

import {
  AGENT_SKILL_DESCRIPTION_MAX_CHARS,
  type AgentSkillCatalogEntry,
} from '../../src/shared/agent-skills'
import { localizeNovelConfigFacts } from '../../src/shared/novel-config-localization'
import {
  goldenFingerForPrompt,
  isGoldenFingerEnabled,
} from '../../src/shared/novel-config-generation'
import { writingLanguageText, type WritingLanguage } from '../../src/shared/writing-language'
import type { ProjectCoreData } from '../repositories/project-core-repository'

/** 助手系统提示的三个可编辑块；项目信息与技能目录由系统自动装配。 */
export interface AssistantPromptBlocks {
  /** 五个助手共用的软件硬规则。 */
  hardRules: string
  /** 当前助手的身份（已包含 {{mode_instruction}} 插值结果）。 */
  identity: string
  /** 当前助手的工作规范。 */
  workRules: string
}

/**
 * 五助手共用的系统提示装配器。
 *
 * 顺序在代码里固定，UI 不允许调整：
 * 软件硬规则 → 助手身份 → 工作规范 → 技能目录 → 项目信息。
 * 空块会被跳过，但相对顺序不变。
 */
export function buildAssistantSystemPrompt(
  blocks: AssistantPromptBlocks,
  core: ProjectCoreData | null,
  skills?: readonly AgentSkillCatalogEntry[],
): string {
  const language: WritingLanguage = core?.writingLanguage ?? 'zh-CN'
  const l0 = buildAssistantProjectFactsBlock(core, language)
  const skillCatalog = buildAssistantSkillCatalogBlock(skills, language)
  return [blocks.hardRules, blocks.identity, blocks.workRules, skillCatalog, l0]
    .map(part => part?.trim() ?? '')
    .filter((part): part is string => part.length > 0)
    .join('\n\n')
}

/**
 * Pi's own skill listing (name / description / location) plus the two facts
 * Pi cannot know: in this app skills are not read by the assistant, they take
 * effect through `/技能名` and workflow stage bindings only.
 */
export function buildAssistantSkillCatalogBlock(
  skills: readonly AgentSkillCatalogEntry[] | undefined,
  language: WritingLanguage,
): string | null {
  if (!skills || skills.length === 0) return null
  const block = formatSkillsForSystemPrompt(skills.map(toPiSkill))
  if (!block) return null
  return `${block}\n\n${skillInvocationNote(language)}`
}

function toPiSkill(entry: AgentSkillCatalogEntry): Skill {
  return {
    name: entry.name,
    description: entry.description.slice(0, AGENT_SKILL_DESCRIPTION_MAX_CHARS),
    // Pi only reads `content` for explicit invocation; this listing never
    // carries skill bodies into the system prompt.
    content: '',
    filePath: entry.location,
    disableModelInvocation: entry.disableModelInvocation,
  }
}

function skillInvocationNote(language: WritingLanguage): string {
  return writingLanguageText(
    language,
    [
      '技能自动加载与按需执行规则：',
      '- 目录里只有技能名与描述。当任务或用户意图与某个技能的描述相符时，先用 manage_skills（action: "load"）读出正文，再按正文自动执行，为用户提供自动化的专家体验。',
      '- 当用户需要管理技能（查看列表、创建自定义技能、修改技能内容、删除技能、检查或安装远程技能）时，使用统一的 manage_skills 工具。',
      '- 用户在输入框输入 `/技能名` 时，正文已经注入到那一轮消息，不需要再读；技能纯粹作为工具按需调用，全书底层文风由项目设定的写作风格（writingStyle）统一规范。',
      '- 不要用 read_file 去读技能文件：用户级技能在项目目录之外，会被拒绝。',
      '- 必须主动自动加载执行，避免让用户重复手动输入；仅在向用户汇报或推荐时才提 `/技能名`。',
    ].join('\n'),
    [
      'Read skill instructions on demand instead of guessing from a description:',
      '- The listing carries only names and descriptions. When a task matches a skill description, load its body with manage_skills (action: "load") first and then follow it automatically.',
      '- When managing skills (listing, creating, updating, deleting, inspecting, or installing), use the manage_skills tool.',
      '- When the user types `/skill-name`, that skill body is already injected into that turn and does not need loading; skills are on-demand callable tools, while the baseline writing style is governed by the novel\'s writingStyle setting.',
      '- Do not read skill files with read_file: user-level skills live outside the project directory and such reads are rejected.',
      '- Prioritize automatic tool loading over manual requests; only when relevant you may suggest the user enable it with `/skill-name`.',
    ].join('\n'),
  )
}

export function buildAssistantProjectFactsBlock(core: ProjectCoreData | null, language: WritingLanguage): string | null {
  if (!core) return null
  const modelFacts = localizeNovelConfigFacts({
    genre: core.genre,
    targetAudience: core.targetAudience,
    plotStructure: core.plotStructure,
    narrativePOV: core.narrativePov,
  }, language)
  const label = (zhCN: string, enUS: string) => writingLanguageText(language, zhCN, enUS)
  const parts: string[] = [
    `## ${label('当前项目上下文', 'Current project context')}`,
    `${label('项目名称', 'Project name')}: ${core.projectName}`,
  ]
  if (modelFacts.genre) {
    parts.push(`${label('类型', 'Genre')}: ${modelFacts.genre}${core.subGenre ? ` · ${core.subGenre}` : ''}`)
  }
  if (modelFacts.targetAudience) {
    parts.push(`${label('目标读者', 'Target readers')}: ${modelFacts.targetAudience}`)
  }
  if (core.totalChapters) {
    parts.push(`${label('计划章节数', 'Planned chapters')}: ${core.totalChapters}`)
  }
  if (core.wordsPerChapter) {
    parts.push(`${label('每章目标字数', 'Target words per chapter')}: ${core.wordsPerChapter}`)
  }
  if (modelFacts.narrativePOV) {
    parts.push(`${label('叙事视角', 'Point of view')}: ${modelFacts.narrativePOV}`)
  }
  if (core.coreOutline) {
    parts.push(`${label('核心大纲', 'Core outline')}: ${core.coreOutline}`)
  }
  const goldenFinger = goldenFingerForPrompt(core)
  if (goldenFinger) {
    parts.push(`${label('金手指', 'Golden finger')}: ${goldenFinger}`)
  } else if (!isGoldenFingerEnabled(core)) {
    parts.push(`${label('金手指', 'Golden finger')}: ${label('不需要', 'Not needed')}`)
  }
  if (core.worldSetting) {
    parts.push(`${label('世界观设定', 'World setting')}: ${core.worldSetting}`)
  }
  if (core.protagonistProfile) {
    parts.push(`${label('主角人设', 'Protagonist profile')}: ${core.protagonistProfile}`)
  }
  if (core.writingStyle) {
    parts.push(`${label('写作风格', 'Writing style')}: ${core.writingStyle}`)
  }
  return parts.join('\n')
}
