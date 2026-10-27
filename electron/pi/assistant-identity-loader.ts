import fs from 'node:fs'
import path from 'node:path'

import type { PromptTemplate } from '../../src/prompts/types'
import {
  ASSISTANT_WRITING_IDENTITY_KEY,
} from '../../src/services/agent/assistant-identity'
import { getBuiltinPromptTemplate } from '../../src/services/prompt-templates-core'
import { DIR_PROMPTS } from '../../src/shared/project-paths'
import {
  resolveWritingLanguage,
  writingLanguageText,
  type WritingLanguage,
} from '../../src/shared/writing-language'
import { VELA_HOME } from '../utils/config-utils'
import { assertProjectFilePath } from '../utils/project-context'

export interface AssistantPromptLoadOptions {
  projectPath?: string | null
  globalPromptsDir?: string
}

function isContainedPath(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath)
  return !(
    relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  )
}

function isPromptTemplate(value: unknown): value is PromptTemplate {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof (value as PromptTemplate).key === 'string'
    && typeof (value as PromptTemplate).content === 'string'
    && (
      (value as PromptTemplate).writingLanguage === undefined
      || (value as PromptTemplate).writingLanguage === 'zh-CN'
      || (value as PromptTemplate).writingLanguage === 'en-US'
    )
}

function promptFilename(template: Pick<PromptTemplate, 'key' | 'writingLanguage'>): string {
  return `${template.key}${template.writingLanguage ? `.${template.writingLanguage}` : ''}`
}

function fail(language: WritingLanguage, zhCN: string, enUS: string): never {
  throw new Error(writingLanguageText(language, zhCN, enUS))
}

function readCandidate(
  filePath: string,
  key: string,
  language: WritingLanguage,
  mode: 'project' | 'global',
  root: string,
): PromptTemplate | null {
  if (!fs.existsSync(filePath)) return null
  if (mode === 'project') {
    assertProjectFilePath(filePath, root, 'existing')
  } else {
    const canonicalRoot = fs.realpathSync.native(root)
    const canonicalPath = fs.realpathSync.native(filePath)
    if (!isContainedPath(canonicalRoot, canonicalPath)) {
      fail(language, '提示词目标超出应用目录', 'The prompt target is outside the app directory')
    }
  }
  const raw = fs.readFileSync(filePath, 'utf8')
  if (!raw.trim()) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    fail(language, `提示词无法解析: ${filePath}`, `The prompt could not be parsed: ${filePath}`)
  }
  if (!isPromptTemplate(parsed) || parsed.key !== key) {
    fail(language, '提示词内容结构无效', 'The prompt content shape is invalid')
  }
  const filenameKey = path.basename(filePath, '.json')
  if (promptFilename(parsed) !== filenameKey) {
    fail(
      language,
      '提示词标识或语言与文件名不一致',
      'The prompt identifier or language does not match its filename',
    )
  }
  return parsed
}

function readFromDir(
  dir: string,
  key: string,
  language: WritingLanguage,
  mode: 'project' | 'global',
  root: string,
): PromptTemplate | null {
  if (!fs.existsSync(dir)) return null
  const tagged = readCandidate(
    path.join(dir, `${key}.${language}.json`),
    key,
    language,
    mode,
    root,
  )
  if (tagged) return tagged
  if (language === 'zh-CN') {
    return readCandidate(
      path.join(dir, `${key}.json`),
      key,
      language,
      mode,
      root,
    )
  }
  return null
}

/**
 * Resolve one assistant prompt module with Settings precedence:
 * project override → global override → built-in.
 */
export function loadAssistantPromptModule(
  key: string,
  language: WritingLanguage,
  options: AssistantPromptLoadOptions = {},
): PromptTemplate {
  const writingLanguage = resolveWritingLanguage(language)
  if (options.projectPath) {
    const projectTemplate = readFromDir(
      path.join(options.projectPath, DIR_PROMPTS),
      key,
      writingLanguage,
      'project',
      options.projectPath,
    )
    if (projectTemplate) return projectTemplate
  }
  const globalDir = options.globalPromptsDir ?? path.join(VELA_HOME, 'prompts')
  const globalTemplate = readFromDir(globalDir, key, writingLanguage, 'global', globalDir)
  if (globalTemplate) return globalTemplate
  const builtin = getBuiltinPromptTemplate(key, writingLanguage)
  if (!builtin) throw new Error(`Missing assistant prompt template: ${key}`)
  return builtin
}

/** 兼容入口：解析主助手身份模板。 */
export function loadAssistantWritingIdentity(
  language: WritingLanguage,
  options: AssistantPromptLoadOptions = {},
): PromptTemplate {
  return loadAssistantPromptModule(ASSISTANT_WRITING_IDENTITY_KEY, language, options)
}
