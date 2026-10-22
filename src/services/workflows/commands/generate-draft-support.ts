/**
 * 章节正文生成辅助与纯逻辑 — 文本清洗、预算约束、重复检测与恢复凭据生成。
 * 从 generate-draft.command 拆出，使主命令聚焦于工作流调度与步骤执行。
 */

import {
  type CommandExecuteParams,
  type LLMCompletion,
} from './base-command'
import type { ChapterInfo } from '../chapter-workflow'
import { appendVisibleTextContinuation } from '../bounded-completion'
import { stripThinkingTags } from '../workflow-utils'
import type {
  CreateGenerationRuntimeOptions,
  GenerationRuntime,
} from '../../generation/generation-runtime'
import type {
  GenerationAttemptReceipt,
  GenerationOutcome,
} from '../../generation/generation-harness'
import type { WritingLanguage } from '../../../shared/writing-language'
import type { RecoveryChapterSource } from '../../../shared/recovery-candidate'
import type { SelectedCandidateDraft } from '../chapter-materials'
import { workflowUiText } from '../workflow-project-session'

export { countDraftUnits } from '../../../shared/draft-units'
export { previousChapterEnding } from '../chapter-materials'

export const CONTINUE_PROMPT_MAX_CHARS = 1600
export const MIN_TARGET_COMPLETION_RATIO = 0.8
export const MAX_AUTO_CONTINUE_ROUNDS = 7
export const NEXT_CHAPTER_HEAD_MAX_CHARS = 1200
export const CROSS_CHAPTER_REUSE_CJK_NGRAM_CHARS = 8
export const CROSS_CHAPTER_REUSE_ENGLISH_NGRAM_CHARS = 20
export const CROSS_CHAPTER_REUSE_LONG_RUN_CHARS = 80
export const ACTIVE_THREAD_CONTEXT_MAX_CHARS = 1200
export const ACTIVE_THREAD_CONTEXT_MAX_ITEMS = 6

export function sanitizeDraftText(text: string): string {
  const cleaned = stripThinkingTags(text)
    .replace(/^\s*(?:点我继续生成后续内容|继续生成后续内容|请点击继续|未完待续)\s*$/gmi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const paragraphs = cleaned.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const paragraph of paragraphs) {
    const key = paragraph.replace(/\s+/g, '')
    if (key.length >= 40 && seen.has(key)) continue
    if (key.length >= 40) seen.add(key)
    deduped.push(paragraph)
  }
  return deduped.join('\n\n').trim()
}

const GENERATING_PLACEHOLDERS = new Set(['生成中…', 'Generating…'])

/**
 * Recovery stores submit_draft body (or leftover stream prose), never the
 * generating placeholder and never empty/tool-JSON debris without authored text.
 */
export function recoverableDraftProse(text: string): string {
  const cleaned = sanitizeDraftText(text)
  if (!cleaned || GENERATING_PLACEHOLDERS.has(cleaned)) return ''
  return cleaned
}

/**
 * 生成期间在正文区显示「生成中…」占位。正文改走 submit_* 工具参数后不再流式，
 * 这里不再累积片段，也不再用片段当恢复候选（恢复只认终结结果里的可见正文）。
 */
export function createDraftGeneratingPlaceholder(
  replaceText: ((text: string) => void) | undefined,
  options: { generatingLabel?: string } = {},
): { stop(): void } {
  if (options.generatingLabel) replaceText?.(options.generatingLabel)
  return { stop() { /* 占位由下一步的结果文本覆盖，无需额外收尾 */ } }
}

export const DRAFT_GENERATION_BUDGET = Object.freeze({
  maxAttempts: 8,
  maxRequestedOutputTokens: 32_768,
  maxRequestedOutputTokensPerAttempt: 8192,
  deadlineMs: 20 * 60_000,
})

export interface GenerateDraftCommandDependencies {
  createRuntime(options: CreateGenerationRuntimeOptions): Promise<GenerationRuntime>
}

export interface GenerateDraftCommandOptions {
  /** Exact saved draft versions selected by this batch; never inferred as finalized history. */
  readonly selectedCandidateDrafts?: readonly SelectedCandidateDraft[]
  readonly dependencies?: Partial<GenerateDraftCommandDependencies>
}

export type WriterChapterInfo = Pick<ChapterInfo,
  | 'chapterNumber'
  | 'title'
  | 'role'
  | 'purpose'
  | 'characters'
  | 'keyEvents'
  | 'suspenseHook'
  | 'userGuidance'
>

/** Keep workflow metadata out of both initial and continuation writer prompts. */
export function toWriterChapterInfo(chapterInfo: ChapterInfo): WriterChapterInfo {
  return {
    chapterNumber: chapterInfo.chapterNumber,
    title: chapterInfo.title,
    role: chapterInfo.role,
    purpose: chapterInfo.purpose,
    characters: chapterInfo.characters,
    keyEvents: chapterInfo.keyEvents,
    suspenseHook: chapterInfo.suspenseHook,
    userGuidance: chapterInfo.userGuidance,
  }
}

export function hasSubstantialPreviousChapterReuse(
  previousEnding: string,
  draft: string,
  writingLanguage: WritingLanguage,
): boolean {
  const ngramCharacters = writingLanguage === 'en-US'
    ? CROSS_CHAPTER_REUSE_ENGLISH_NGRAM_CHARS
    : CROSS_CHAPTER_REUSE_CJK_NGRAM_CHARS
  const normalize = (text: string) => text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
  const previous = normalize(previousEnding)
  const nextHead = normalize(draft.slice(0, NEXT_CHAPTER_HEAD_MAX_CHARS))
  if (previous.length < ngramCharacters || nextHead.length < ngramCharacters) {
    return false
  }

  const previousNgrams = new Set<string>()
  for (let index = 0; index <= previous.length - ngramCharacters; index += 1) {
    previousNgrams.add(previous.slice(index, index + ngramCharacters))
  }

  const covered = new Uint8Array(nextHead.length)
  for (let index = 0; index <= nextHead.length - ngramCharacters; index += 1) {
    if (!previousNgrams.has(nextHead.slice(index, index + ngramCharacters))) continue
    for (let offset = index; offset < index + ngramCharacters; offset += 1) {
      covered[offset] = 1
    }
  }

  let runLength = 0
  for (let index = 0; index <= covered.length; index += 1) {
    if (covered[index]) {
      runLength += 1
      continue
    }
    if (runLength >= CROSS_CHAPTER_REUSE_LONG_RUN_CHARS) return true
    runLength = 0
  }
  return false
}

export function observeWorkflowCancellation(context: CommandExecuteParams['context']): {
  signal: AbortSignal
  dispose(): void
} {
  const controller = new AbortController()
  const timer = setInterval(() => {
    if (context.cancelled) controller.abort()
  }, 25)
  if (context.cancelled) controller.abort()
  return {
    signal: controller.signal,
    dispose: () => clearInterval(timer),
  }
}

export function logDraftAttempt(
  callbacks: CommandExecuteParams['callbacks'],
  context: CommandExecuteParams['context'],
  phase: { zhCN: string; enUS: string },
  receipt: GenerationAttemptReceipt,
): void {
  callbacks.log(workflowUiText(
    context,
    `  ${phase.zhCN}：租约请求上限 ${receipt.budget.requestedOutputTokens} Tokens` +
      `（单次上限 ${receipt.budget.maxRequestedOutputTokensPerAttempt}，` +
      `累计 ${receipt.budget.cumulativeRequestedOutputTokens}/${receipt.budget.maxRequestedOutputTokens}）`,
    `  ${phase.enUS}: lease request limit ${receipt.budget.requestedOutputTokens} tokens ` +
      `(per-attempt limit ${receipt.budget.maxRequestedOutputTokensPerAttempt}, ` +
      `cumulative ${receipt.budget.cumulativeRequestedOutputTokens}/${receipt.budget.maxRequestedOutputTokens})`,
  ))
}

export function completionFromOutcome(outcome: GenerationOutcome): LLMCompletion {
  return { content: outcome.content, finishReason: outcome.finishReason, receipt: outcome.receipt }
}

export function workflowGenerationModelId(context: CommandExecuteParams['context']): string | undefined {
  return context.generationModelId?.trim() || undefined
}

export function recoveryFailureCode(error: unknown, cancelled: boolean): string {
  if (cancelled) return 'CANCELLED'
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code.slice(0, 160)
  }
  return 'GENERATION_FAILED'
}

export function recoveryChapterSource(chapter: ChapterInfo): RecoveryChapterSource {
  return {
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    role: chapter.role,
    purpose: chapter.purpose,
    keyEvents: chapter.keyEvents,
    characters: [...chapter.characters],
    suspenseHook: chapter.suspenseHook ?? '',
    userGuidance: chapter.userGuidance ?? '',
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * @deprecated 遗留分段续写拼接函数。
 * 现代模型通过 8K~16K 单次输出完整章节，仅在极端超长章节场景下作兼容兜底。
 */
export function appendVisibleDraftContinuation(draft: string, continuation: string): string {
  return appendVisibleTextContinuation(draft, continuation, sanitizeDraftText)
}
