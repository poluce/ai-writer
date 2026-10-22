/**
 * Vela Prompt 模板库 — 渲染端生命周期门面。
 *
 * 环境无关的组合与渲染核心在 prompt-templates-core.ts（主进程与渲染进程共用）；
 * 本模块在其上叠加 PromptCatalog 持久化生命周期：内置 → 全局自定义 → 项目级
 * 覆盖的三级水合、保存与删除。渲染端既有导入路径保持不变。
 */

import type { ProjectSessionContext } from '../shared/ipc-channels'
import type { WritingLanguage } from '../shared/writing-language'
import { resolveWritingLanguage } from '../shared/writing-language'
import {
  getActiveProjectSessionContext,
} from '../shared/project-session-context'
import { PromptCatalog, ipcPromptPersistence } from './prompt-catalog'
import { BUILTIN_PROMPTS } from '../prompts/load'
import type { PromptTemplate } from '../prompts/types'
import { getBuiltinPromptTemplate } from './prompt-templates-core'

export * from './prompt-templates-core'

/** 提示词生命周期唯一所有者；工作流通过 async resolve 自动完成水合。 */
export const promptCatalog = new PromptCatalog(
  BUILTIN_PROMPTS,
  ipcPromptPersistence,
  getActiveProjectSessionContext,
)

/** 项目关闭、切换或新加载开始时立即失效，绝不沿用旧 lease 的覆盖。 */
export function clearProjectCustomPrompts(): void {
  promptCatalog.clearProject()
}

/** 加载全局自定义 Prompt 覆盖（从 ~/.vela/prompts/ 目录） */
export async function loadCustomPrompts(writingLanguage: WritingLanguage = 'zh-CN'): Promise<void> {
  await promptCatalog.list(undefined, writingLanguage)
}

/** 加载项目级自定义 Prompt 覆盖（从 {projectPath}/.vela/prompts/ 目录） */
export async function loadProjectCustomPrompts(
  projectSession: ProjectSessionContext,
  writingLanguage: WritingLanguage = 'zh-CN',
): Promise<boolean> {
  return promptCatalog.loadProject(projectSession, writingLanguage)
}

/** 根据 key 获取 Prompt 模板（三级优先级：当前 session 项目级 > 全局级 > 内置） */
export function getPromptTemplate(
  key: string,
  projectSession?: ProjectSessionContext,
  writingLanguage: WritingLanguage = 'zh-CN',
): PromptTemplate | undefined {
  const resolved = promptCatalog.peek(key, projectSession, resolveWritingLanguage(writingLanguage))
  if (!resolved || resolved.source === 'builtin') return getBuiltinPromptTemplate(key, writingLanguage)
  return resolved.template
}

/** 工作流读取入口：首次调用会自动等待全局与当前项目覆盖水合。 */
export async function resolvePromptTemplate(
  key: string,
  projectSession: ProjectSessionContext | undefined,
  writingLanguage: WritingLanguage,
): Promise<PromptTemplate | undefined> {
  const language = resolveWritingLanguage(writingLanguage)
  const resolved = await promptCatalog.resolve(key, projectSession, language)
  if (!resolved) return undefined
  return resolved.source === 'builtin'
    ? getBuiltinPromptTemplate(key, writingLanguage)
    : resolved.template
}

/** 获取指定模板当前生效的来源 */
export function getPromptSource(
  key: string,
  projectSession?: ProjectSessionContext,
  writingLanguage: WritingLanguage = 'zh-CN',
): 'builtin' | 'global' | 'project' {
  return promptCatalog.peek(key, projectSession, resolveWritingLanguage(writingLanguage))?.source ?? 'builtin'
}

/** 保存全局自定义 Prompt 到 ~/.vela/prompts/ */
export async function saveCustomPrompt(template: PromptTemplate): Promise<boolean> {
  return promptCatalog.commit({ action: 'save', scope: 'global', template })
}

/** 保存项目级自定义 Prompt 到 {projectPath}/.vela/prompts/ */
export async function saveProjectCustomPrompt(
  projectSession: ProjectSessionContext,
  template: PromptTemplate,
): Promise<boolean> {
  return promptCatalog.commit({ action: 'save', scope: 'project', projectSession, template })
}

/** 删除全局自定义 Prompt（恢复为内置版本） */
export async function deleteCustomPrompt(
  key: string,
  writingLanguage: WritingLanguage = 'zh-CN',
): Promise<boolean> {
  return promptCatalog.commit({ action: 'delete', scope: 'global', key, writingLanguage })
}

/** 删除项目级自定义 Prompt（恢复为全局/内置版本） */
export async function deleteProjectCustomPrompt(
  projectSession: ProjectSessionContext,
  key: string,
  writingLanguage: WritingLanguage = 'zh-CN',
): Promise<boolean> {
  return promptCatalog.commit({ action: 'delete', scope: 'project', projectSession, key, writingLanguage })
}