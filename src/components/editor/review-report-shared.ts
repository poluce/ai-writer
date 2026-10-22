/**
 * 审稿报告共享纯逻辑 — 问题解析、确认快照映射与生成模型选择。
 * 从 ReviewReport 拆出：查看器、对话框与单测共用。
 */
import type { ExpectedDraftSource, ModelProfile } from '../../shared/ipc-channels'
import { parseChapterGoalReview, type ChapterGoalReview } from '../../shared/chapter-goal-review'
import type {
  HumanConfirmedReviewItem,
  HumanConfirmedReviewSnapshot,
} from '../../shared/human-confirmed-review'

/** 审稿问题条目（JSON 格式） */
export interface ReviewIssue {
  category: string
  severity: 'error' | 'warning' | 'pass' | 'unknown'
  goalId?: string
  description: string
  /** 引用的原文片段（有问题时提供） */
  quote?: string
  stableFactKey?: string
  sourceChapter?: number
}

/** AI 返回的 JSON 审稿结构 */
export interface ReviewJSON {
  goalReview?: unknown
  items: Array<{
    category: string
    severity: string
    goalId?: string
    description: string
    quote?: string
    stableFactKey?: string
    sourceChapter?: number
  }>
  summary: string
}

export function chapterGoalStatusLabel(
  status: string,
  text: (zhCNText: string, enUSText: string) => string,
): string {
  if (status === 'completed') return text('已完成', 'Completed')
  if (status === 'unmet') return text('未完成', 'Unmet')
  return text('待核实', 'Needs verification')
}

export interface EditableReviewItem extends HumanConfirmedReviewItem {
  id: string
  severity: ReviewIssue['severity']
}

export interface ConfirmedChecklist {
  /** The newly appended confirmation row, which is the revision's reviewSourceId. */
  reviewSourceId: number
  content: string
  snapshot: HumanConfirmedReviewSnapshot
}

// ===== 解析器 =====

/** 标准化 severity 值 */
export function normalizeSeverity(raw: string): ReviewIssue['severity'] {
  const s = typeof raw === 'string' ? raw.toLowerCase().trim() : ''
  if (s === 'error' || s === 'critical' || s === 'severe') return 'error'
  if (s === 'warning' || s === 'warn' || s === 'minor') return 'warning'
  if (s === 'pass') return 'pass'
  return 'unknown'
}

/** 尝试从文本中提取 JSON（兼容 ```json 包裹） */
export function extractJSON(text: string): string | null {
  // 先尝试直接解析
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) return trimmed

  // 尝试从 ```json ... ``` 中提取
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (codeBlockMatch) return codeBlockMatch[1].trim()

  // 尝试找第一个 { 和最后一个 }
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }

  return null
}

/** 解析审稿报告（标准结构化 JSON 格式） */
export function parseReport(text: string, fallbackCategory: string): { issues: ReviewIssue[]; summary: string; goalReview?: ChapterGoalReview } {
  const jsonStr = extractJSON(text)
  if (jsonStr) {
    try {
      const data = JSON.parse(jsonStr) as ReviewJSON
      if (data.items && Array.isArray(data.items)) {
        const issues: ReviewIssue[] = data.items.map(item => ({
          category: item.category || fallbackCategory,
          severity: normalizeSeverity(item.severity),
          goalId: item.goalId,
          description: item.description || '',
          quote: item.quote || undefined,
          stableFactKey: item.stableFactKey || undefined,
          sourceChapter: Number.isSafeInteger(item.sourceChapter) && Number(item.sourceChapter) > 0
            ? item.sourceChapter
            : undefined,
        }))
        return { issues, summary: data.summary || '', goalReview: parseChapterGoalReview(data.goalReview) ?? undefined }
      }
    } catch {
      // JSON 解析失败
    }
  }

  return { issues: [], summary: text.trim() }
}

export function isGenerationModel(model: ModelProfile): boolean {
  return Array.isArray(model?.purposes)
    ? model.purposes.includes('generation')
    : true
}

export function availableGenerationModelId(
  models: ModelProfile[],
  modelId: string | null | undefined,
): string | null {
  return modelId && models.some(model => model.id === modelId && isGenerationModel(model))
    ? modelId
    : null
}

export function preferredGenerationModelId(models: ModelProfile[], defaultModelId: string | null): string | null {
  return availableGenerationModelId(models, defaultModelId)
    ?? models.find(isGenerationModel)?.id
    ?? null
}

export function isReviewId(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function editableItemsFromReview(
  issues: ReviewIssue[],
  snapshot: HumanConfirmedReviewSnapshot | null,
): EditableReviewItem[] {
  if (snapshot) {
    return snapshot.items.map((item, index) => ({
      ...item,
      id: item.origin + '-' + (index + 1),
      severity: normalizeSeverity(item.severity),
    }))
  }

  return issues.map((issue, index) => ({
    id: 'ai-' + (index + 1),
    category: issue.category,
    severity: issue.severity,
    description: issue.description,
    ...(issue.quote ? { quote: issue.quote } : {}),
    ...(issue.stableFactKey ? { stableFactKey: issue.stableFactKey } : {}),
    ...(issue.sourceChapter ? { sourceChapter: issue.sourceChapter } : {}),
    ...(issue.goalId ? { goalId: issue.goalId } : {}),
    decision: !issue.goalId && (issue.severity === 'error' || issue.severity === 'warning') ? 'apply' : 'ignore',
    origin: 'ai',
  }))
}

export function confirmationSourceReviewId(
  snapshot: HumanConfirmedReviewSnapshot | null,
  reviewId: number | undefined,
): number | undefined {
  return snapshot?.sourceReviewId ?? reviewId
}

export function matchesReviewSource(
  source: ExpectedDraftSource,
  draft: { id: number; chapterNumber: number; version: number; status: string },
  content: string,
): boolean {
  return source.id === draft.id
    && source.chapterNumber === draft.chapterNumber
    && source.version === draft.version
    && source.status === draft.status
    && source.content === content
}
