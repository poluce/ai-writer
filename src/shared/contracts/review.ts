import type { ExpectedDraftSource } from './draft'

/** review = AI 审稿报告；confirmation = 人工确认快照（派生记录，随来源报告清理）。 */
export type ReviewKind = 'review' | 'confirmation'

export interface ReviewMeta {
  id: number
  baseDraftId: number
  reviewIndex: number
  contentId: number
  createdAt: string
  kind: ReviewKind
  /** 确认快照指向的原始审稿报告 ID；AI 审稿报告为 null。 */
  sourceReviewId: number | null
}

export interface ReviewFull extends ReviewMeta {
  content: string
  sourceDraft: ExpectedDraftSource | null
}
