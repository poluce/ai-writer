import type { AssistantPromptBlockView, AssistantPromptPreview } from '../../src/shared/agent-prompt'
import { filterAgentSkillCatalog, type AgentSkillCatalogEntry } from '../../src/shared/agent-skills'
import type { AssistantType } from '../../src/shared/agent-conversation-archive'
import { writingLanguageText, type WritingLanguage } from '../../src/shared/writing-language'
import {
  ASSISTANT_HARD_RULES_KEY,
  appShellModeInstruction,
  assistantPromptKeys,
  renderAssistantIdentity,
  renderAssistantRules,
} from '../../src/services/agent/assistant-identity'
import type { ProjectCoreData } from '../repositories/project-core-repository'
import {
  buildAssistantProjectFactsBlock,
  buildAssistantSkillCatalogBlock,
  buildAssistantSystemPrompt,
  type AssistantPromptBlocks,
} from './agent-system-prompt'
import {
  resolveAssistantPromptModule,
  type AssistantPromptLoadOptions,
} from './assistant-identity-loader'

export interface AssistantPromptModuleViews {
  hardRules: { text: string; source: 'builtin' | 'global' | 'project' }
  identity: { text: string; source: 'builtin' | 'global' | 'project' }
  workRules: { text: string; source: 'builtin' | 'global' | 'project' }
}

/** 解析并渲染一个助手的三个可编辑模块，同时保留来源层级。 */
export function resolveAssistantPromptModuleViews(
  assistantType: AssistantType,
  language: WritingLanguage,
  options: AssistantPromptLoadOptions = {},
): AssistantPromptModuleViews {
  const keys = assistantPromptKeys(assistantType)
  const hardRules = resolveAssistantPromptModule(ASSISTANT_HARD_RULES_KEY, language, options)
  const identity = resolveAssistantPromptModule(keys.identityKey, language, options)
  const workRules = resolveAssistantPromptModule(keys.workRulesKey, language, options)
  return {
    hardRules: {
      text: renderAssistantRules(hardRules.template, language),
      source: hardRules.source,
    },
    identity: {
      text: renderAssistantIdentity(
        identity.template,
        language,
        appShellModeInstruction(language),
      ),
      source: identity.source,
    },
    workRules: {
      text: renderAssistantRules(workRules.template, language),
      source: workRules.source,
    },
  }
}

/** 只取装配需要的三块正文。 */
export function resolveAssistantPromptBlocks(
  assistantType: AssistantType,
  language: WritingLanguage,
  options: AssistantPromptLoadOptions = {},
): AssistantPromptBlocks {
  const views = resolveAssistantPromptModuleViews(assistantType, language, options)
  return {
    hardRules: views.hardRules.text,
    identity: views.identity.text,
    workRules: views.workRules.text,
  }
}

export interface AssistantPromptPreviewInput {
  assistantType: AssistantType
  language: WritingLanguage
  core: ProjectCoreData | null
  skills?: readonly AgentSkillCatalogEntry[]
  projectPath?: string | null
  globalPromptsDir?: string
}

function toView(
  kind: AssistantPromptBlockView['kind'],
  label: string,
  source: AssistantPromptBlockView['source'],
  editable: boolean,
  text: string | null | undefined,
): AssistantPromptBlockView {
  const value = text ?? ''
  return { kind, label, source, editable, chars: value.length, text: value }
}

/**
 * 设置页预览与正式装配共用同一份解析结果：
 * 硬规则 → 身份 → 工作规范 → 技能目录 → 项目信息。
 */
export function buildAssistantPromptPreview(input: AssistantPromptPreviewInput): AssistantPromptPreview {
  const { assistantType, language, core, skills = [], projectPath, globalPromptsDir } = input
  const modules = resolveAssistantPromptModuleViews(assistantType, language, {
    projectPath,
    globalPromptsDir,
  })
  const visibleSkills = filterAgentSkillCatalog(skills, assistantType)
  const blocks = {
    hardRules: modules.hardRules.text,
    identity: modules.identity.text,
    workRules: modules.workRules.text,
  }
  const prompt = buildAssistantSystemPrompt(blocks, core, visibleSkills)
  const label = (zhCN: string, enUS: string) => writingLanguageText(language, zhCN, enUS)
  return {
    assistantType,
    prompt,
    blocks: [
      toView('hard_rules', label('软件硬规则', 'Software hard rules'), modules.hardRules.source, true, modules.hardRules.text),
      toView('identity', label('助手身份', 'Assistant identity'), modules.identity.source, true, modules.identity.text),
      toView('work_rules', label('工作规范', 'Work rules'), modules.workRules.source, true, modules.workRules.text),
      toView('skill_catalog', label('技能目录', 'Skill catalog'), 'auto', false, buildAssistantSkillCatalogBlock(visibleSkills, language)),
      toView('project_facts', label('项目信息', 'Project facts'), 'auto', false, buildAssistantProjectFactsBlock(core, language)),
    ],
  }
}
