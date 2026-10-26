import type { AgentTool } from '@earendil-works/pi-agent-core'
import { StringEnum, Type } from '@earendil-works/pi-ai'

import { getCurrentProjectPath, getProjectDb } from '../../database'
import { DraftRepository } from '../../repositories/draft-repository'
import { ReviewRepository, type ReviewSummary } from '../../repositories/review-repository'
import type { RendererActionSink } from '../renderer-action'
import {
  writingLanguageText,
  type WritingLanguage,
} from '../../../src/shared/writing-language'

/**
 * 非破坏性审稿报告管理工具：列出报告元数据、关闭已打开的报告 Tab。
 *
 * 报告正文是渲染层解析的审稿看板数据；主进程只读元数据，不解析报告内容，
 * 也不承担任何删除语义（删除是独立工具 delete_review_report）。
 */
export const REVIEW_REPORT_ACTIONS = ['list', 'close'] as const

type ReviewReportAction = typeof REVIEW_REPORT_ACTIONS[number]

function resolveReviewReportAction(rawAction: string): ReviewReportAction {
  if (rawAction === 'close' || rawAction === '关闭' || rawAction === '收起') return 'close'
  return 'list'
}

function requireOpenProject(text: (zhCN: string, enUS: string) => string): void {
  if (!getCurrentProjectPath()) {
    throw new Error(text('未打开小说项目', 'No novel project is currently open'))
  }
  if (!getProjectDb()) {
    throw new Error(text('项目数据库未初始化', 'Project database is not initialized'))
  }
}

function formatReviewLine(item: ReviewSummary, isEn: boolean): string {
  return isEn
    ? `- Chapter ${item.chapterNumber} r${item.reviewIndex} (ID: ${item.id} · draft v${item.draftVersion} · created ${item.createdAt})`
    : `- 第 ${item.chapterNumber} 章 r${item.reviewIndex}（ID: ${item.id} · 草稿 v${item.draftVersion} · 创建于 ${item.createdAt}）`
}

export function createManageReviewReportsTool(
  language: WritingLanguage,
  rendererAction: RendererActionSink,
): AgentTool<ReturnType<typeof buildSchema>> {
  const isEn = language === 'en-US'
  const text = (zhCN: string, enUS: string) => writingLanguageText(language, zhCN, enUS)
  const schema = buildSchema(language)

  return {
    name: 'manage_review_reports',
    label: 'Manage Review Reports',
    description: isEn
      ? 'Non-destructive review report manager: action "list" lists review report metadata (chapter, review index, ID, creation time; report bodies are not read) and supports filtering by review_id, draft_id, or chapter_number; action "close" closes open review report tabs in the main workspace (matched by review_id or chapter_number). Use delete_review_report to permanently delete a report.'
      : '非破坏性审稿报告管理工具：action "list" 列出审稿报告元数据（章节、序号、ID、创建时间，不读取报告正文），可按 review_id、draft_id 或 chapter_number 过滤；action "close" 关闭主工作区中已打开的审稿报告 Tab（按 review_id 或 chapter_number 匹配）。永久删除报告请使用 delete_review_report。',
    parameters: schema,
    execute: async (_id, params) => {
      requireOpenProject(text)

      const action = resolveReviewReportAction(String(params.action ?? 'list').toLowerCase().trim())
      const reviewId = params.review_id
      const draftId = params.draft_id
      const chapterNumber = params.chapter_number

      if (action === 'list') {
        const reports = ReviewRepository.listSummaries({ reviewId, draftId, chapterNumber })
        if (reports.length === 0) {
          return {
            content: [{ type: 'text', text: text(
              '当前项目没有匹配的审稿报告。',
              'No matching review reports in the current project.',
            ) }],
            details: { action, total: 0, reports: [] },
          }
        }

        const lines: string[] = [
          text(
            `### 审稿报告清单（共 ${reports.length} 份）：\n`,
            `### Review Reports (${reports.length} total):\n`,
          ),
        ]
        for (const item of reports) lines.push(formatReviewLine(item, isEn))

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          details: { action, total: reports.length, reports },
        }
      }

      if (reviewId !== undefined) {
        const meta = ReviewRepository.getMeta(reviewId)
        if (!meta) {
          throw new Error(text(
            `未找到 ID 为 ${reviewId} 的审稿报告。`,
            `Review report with ID ${reviewId} was not found.`,
          ))
        }
        const targetChapter = chapterNumber
          ?? DraftRepository.getMeta(meta.baseDraftId)?.chapterNumber
        await rendererAction({
          type: 'close_editor_tab',
          target: 'review-report',
          reviewId,
          ...(targetChapter === undefined ? {} : { chapterNumber: targetChapter }),
        })
        return {
          content: [{ type: 'text', text: targetChapter === undefined
            ? text(
              `已关闭审稿报告（ID: ${reviewId}）的 Tab。`,
              `Closed the review report tab (ID: ${reviewId}).`,
            )
            : text(
              `已关闭第 ${targetChapter} 章审稿报告 r${meta.reviewIndex}（ID: ${reviewId}）的 Tab。`,
              `Closed the Chapter ${targetChapter} review report r${meta.reviewIndex} tab (ID: ${reviewId}).`,
            ) }],
          details: {
            action,
            reviewId,
            reviewIndex: meta.reviewIndex,
            ...(targetChapter === undefined ? {} : { chapterNumber: targetChapter }),
          },
        }
      }

      if (chapterNumber === undefined) {
        throw new Error(text(
          'close 操作必须提供 review_id 或 chapter_number。',
          'close requires either review_id or chapter_number.',
        ))
      }

      await rendererAction({ type: 'close_editor_tab', target: 'review-report', chapterNumber })
      return {
        content: [{ type: 'text', text: text(
          `已关闭第 ${chapterNumber} 章的审稿报告 Tab。`,
          `Closed the review report tabs for Chapter ${chapterNumber}.`,
        ) }],
        details: { action, chapterNumber },
      }
    },
  }
}

function buildSchema(language: WritingLanguage) {
  const text = (zhCN: string, enUS: string) => writingLanguageText(language, zhCN, enUS)
  return Type.Object({
    action: Type.Optional(StringEnum(REVIEW_REPORT_ACTIONS, {
      description: text(
        '操作类型："list" 列出审稿报告元数据（默认）；"close" 关闭主工作区中已打开的审稿报告 Tab。',
        'Operation: "list" lists review report metadata (default); "close" closes open review report tabs in the main workspace.',
      ),
    })),
    review_id: Type.Optional(Type.Integer({
      minimum: 1,
      description: text(
        '审稿报告数据库 ID（list 过滤 / close 定位均可使用）。',
        'Review report database ID (used for filtering with list or targeting with close).',
      ),
    })),
    draft_id: Type.Optional(Type.Integer({
      minimum: 1,
      description: text(
        '草稿版本 ID：只列出该草稿派生的审稿报告。',
        'Draft version ID: list only review reports derived from that draft.',
      ),
    })),
    chapter_number: Type.Optional(Type.Integer({
      minimum: 1,
      description: text(
        '章节序号：只列出/关闭该章的审稿报告。',
        'Chapter number: list or close review reports for that chapter.',
      ),
    })),
  })
}
