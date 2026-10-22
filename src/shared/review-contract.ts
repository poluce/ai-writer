/**
 * 审稿报告合同（review contract）。
 *
 * 审稿报告以 JSON 写入 `reviews.content`，由 ReviewReport 解析成可勾选的清单。
 * 工作流命令与审稿助手工具共用这一份字段与长度约束，避免两条审稿路径写出
 * 结构不一致的报告。
 */

export const REVIEW_SUMMARY_MAX_CHARACTERS = 120
export const REVIEW_DESCRIPTION_MAX_CHARACTERS = 200
export const REVIEW_QUOTE_MAX_CHARACTERS = 160
export const REVIEW_ITEM_MIN_COUNT = 1
export const REVIEW_ITEM_MAX_COUNT = 10

export interface ReviewContractItem extends Record<string, unknown> {
  category: string
  severity: 'error' | 'warning' | 'pass'
  description: string
  quote?: string
}

export interface ReviewContract extends Record<string, unknown> {
  summary: string
  items: ReviewContractItem[]
  /** 章节目标核验的原始输入；由展示层或工作流按蓝图归一化。 */
  goalReviews?: unknown
}

function isBoundedText(value: unknown, maxCharacters: number): value is string {
  return typeof value === 'string'
    && Boolean(value.trim())
    && Array.from(value.trim()).length <= maxCharacters
}

function boundText(value: string, maxCharacters: number): string {
  return Array.from(value.trim()).slice(0, maxCharacters).join('')
}

function isReviewShape(value: unknown): value is ReviewContract {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const review = value as Record<string, unknown>
  if (Object.keys(review).some(key => key !== 'summary' && key !== 'items' && key !== 'goalReviews')
    || typeof review.summary !== 'string'
    || !Array.isArray(review.items)
    || review.items.length < REVIEW_ITEM_MIN_COUNT
    || review.items.length > REVIEW_ITEM_MAX_COUNT) return false
  return review.items.every((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const record = item as Record<string, unknown>
    const severity = record.severity
    return !Object.keys(record).some(key => (
      key !== 'category'
      && key !== 'severity'
      && key !== 'description'
      && key !== 'quote'
    ))
      && typeof record.category === 'string'
      && (severity === 'error' || severity === 'warning' || severity === 'pass')
      && typeof record.description === 'string'
      && (record.quote === undefined
        ? severity === 'pass'
        : typeof record.quote === 'string')
  })
}

function isReviewContract(value: unknown): value is ReviewContract {
  return isReviewShape(value)
    && isBoundedText(value.summary, REVIEW_SUMMARY_MAX_CHARACTERS)
    && value.items.every(item => (
      Boolean(item.category.trim())
      && isBoundedText(item.description, REVIEW_DESCRIPTION_MAX_CHARACTERS)
      && (item.quote === undefined || isBoundedText(item.quote, REVIEW_QUOTE_MAX_CHARACTERS))
    ))
}

/** 把任意审稿结果收敛进合同允许的长度；结构不合法时抛错。 */
export function normalizeReviewContract(parsed: unknown): ReviewContract {
  if (!isReviewShape(parsed)) throw new Error('invalid review contract')
  const bounded: ReviewContract = {
    ...(parsed.goalReviews === undefined ? {} : { goalReviews: parsed.goalReviews }),
    summary: boundText(parsed.summary, REVIEW_SUMMARY_MAX_CHARACTERS),
    items: parsed.items.map(item => ({
      category: item.category,
      severity: item.severity,
      description: boundText(item.description, REVIEW_DESCRIPTION_MAX_CHARACTERS),
      ...(item.quote === undefined
        ? {}
        : { quote: boundText(item.quote, REVIEW_QUOTE_MAX_CHARACTERS) }),
    })),
  }
  if (!isReviewContract(bounded)) throw new Error('invalid review contract')
  return bounded
}

/** 解析模型或工具提交的审稿报告文本（兼容 ```json 包裹）。 */
export function parseReviewContract(content: string | Record<string, unknown>): ReviewContract {
  if (typeof content === 'object' && content !== null) {
    return normalizeReviewContract(content)
  }
  const trimmed = content.trim()
  const fenced = /^```json[ \t]*\r?\n([\s\S]*?)\r?\n```$/iu.exec(trimmed)
  const parsed: unknown = JSON.parse(fenced?.[1]?.trim() ?? trimmed)
  return normalizeReviewContract(parsed)
}
