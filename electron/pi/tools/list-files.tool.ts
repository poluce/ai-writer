import fs from 'node:fs'
import path from 'node:path'

import type { AgentTool } from '@earendil-works/pi-agent-core'
import { Type } from '@earendil-works/pi-ai'

import { getCurrentProjectPath } from '../../database'
import { assertProjectFilePath } from '../../utils/project-context'
import {
  writingLanguageText,
  type WritingLanguage,
} from '../../../src/shared/writing-language'
import { logFailure } from '../../../src/shared/fail-log'

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500
const DEFAULT_DEPTH = 3
const MAX_DEPTH = 6
/** 应用内部与版本库目录不参与列举：它们不是作者素材，且体积不可控。 */
const IGNORED_DIRECTORIES = new Set(['.vela', '.git', 'node_modules'])

export interface ProjectFileEntry {
  path: string
  type: 'directory' | 'file'
  sizeBytes?: number
}

export interface ProjectFileListing {
  root: string
  pattern: string
  entries: ProjectFileEntry[]
  total: number
  truncated: boolean
}

const Schema = Type.Object({
  directory: Type.Optional(Type.String({
    description: '要列举的项目内目录，相对项目根目录；不传时列举项目根目录。',
  })),
  pattern: Type.Optional(Type.String({
    description: '可选文件名通配符，支持 *、? 与 **，例如 "*.md" 或 "src/**/*.ts"；不传时返回目录与文件的结构清单。',
  })),
  recursive: Type.Optional(Type.Boolean({
    description: '是否递归子目录，默认 true；false 时只列一层。',
  })),
  max_depth: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: MAX_DEPTH,
    description: `递归深度上限，默认 ${DEFAULT_DEPTH}，最大 ${MAX_DEPTH}。`,
  })),
  limit: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: MAX_LIMIT,
    description: `最多返回条目数，默认 ${DEFAULT_LIMIT}，最大 ${MAX_LIMIT}。`,
  })),
})

function globToRegExp(glob: string): RegExp {
  let pattern = ''
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]
    if (char === '*') {
      if (glob[index + 1] === '*') {
        pattern += '.*'
        index += 1
      } else {
        pattern += '[^/]*'
      }
      continue
    }
    if (char === '?') {
      pattern += '[^/]'
      continue
    }
    pattern += char.replace(/[\\^$+.()|[\]{}]/g, '\\$&')
  }
  return new RegExp(`^${pattern}$`, 'u')
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/')
}

function matchesPattern(relativePath: string, pattern: string): boolean {
  const matcher = globToRegExp(pattern)
  if (pattern.includes('/')) return matcher.test(relativePath)
  return matcher.test(path.posix.basename(relativePath))
}

function sortEntries(entries: ProjectFileEntry[]): ProjectFileEntry[] {
  return [...entries].sort((left, right) => {
    if (left.type !== right.type) return left.type === 'directory' ? -1 : 1
    return left.path.localeCompare(right.path, 'zh-CN')
  })
}

export function createListFilesTool(
  language: WritingLanguage,
): AgentTool<typeof Schema, ProjectFileListing> {
  const text = (zhCN: string, enUS: string) => writingLanguageText(language, zhCN, enUS)
  const isEn = language === 'en-US'

  return {
    name: 'list_files',
    label: 'List Files',
    description: isEn
      ? 'List project files and folders (read-only) with an optional glob pattern such as "*.md" or "src/**/*.ts". Use this instead of bash ls/find to discover what the author keeps in the project. Story facts are not files: use read_project_state, read_architecture, read_blueprint, manage_drafts, manage_characters, or manage_review_reports for those.'
      : '列举项目内的文件与目录（只读），可传通配符如 "*.md"、"src/**/*.ts"。需要了解项目里有哪些文件时使用本工具，不要用 bash ls/find 猜测。故事事实不是文件：项目状态、设定、蓝图、草稿、人物与审稿报告请使用对应领域工具。',
    parameters: Schema,
    execute: async (_id, params) => {
      const projectPath = getCurrentProjectPath()
      if (!projectPath) {
        throw new Error(text('未打开小说项目', 'No novel project is currently open'))
      }

      const requestedDirectory = (params.directory ?? '.').trim() || '.'
      const rootPath = path.resolve(projectPath, requestedDirectory)
      try {
        assertProjectFilePath(rootPath, projectPath, 'existing')
      } catch {
        throw new Error(text(
          `路径越界：「${requestedDirectory}」超出了项目目录范围。`,
          `The path "${requestedDirectory}" is outside the project directory.`,
        ))
      }
      let rootStat: fs.Stats
      try {
        rootStat = fs.statSync(rootPath)
      } catch (error) {
        logFailure('AgentTool', 'list_files failed to stat directory', error, { requestedDirectory })
        throw new Error(text('目录读取失败', 'Could not read the directory'))
      }
      if (!rootStat.isDirectory()) {
        throw new Error(text(
          `「${requestedDirectory}」不是目录。读取文件请使用 read_file。`,
          `"${requestedDirectory}" is not a directory. Use read_file for files.`,
        ))
      }

      const pattern = (params.pattern ?? '*').trim() || '*'
      const recursive = params.recursive ?? true
      const maxDepth = recursive ? (params.max_depth ?? DEFAULT_DEPTH) : 1
      const limit = params.limit ?? DEFAULT_LIMIT
      const entries: ProjectFileEntry[] = []
      let truncated = false

      const walk = (directoryPath: string, depth: number): void => {
        if (truncated) return
        let dirents: fs.Dirent[]
        try {
          dirents = fs.readdirSync(directoryPath, { withFileTypes: true })
        } catch (error) {
          logFailure('AgentTool', 'list_files failed to read directory', error, { directoryPath })
          return
        }
        for (const dirent of dirents.sort((left, right) => left.name.localeCompare(right.name))) {
          if (truncated) return
          if (dirent.isSymbolicLink()) continue
          const absolutePath = path.join(directoryPath, dirent.name)
          const relativePath = toPosix(path.relative(rootPath, absolutePath))
          if (dirent.isDirectory()) {
            if (IGNORED_DIRECTORIES.has(dirent.name)) continue
            if (pattern === '*') {
              entries.push({ path: `${relativePath}/`, type: 'directory' })
              if (entries.length >= limit) {
                truncated = true
                return
              }
            }
            if (depth < maxDepth) walk(absolutePath, depth + 1)
            continue
          }
          if (!dirent.isFile()) continue
          if (pattern !== '*' && !matchesPattern(relativePath, pattern)) continue
          let sizeBytes: number | undefined
          try {
            sizeBytes = fs.statSync(absolutePath).size
          } catch {
            sizeBytes = undefined
          }
          entries.push({
            path: relativePath,
            type: 'file',
            ...(sizeBytes === undefined ? {} : { sizeBytes }),
          })
          if (entries.length >= limit) {
            truncated = true
            return
          }
        }
      }

      walk(rootPath, 1)

      const displayEntries = sortEntries(entries)
      const heading = isEn
        ? `### Project files (${requestedDirectory === '.' ? 'root' : requestedDirectory}${pattern === '*' ? '' : ` · pattern: ${pattern}`})\n`
        : `### 项目文件（${requestedDirectory === '.' ? '根目录' : requestedDirectory}${pattern === '*' ? '' : ` · 匹配：${pattern}`}）\n`
      const lines = displayEntries.map(entry => (
        entry.type === 'directory'
          ? `- ${entry.path}`
          : `- ${entry.path} (${formatSize(entry.sizeBytes ?? 0)})`
      ))
      if (displayEntries.length === 0) {
        lines.push(isEn ? 'No matching files.' : '没有匹配的文件。')
      }
      if (truncated) {
        lines.push(text(
          `\n（已达到 ${limit} 条上限，结果被截断；可缩小目录范围或使用 pattern。）`,
          `\n(Stopped at the ${limit} entry limit; narrow the directory or use a pattern.)`,
        ))
      }

      const details: ProjectFileListing = {
        root: toPosix(path.relative(projectPath, rootPath)) || '.',
        pattern,
        entries: displayEntries,
        total: displayEntries.length,
        truncated,
      }
      return { content: [{ type: 'text', text: `${heading}${lines.join('\n')}` }], details }
    },
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
