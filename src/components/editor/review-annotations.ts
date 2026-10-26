/**
 * 审查报告 · 原文批注定位（纯逻辑，无 React 依赖）。
 *
 * 审稿意见本身只携带逐字 `quote`；本模块把 quote 在草稿正文里定位成
 * `[blockIndex, from, to]`，供「原文批注视图」渲染与卡片联动使用。
 * 定位失败（草稿已改、quote 不完整）就只保留在右侧看板，不污染正文。
 */
import type { ReviewIssue } from './review-report-shared'

export type ReviewSeverity = ReviewIssue['severity']

/** 右侧看板里参与正文批注的最小信息集。 */
export interface ReviewAnnotationItem {
  id: string
  category: string
  severity: ReviewSeverity
  quote?: string
}

export type ReviewBlockKind = 'text' | 'code'

export interface ReviewBlock {
  /** 段落序号（从 0 开始，用于渲染行号与滚动定位）。 */
  index: number
  kind: ReviewBlockKind
  text: string
}

export interface ReviewAnnotation {
  itemId: string
  /** 正文批注序号（从 1 开始，按正文顺序编号）。 */
  number: number
  category: string
  severity: ReviewSeverity
  blockIndex: number
  from: number
  to: number
}

export interface ReviewSegment {
  text: string
  annotation: ReviewAnnotation | null
}

export interface ReviewDocument {
  blocks: ReviewBlock[]
  annotations: ReviewAnnotation[]
  annotationByItemId: Map<string, ReviewAnnotation>
  characterCount: number
}

export type InlineToken =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'code'; text: string }

/** 只有需要作者处理的问题才在正文里打标；通过项只留看板。 */
const ANNOTATABLE_SEVERITIES: ReadonlySet<ReviewSeverity> = new Set(['error', 'warning', 'unknown'])

const CODE_FENCE = '```'

/**
 * 把草稿正文拆成段落/代码块。
 * - 每个非空行是一段（与草稿存储一致：一个换行一段）；
 * - ``` 围栏内的行标记为 code，围栏本身不渲染；
 * - 代码行保留缩进，普通段落去掉首尾空白。
 */
export function splitReviewBlocks(content: string): ReviewBlock[] {
  const blocks: ReviewBlock[] = []
  let inCode = false
  let index = 0
  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue
    if (trimmed.startsWith(CODE_FENCE)) {
      inCode = !inCode
      continue
    }
    blocks.push({
      index,
      kind: inCode ? 'code' : 'text',
      text: inCode ? rawLine.replace(/\s+$/, '') : trimmed,
    })
    index += 1
  }
  return blocks
}

/** 统计正文字数：去掉所有空白字符后的字符数。 */
export function countDraftCharacters(content: string): number {
  return content.replace(/\s/g, '').length
}

/** 逐条意见在正文里定位，返回按正文顺序编号的批注集合。 */
export function buildReviewDocument(
  items: readonly ReviewAnnotationItem[],
  content: string,
): ReviewDocument {
  const blocks = splitReviewBlocks(content)
  const found: Array<Omit<ReviewAnnotation, 'number'>> = []

  for (const item of items) {
    if (!ANNOTATABLE_SEVERITIES.has(item.severity)) continue
    const quote = item.quote?.trim()
    if (!quote) continue
    for (const block of blocks) {
      const from = block.text.indexOf(quote)
      if (from < 0) continue
      found.push({
        itemId: item.id,
        category: item.category,
        severity: item.severity,
        blockIndex: block.index,
        from,
        to: from + quote.length,
      })
      break
    }
  }

  found.sort((a, b) => a.blockIndex - b.blockIndex || a.from - b.from)
  const annotations: ReviewAnnotation[] = found.map((annotation, order) => ({
    ...annotation,
    number: order + 1,
  }))

  return {
    blocks,
    annotations,
    annotationByItemId: new Map(annotations.map(annotation => [annotation.itemId, annotation])),
    characterCount: countDraftCharacters(content),
  }
}

/** 把一段正文切成「普通文本 / 批注命中」片段，供渲染行内高亮。 */
export function splitReviewSegments(
  block: ReviewBlock,
  annotations: readonly ReviewAnnotation[],
): ReviewSegment[] {
  const inBlock = annotations
    .filter(annotation => annotation.blockIndex === block.index)
    .sort((a, b) => a.from - b.from)
  const segments: ReviewSegment[] = []
  let cursor = 0
  for (const annotation of inBlock) {
    if (annotation.from < cursor) continue
    if (annotation.from > cursor) {
      segments.push({ text: block.text.slice(cursor, annotation.from), annotation: null })
    }
    segments.push({ text: block.text.slice(annotation.from, annotation.to), annotation })
    cursor = annotation.to
  }
  if (cursor < block.text.length) {
    segments.push({ text: block.text.slice(cursor), annotation: null })
  }
  return segments
}

/**
 * 极简行内 Markdown：草稿里的 `**加粗**` 与 `代码` 只做展示层还原，
 * 不引入第三方 Markdown 渲染器。
 */
export function splitInlineMarkdown(text: string): InlineToken[] {
  if (!text) return []
  const tokens: InlineToken[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) tokens.push({ kind: 'text', text: text.slice(cursor, match.index) })
    const token = match[0]
    if (token.startsWith('**')) {
      tokens.push({ kind: 'bold', text: token.slice(2, -2) })
    } else {
      tokens.push({ kind: 'code', text: token.slice(1, -1) })
    }
    cursor = match.index + token.length
  }
  if (cursor < text.length) tokens.push({ kind: 'text', text: text.slice(cursor) })
  return tokens
}
