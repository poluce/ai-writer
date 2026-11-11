/**
 * 助手设定页的数据门面：按助手解析三个可编辑模块（硬规则 / 身份 / 工作规范），
 * 并提供保存、恢复默认与清空。所有覆盖仍走 PromptCatalog 的三级存储。
 */

import type { AssistantType } from '../../shared/agent-conversation-archive'
import type { ProjectSessionContext } from '../../shared/ipc-channels'
import { writingLanguageText, type WritingLanguage } from '../../shared/writing-language'
import type { PromptTemplate } from '../../prompts/types'
import { getBuiltinPromptTemplate } from '../prompt-templates-core'
import {
  deleteCustomPrompt,
  deleteProjectCustomPrompt,
  getPromptSource,
  loadProjectCustomPrompts,
  saveCustomPrompt,
  saveProjectCustomPrompt,
  resolvePromptTemplate,
} from '../prompt-templates'
import { ASSISTANT_HARD_RULES_KEY, assistantPromptKeys } from './assistant-identity'

export const ASSISTANT_TYPES: readonly AssistantType[] = ['general', 'architect', 'blueprint', 'writer', 'review']

export type AssistantModuleId = 'hard_rules' | 'identity' | 'work_rules'

export interface AssistantModuleDoc {
  id: AssistantModuleId
  label: string
  templateKey: string
  source: 'builtin' | 'global' | 'project'
  text: string
}

export function assistantLabel(assistantType: AssistantType, language: WritingLanguage): string {
  switch (assistantType) {
    case 'architect':
      return writingLanguageText(language, '架构助手', 'Architect assistant')
    case 'blueprint':
      return writingLanguageText(language, '蓝图助手', 'Blueprint assistant')
    case 'writer':
      return writingLanguageText(language, '写作助手', 'Writing assistant')
    case 'review':
      return writingLanguageText(language, '审稿助手', 'Review assistant')
    case 'general':
    default:
      return writingLanguageText(language, '主助手', 'Lead assistant')
  }
}

export function assistantModuleLabel(module: AssistantModuleId, language: WritingLanguage): string {
  switch (module) {
    case 'hard_rules':
      return writingLanguageText(language, '软件硬规则', 'Software hard rules')
    case 'identity':
      return writingLanguageText(language, '助手身份', 'Assistant identity')
    case 'work_rules':
      return writingLanguageText(language, '工作规范', 'Work rules')
  }
}

export function assistantModuleSourceLabel(
  source: AssistantModuleDoc['source'],
  language: WritingLanguage,
): string {
  switch (source) {
    case 'global':
      return writingLanguageText(language, '全局覆盖', 'Global override')
    case 'project':
      return writingLanguageText(language, '项目覆盖', 'Project override')
    case 'builtin':
    default:
      return writingLanguageText(language, '内置默认', 'Built-in default')
  }
}

export function assistantModuleTemplateKey(
  assistantType: AssistantType,
  module: AssistantModuleId,
): string {
  if (module === 'hard_rules') return ASSISTANT_HARD_RULES_KEY
  const keys = assistantPromptKeys(assistantType)
  return module === 'identity' ? keys.identityKey : keys.workRulesKey
}

/** 编辑器里的文本 = 角色 + 正文 + 作者补充指导；不包含隐藏后缀与变量插值。 */
export function composeAssistantModuleText(template: PromptTemplate): string {
  return [
    template.systemRole?.trim() ?? '',
    template.content?.trim() ?? '',
    template.taskGuidance?.trim() ?? '',
  ].filter(part => part.length > 0).join('\n\n')
}

/** 读取一个助手当前的三个模块（项目覆盖 → 全局覆盖 → 内置）。 */
export async function loadAssistantModuleDocs(
  assistantType: AssistantType,
  language: WritingLanguage,
  projectSession?: ProjectSessionContext | null,
): Promise<AssistantModuleDoc[]> {
  const modules: AssistantModuleId[] = ['hard_rules', 'identity', 'work_rules']
  return await Promise.all(modules.map(async (module) => {
    const templateKey = assistantModuleTemplateKey(assistantType, module)
    const template = await resolvePromptTemplate(templateKey, projectSession ?? undefined, language)
      ?? getBuiltinPromptTemplate(templateKey, language)
    return {
      id: module,
      label: assistantModuleLabel(module, language),
      templateKey,
      source: getPromptSource(templateKey, projectSession ?? undefined, language),
      text: template ? composeAssistantModuleText(template) : '',
    }
  }))
}

export interface SaveAssistantModuleParams {
  assistantType: AssistantType
  module: AssistantModuleId
  language: WritingLanguage
  scope: 'global' | 'project'
  projectSession?: ProjectSessionContext | null
  text: string
}

/** 保存模块到所选范围；整段文本写进 content，角色/指导段落合并进正文。 */
export async function saveAssistantModule(params: SaveAssistantModuleParams): Promise<boolean> {
  const templateKey = assistantModuleTemplateKey(params.assistantType, params.module)
  const builtin = getBuiltinPromptTemplate(templateKey, params.language)
  if (!builtin) return false
  const template: PromptTemplate = {
    ...builtin,
    writingLanguage: params.language,
    systemRole: '',
    content: params.text,
    variables: { ...builtin.variables },
  }
  delete template.taskGuidance
  delete template.systemSuffix
  try {
    if (params.scope === 'project') {
      if (!params.projectSession) return false
      const saved = await saveProjectCustomPrompt(params.projectSession, template)
      if (saved) await loadProjectCustomPrompts(params.projectSession, params.language)
      return saved
    }
    return await saveCustomPrompt(template)
  } catch {
    return false
  }
}

/** 恢复默认：删除该模块在项目与全局两层的覆盖。 */
export async function resetAssistantModule(params: {
  assistantType: AssistantType
  module: AssistantModuleId
  language: WritingLanguage
  projectSession?: ProjectSessionContext | null
}): Promise<boolean> {
  const templateKey = assistantModuleTemplateKey(params.assistantType, params.module)
  try {
    if (params.projectSession) {
      const projectDeleted = await deleteProjectCustomPrompt(
        params.projectSession,
        templateKey,
        params.language,
      )
      if (!projectDeleted) return false
      await loadProjectCustomPrompts(params.projectSession, params.language)
    }
    return await deleteCustomPrompt(templateKey, params.language)
  } catch {
    return false
  }
}

/** 内置默认文本，用于「查看内置默认」。 */
export function builtinAssistantModuleText(
  assistantType: AssistantType,
  module: AssistantModuleId,
  language: WritingLanguage,
): string {
  const template = getBuiltinPromptTemplate(
    assistantModuleTemplateKey(assistantType, module),
    language,
  )
  return template ? composeAssistantModuleText(template) : ''
}
