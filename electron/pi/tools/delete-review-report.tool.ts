import type { AgentTool } from '@earendil-works/pi-agent-core'
import { Type } from '@earendil-works/pi-ai'

import { getCurrentProjectPath, getProjectDb } from '../../database'
import { DraftRepository } from '../../repositories/draft-repository'
import { ReviewRepository } from '../../repositories/review-repository'
import type { RendererActionSink } from '../renderer-action'
import {
  writingLanguageText,
  type WritingLanguage,
} from '../../../src/shared/writing-language'

/**
 * 破坏性工具：永久删除一份审稿报告。
 *
 * 单独成工具而不是塞进 manage_review_reports，是为了让删除只能通过
 * 逐次确认的破坏性入口触发（list / close 不需要弹确认）。
 * 删除成功后关闭对应报告 Tab 并刷新侧栏审稿节点。
 */
const Schema = Type.Object({
  review_id: Type.Integer({
    minimum: 1,
    description: '要永久删除的审稿报告数据库 ID；先使用 manage_review_reports (action: "list") 确认目标。',
  }),
})

export function createDeleteReviewReportTool(
  language: WritingLanguage,
  rendererAction: RendererActionSink,
): AgentTool<typeof Schema> {
  const text = (zhCN: string, enUS: string) => writingLanguageText(language, zhCN, enUS)

  return {
    name: 'delete_review_report',
    label: 'Delete Review Report',
    description: language === 'en-US'
      ? 'Permanently delete a review report (irreversible): deletes the report record by review_id, closes the matching review report tab, refreshes the sidebar review nodes, and detaches historical revision provenance links. Deletion is rejected while a pending revision still references the report. Use manage_review_reports (action: "list") first and obtain explicit author consent before deleting.'
      : '永久删除一份审稿报告（不可撤销）：按 review_id 删除报告记录，同时关闭对应的审稿报告 Tab、刷新侧栏审稿节点，并解除历史修订与该报告的溯源关联。若报告仍在支撑未完成的修稿，删除会被拒绝。删除前先用 manage_review_reports (action: "list") 确认目标，并取得作者明确同意。',
    parameters: Schema,
    isWriteOperation: () => true,
    execute: async (_id, params) => {
      if (!getCurrentProjectPath()) {
        throw new Error(text('未打开小说项目', 'No novel project is currently open'))
      }
      if (!getProjectDb()) {
        throw new Error(text('项目数据库未初始化', 'Project database is not initialized'))
      }

      const reviewId = params.review_id
      const meta = ReviewRepository.getMeta(reviewId)
      if (!meta) {
        throw new Error(text(
          `审稿报告不存在（ID: ${reviewId}），可能已被删除。`,
          `Review report not found (ID: ${reviewId}); it may already be deleted.`,
        ))
      }
      const chapterNumber = DraftRepository.getMeta(meta.baseDraftId)?.chapterNumber

      const result = ReviewRepository.deleteById(reviewId)
      if (!result.success) {
        switch (result.errorCode) {
          case 'REVIEW_IN_USE_BY_PENDING_REVISION':
            throw new Error(text(
              '审稿正在用于修稿，请等修稿完成后再删除。',
              'The review is in use by a pending revision; wait for the revision to finish before deleting.',
            ))
          case 'REVIEW_NOT_FOUND':
            throw new Error(text(
              '审稿报告不存在，可能已被删除。',
              'Review report not found; it may already be deleted.',
            ))
        }
      }

      // 删除已经落库；Tab 收尾与侧栏刷新失败不回滚事实，也不应报错。
      try {
        await rendererAction({
          type: 'close_editor_tab',
          target: 'review-report',
          reviewId,
          ...(chapterNumber === undefined ? {} : { chapterNumber }),
        })
      } catch {
        // 报告记录已删除，渲染层未打开时无需补动作。
      }
      try {
        await rendererAction({ type: 'refresh_reviews' })
      } catch {
        // 侧栏订阅者可能不在；下次刷新时会自然对齐。
      }

      return {
        content: [{ type: 'text', text: chapterNumber === undefined
          ? text(
            `已永久删除审稿报告 r${meta.reviewIndex}（ID: ${reviewId}），历史修订的溯源关联已解除。`,
            `Permanently deleted review report r${meta.reviewIndex} (ID: ${reviewId}); historical revision provenance links were detached.`,
          )
          : text(
            `已永久删除第 ${chapterNumber} 章审稿报告 r${meta.reviewIndex}（ID: ${reviewId}），历史修订的溯源关联已解除。`,
            `Permanently deleted the Chapter ${chapterNumber} review report r${meta.reviewIndex} (ID: ${reviewId}); historical revision provenance links were detached.`,
          ) }],
        details: {
          reviewId,
          reviewIndex: meta.reviewIndex,
          baseDraftId: meta.baseDraftId,
          ...(chapterNumber === undefined ? {} : { chapterNumber }),
        },
      }
    },
  }
}
