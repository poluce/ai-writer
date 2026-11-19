/**
 * 源信息新鲜度守卫（C 方案，写入前强制校验）。
 *
 * 问题：写作助手动笔前读到的蓝图、架构、人物、线索等“原始借鉴信息”可能
 * 在读取之后被作者或其它助手改掉；模型看不到变更通知，仍会按旧内容继续
 * 改稿，把已更新的设定悄悄覆盖回去。
 *
 * 做法：把“读过什么”做成一次会话回合内的账本——每个被追踪的读取工具在
 * 成功返回后登记（工具名 + 参数 + 输出指纹）。写入草稿前重新执行这些读取
 * 并比对指纹：任何一条读取记录的指纹变了，或者根本没有读过目标章节蓝图，
 * 就直接拒绝本次写入，并把“哪条信息变了、该重新读什么”告诉模型。
 *
 * 指纹基于读取工具的输出文本，因此不需要为每种数据源单独维护版本号；
 * 同一份数据的输出是确定性的（读取工具不写时间戳），比对直接可靠。
 *
 * 守卫只在单个回合内有效：每轮对话都会重新装配工具集，所以“上一轮读过、
 * 这一轮直接写”同样会被拒绝——这正是 C 方案要求的每晚写入都基于最新事实。
 */

import { createHash } from 'node:crypto'

import type { WritingLanguage } from '../../src/shared/writing-language'
import { writingLanguageText } from '../../src/shared/writing-language'

/** 被守卫追踪的读取工具：输出必须可重复、可比较，且代表项目原始事实。 */
export const SOURCE_FRESHNESS_TRACKED_READS: ReadonlySet<string> = new Set([
  'read_blueprint',
  'read_architecture',
  'read_continuity_facts',
  'read_narrative_threads',
  'read_project_state',
  'read_file',
  'manage_characters',
  'manage_drafts',
])

export type FreshnessViolationReason = 'missing-read' | 'changed-since-read'

export interface SourceReadRequest {
  toolName: string
  params: Readonly<Record<string, unknown>>
}

export interface FreshnessViolation extends SourceReadRequest {
  label: string
  reason: FreshnessViolationReason
}

interface RecordedRead extends SourceReadRequest {
  label: string
  fingerprint: string
}

export interface SourceFreshnessGuardOptions {
  /** 重新执行一次读取，返回与当初相同的输出文本。 */
  reread: (request: SourceReadRequest) => Promise<string>
  /** 账本上限，避免长回合里无限累积。 */
  maxRecords?: number
}

const DEFAULT_MAX_RECORDS = 64

export function stableRecordKey(request: SourceReadRequest): string {
  const params = request.params ?? {}
  const keys = Object.keys(params).sort()
  const entries = keys.map((key) => [key, params[key]] as const)
  return `${request.toolName}|${JSON.stringify(entries)}`
}

export function fingerprintSourceText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** 把工具返回值压成用于比对的文本（只取文本块，忽略 details 结构差异）。 */
export function toolResultText(result: unknown): string {
  if (typeof result === 'string') return result
  if (!result || typeof result !== 'object') return ''
  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const typed = block as { type?: unknown; text?: unknown }
    if (typed.type === 'text' && typeof typed.text === 'string') parts.push(typed.text)
  }
  return parts.join('\n')
}

/** 源信息的用户可读名称：拒绝写入时用它告诉模型具体是哪条事实变了。 */
export function describeSourceRead(
  toolName: string,
  params: Readonly<Record<string, unknown>>,
  language: WritingLanguage,
): string {
  const chapterNumber = Number(params.chapter_number)
  const hasChapter = Number.isInteger(chapterNumber) && chapterNumber > 0
  const chapter = hasChapter ? String(chapterNumber) : ''
  const path = typeof params.path === 'string' ? params.path : ''
  return writingLanguageText(
    language,
    {
      read_blueprint: `第 ${chapter || '?'} 章蓝图`,
      read_architecture: '故事架构',
      read_continuity_facts: '连续性事实',
      read_narrative_threads: '叙事线索',
      read_project_state: '项目状态',
      read_file: `文件 ${path || '(未命名)'}`,
      manage_characters: '人物档案',
      manage_drafts: `第 ${chapter || '?'} 章草稿`,
    }[toolName] ?? toolName,
    {
      read_blueprint: `Chapter ${chapter || '?'} blueprint`,
      read_architecture: 'Story architecture',
      read_continuity_facts: 'Continuity facts',
      read_narrative_threads: 'Narrative threads',
      read_project_state: 'Project state',
      read_file: `File ${path || '(unnamed)'}`,
      manage_characters: 'Character roster',
      manage_drafts: `Chapter ${chapter || '?'} draft`,
    }[toolName] ?? toolName,
  )
}

/**
 * 单回合内的源信息账本。
 *
 * `inspect` 用当前磁盘/数据库状态重算指纹；`rebaseline` 在助手自己写入之后
 * 把账本刷新到新基线，避免它把自己的改动误判为“外部变更”。
 */
export class SourceFreshnessGuard {
  private readonly records = new Map<string, RecordedRead>()
  private readonly reread: (request: SourceReadRequest) => Promise<string>
  private readonly maxRecords: number

  constructor(options: SourceFreshnessGuardOptions) {
    this.reread = options.reread
    this.maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS
  }

  get recordCount(): number {
    return this.records.size
  }

  record(request: SourceReadRequest, label: string, text: string): void {
    const key = stableRecordKey(request)
    this.records.delete(key)
    this.records.set(key, {
      toolName: request.toolName,
      params: request.params,
      label,
      fingerprint: fingerprintSourceText(text),
    })
    while (this.records.size > this.maxRecords) {
      const oldest = this.records.keys().next()
      if (oldest.done) break
      this.records.delete(oldest.value)
    }
  }

  has(request: SourceReadRequest): boolean {
    return this.records.has(stableRecordKey(request))
  }

  async inspect(required: readonly { request: SourceReadRequest; label: string }[]): Promise<FreshnessViolation[]> {
    const violations = new Map<string, FreshnessViolation>()

    for (const requirement of required) {
      const key = stableRecordKey(requirement.request)
      if (!this.records.has(key)) {
        violations.set(key, {
          ...requirement.request,
          label: requirement.label,
          reason: 'missing-read',
        })
      }
    }

    for (const [key, recorded] of this.records) {
      let currentText: string
      try {
        currentText = await this.reread({
          toolName: recorded.toolName,
          params: recorded.params,
        })
      } catch {
        // 重新读取失败时不制造假阳性：保留原记录，让目标工具自己报错。
        continue
      }
      if (fingerprintSourceText(currentText) === recorded.fingerprint) continue
      violations.set(key, {
        toolName: recorded.toolName,
        params: recorded.params,
        label: recorded.label,
        reason: 'changed-since-read',
      })
    }

    return [...violations.values()]
  }

  async rebaseline(): Promise<void> {
    for (const [key, recorded] of [...this.records.entries()]) {
      try {
        const currentText = await this.reread({
          toolName: recorded.toolName,
          params: recorded.params,
        })
        this.records.set(key, {
          ...recorded,
          fingerprint: fingerprintSourceText(currentText),
        })
      } catch {
        this.records.delete(key)
      }
    }
  }
}

/** 拒绝写入时返回给模型的说明：说清哪条源信息变了、下一步该读什么。 */
export function formatFreshnessRefusal(
  violations: readonly FreshnessViolation[],
  language: WritingLanguage,
): string {
  const missing = violations.filter(violation => violation.reason === 'missing-read')
  const changed = violations.filter(violation => violation.reason === 'changed-since-read')
  const lines: string[] = []

  if (missing.length > 0) {
    lines.push(writingLanguageText(
      language,
      '【写入被拒绝：缺少必要的源信息读取】',
      '[Write refused: required source facts have not been read]',
    ))
    for (const violation of missing) {
      lines.push(writingLanguageText(
        language,
        `- ${violation.label} 尚未读取：请先调用 ${violation.toolName} 读取最新内容。`,
        `- ${violation.label} has not been read: call ${violation.toolName} first.`,
      ))
    }
  }

  if (changed.length > 0) {
    lines.push(writingLanguageText(
      language,
      '【写入被拒绝：源信息已变更】',
      '[Write refused: source facts changed]',
    ))
    for (const violation of changed) {
      lines.push(writingLanguageText(
        language,
        `- ${violation.label} 在你上次读取之后已被修改：请重新调用 ${violation.toolName} 读取最新内容。`,
        `- ${violation.label} changed after you read it: call ${violation.toolName} again for the latest content.`,
      ))
    }
  }

  lines.push(writingLanguageText(
    language,
    '本次写入没有落盘。请先按上面的提示重新读取，确认最新事实后再重试写入。',
    'Nothing was written. Re-read the facts above, then retry the write.',
  ))

  return lines.join('\n')
}
