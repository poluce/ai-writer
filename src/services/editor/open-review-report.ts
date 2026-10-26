/**
 * 打开审查报告 Tab — 跨 Store 编排（读 locale-store、写 editor-store）。
 *
 * 侧栏目录树与审稿相关编排共用同一个打开入口，统一 Tab 身份
 * （id / filePath / reviewId / chapterDir），避免各调用点各自拼装导致
 * 同一份报告出现多个 Tab 或丢失草稿关联。
 */
import { useEditorStore } from '../../stores/editor-store'
import { useLocaleStore } from '../../stores/locale-store'

/** 打开审查报告 Tab 所需的最小报告信息（全文内容由调用方先取好）。 */
export interface ReviewReportTabSource {
  id: number
  reviewIndex: number
  content: string
}

export interface OpenReviewReportTabParams {
  /** 数据库里的审查报告（含正文）。 */
  review: ReviewReportTabSource
  /** 报告所属章节号，用于 Tab 标题与审查视图上下文。 */
  chapterNumber: number
  /** 被审查草稿的虚拟路径（Tab 的 filePath，用于审稿视图回读原稿）。 */
  draftFilePath: string
  /** 草稿所在章节目录；缺省时审稿视图只读展示报告，不能确认清单。 */
  chapterDir?: string
  /** 报告所属项目；Tab 按项目隔离。 */
  projectKey: string
}

export function openReviewReportTab({
  review,
  chapterNumber,
  draftFilePath,
  chapterDir,
  projectKey,
}: OpenReviewReportTabParams): void {
  const uiText = useLocaleStore.getState().text
  useEditorStore.getState().openFile({
    id: `review-${draftFilePath}-${review.reviewIndex}`,
    name: uiText(`审查报告：第${chapterNumber}章`, `Review report: Chapter ${chapterNumber}`),
    type: 'review-report',
    content: review.content,
    filePath: draftFilePath,
    ...(chapterDir ? { chapterDir } : {}),
    reviewReport: review.content,
    chapterNumber,
    reviewId: review.id,
    projectKey,
  })
}
