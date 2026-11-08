import { writingLanguageText, type WritingLanguage } from './writing-language'

export type ReviewDimensionKey = 'continuity' | 'logic' | 'character' | 'foreshadow'

export interface ReviewDimensionDefinition {
  key: ReviewDimensionKey
  label: Readonly<{ zhCN: string; enUS: string }>
}

/**
 * 审稿维度：主界面「AI 审稿」弹窗与项目助手「委派审稿」共用同一份定义。
 *
 * 两个入口必须给出同一组 key 与同一套维度名。此前弹窗与委派各写一份：
 * 委派侧没有维度概念，弹窗侧的侧重点又硬编码中文，中英混排与口径漂移
 * 都在所难免；提炼到 shared 层后，UI 勾选、提示词侧重点与工具参数三者同源。
 * 数组顺序即规范顺序，也是「默认全选」的渲染顺序。
 */
export const REVIEW_DIMENSIONS = [
  { key: 'continuity', label: { zhCN: '剧情连贯性', enUS: 'Story continuity' } },
  { key: 'logic', label: { zhCN: '剧情合理性', enUS: 'Story logic' } },
  { key: 'character', label: { zhCN: '角色状态', enUS: 'Character state' } },
  { key: 'foreshadow', label: { zhCN: '前后章节串联', enUS: 'Chapter connections' } },
] as const satisfies readonly ReviewDimensionDefinition[]

export const REVIEW_DIMENSION_KEYS: readonly ReviewDimensionKey[] = REVIEW_DIMENSIONS.map(d => d.key)

const LABELS_BY_KEY = new Map<ReviewDimensionKey, Readonly<{ zhCN: string; enUS: string }>>(
  REVIEW_DIMENSIONS.map(d => [d.key, d.label]),
)

export function isReviewDimensionKey(value: unknown): value is ReviewDimensionKey {
  return typeof value === 'string' && LABELS_BY_KEY.has(value as ReviewDimensionKey)
}

/**
 * 只保留合法维度并按规范顺序去重。
 * 维度由模型填参，出现未知 key 时丢弃该项而不是中断整次委派。
 */
export function normalizeReviewDimensions(values: unknown): ReviewDimensionKey[] {
  if (!Array.isArray(values)) return []
  const picked = new Set(values.filter(isReviewDimensionKey))
  return REVIEW_DIMENSION_KEYS.filter(key => picked.has(key))
}

export function reviewDimensionLabel(key: ReviewDimensionKey, language: WritingLanguage): string {
  const label = LABELS_BY_KEY.get(key)
  return label ? writingLanguageText(language, label.zhCN, label.enUS) : key
}

/** '剧情连贯性、剧情合理性' / 'Story continuity, Story logic'；空数组返回空串。 */
export function formatReviewDimensionLabels(
  keys: readonly ReviewDimensionKey[],
  language: WritingLanguage,
): string {
  const separator = language === 'en-US' ? ', ' : '、'
  return keys.map(key => reviewDimensionLabel(key, language)).join(separator)
}

/**
 * 写进提示词的侧重点整句。没有任何有效维度时明确写「全部维度」，
 * 与手动审稿「一个都不勾 = 全查」的既有语义保持一致。
 */
export function formatReviewFocus(
  keys: readonly ReviewDimensionKey[],
  language: WritingLanguage,
): string {
  const labels = formatReviewDimensionLabels(keys, language)
  return writingLanguageText(
    language,
    `重点检查维度：${labels || '全部维度'}`,
    `Review focus: ${labels || 'all dimensions'}`,
  )
}
