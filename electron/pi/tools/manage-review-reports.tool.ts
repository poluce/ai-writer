import type { AgentTool } from '@earendil-works/pi-agent-core'
import { StringEnum, Type } from '@earendil-works/pi-ai'

import { getCurrentProjectPath, getProjectDb } from '../../database'
import { DraftRepository } from '../../repositories/draft-repository'
import {
  ReviewRepository,
  type ReviewFull,
  type ReviewMeta,
  type ReviewSummary,
} from '../../repositories/review-repository'
import type { RendererActionSink } from '../renderer-action'
import {
  parseHumanConfirmedReviewSnapshot,
  renderHumanConfirmedReviewBrief,
} from '../../../src/shared/human-confirmed-review'
import {
  writingLanguageText,
  type WritingLanguage,
} from '../../../src/shared/writing-language'

/**
 * 非破坏性审稿报告管理工具：列出报告元数据、读取报告正文、关闭已打开的 Tab。
 *
 * 报告正文以结构化 JSON 存在 reviews.content 里；读取动作让助手拿到与作者
 * 看板一致的摘要、问题清单与章节目标核验，避免绕过工具去翻数据库。
 * 删除是独立工具 delete_review_report 的职责。
 */
export const REVIEW_REPORT_ACTIONS = ['list', 'read', 'close'] as const

type ReviewReportAction = typeof REVIEW_REPORT_ACTIONS[number]

function resolveReviewReportAction(rawAction: string): ReviewReportAction {
  if (rawAction === 'close' || rawAction === '关闭' || rawAction === '收起') return 'close'
  if (rawAction === 'read' || rawAction === '读取' || rawAction === '查看') return 'read'
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function goalStatusLabel(status: string, isEn: boolean): string {
  if (status === 'completed') return isEn ? 'completed' : '已完成'
  if (status === 'unmet') return isEn ? 'unmet' : '未完成'
  return isEn ? 'unknown' : '待核实'
}

function formatReviewReport(
  full: ReviewFull,
  chapterNumber: number,
  draftVersion: number,
  isEn: boolean,
  language: WritingLanguage,
): string {
  const kindLabel = full.kind === 'confirmation'
    ? (isEn ? 'author confirmation snapshot' : '人工确认快照')
    : (isEn ? 'AI review' : 'AI 审稿')
  const lines: string[] = [
    isEn
      ? `### Review report (ID ${full.id} · Chapter ${chapterNumber} r${full.reviewIndex} · draft v${draftVersion} · ${kindLabel} · created ${full.createdAt})`
      : `### 审稿报告（ID ${full.id} · 第 ${chapterNumber} 章 r${full.reviewIndex} · 草稿 v${draftVersion} · ${kindLabel} · 创建于 ${full.createdAt}）`,
  ]
  if (full.sourceReviewId !== null) {
    lines.push(isEn ? `Source review: ${full.sourceReviewId}` : `来源审稿：${full.sourceReviewId}`)
  }

  if (full.kind === 'confirmation') {
    const snapshot = parseHumanConfirmedReviewSnapshot(full.content)
    lines.push('')
    if (snapshot) {
      lines.push(isEn ? '### Confirmed checklist' : '### 作者确认的修稿清单')
      lines.push(renderHumanConfirmedReviewBrief(snapshot, language))
    } else {
      lines.push(isEn
        ? 'The confirmation snapshot could not be parsed; returning the raw body:'
        : '确认快照无法解析；以下为原文：')
      lines.push('')
      lines.push('```')
      lines.push(full.content)
      lines.push('```')
    }
    return lines.join('\n')
  }

  let parsed: unknown = null
  try {
    parsed = JSON.parse(full.content)
  } catch {
    parsed = null
  }
  if (!isRecord(parsed)) {
    lines.push('')
    lines.push(isEn
      ? 'The stored body is not structured JSON; returning it verbatim:'
      : '报告正文不是结构化 JSON，按原文返回：')
    lines.push('')
    lines.push('```')
    lines.push(full.content)
    lines.push('```')
    return lines.join('\n')
  }

  const summary = typeof parsed.summary === 'string' ? parsed.summary : ''
  const items = Array.isArray(parsed.items) ? parsed.items.filter(isRecord) : []
  lines.push('')
  lines.push(`${isEn ? 'Summary' : '摘要'}：${summary || (isEn ? '(none)' : '（无）')}`)
  lines.push(`${isEn ? `Items (${items.length})` : `问题清单（${items.length} 条）`}：`)
  items.forEach((item, index) => {
    const severity = typeof item.severity === 'string' ? item.severity : 'warning'
    const category = typeof item.category === 'string' ? item.category : ''
    const description = typeof item.description === 'string' ? item.description : ''
    lines.push(`${index + 1}. [${severity}] ${category}`)
    lines.push(`   ${isEn ? 'Details' : '描述'}：${description}`)
    if (typeof item.quote === 'string' && item.quote.trim()) {
      lines.push(`   ${isEn ? 'Quote' : '原文引用'}：「${item.quote}」`)
    }
  })

  const rawGoalReview = parsed.goalReview ?? parsed.goalReviews
  if (isRecord(rawGoalReview) && Array.isArray(rawGoalReview.items) && rawGoalReview.items.length > 0) {
    lines.push('')
    lines.push(isEn ? 'Chapter goals:' : '章节目标核验：')
    for (const goal of rawGoalReview.items.filter(isRecord)) {
      const id = typeof goal.id === 'string' ? goal.id : ''
      const status = typeof goal.status === 'string' ? goal.status : 'unknown'
      lines.push(`- ${id} · ${goalStatusLabel(status, isEn)}`)
      if (typeof goal.description === 'string' && goal.description.trim()) {
        lines.push(`  ${isEn ? 'Reason' : '依据'}：${goal.description}`)
      }
      const evidence = Array.isArray(goal.evidence) ? goal.evidence.filter(isRecord) : []
      for (const entry of evidence) {
        if (typeof entry.quote === 'string' && entry.quote.trim()) {
          lines.push(`  ${isEn ? 'Evidence' : '证据'}：「${entry.quote}」`)
        }
      }
    }
  }

  const confirmation = ReviewRepository.getLatestConfirmation(full.id)
  lines.push('')
  if (confirmation) {
    const confirmedSnapshot = parseHumanConfirmedReviewSnapshot(confirmation.content)
    if (confirmedSnapshot) {
      lines.push(isEn
        ? `### Author-confirmed checklist (snapshot ID ${confirmation.id})`
        : `### 作者已确认的修稿清单（确认快照 ID ${confirmation.id}）`)
      lines.push(renderHumanConfirmedReviewBrief(confirmedSnapshot, language))
    } else {
      lines.push(isEn
        ? 'A confirmation snapshot exists but could not be parsed; use the full report above.'
        : '存在确认快照但无法解析；请以完整报告为准。')
    }
  } else {
    lines.push(isEn
      ? 'The author has not confirmed this checklist yet; treat the full report above as reference and ask the author to confirm before revising.'
      : '作者尚未确认这份清单；以上完整报告仅作参考，修稿前请先请作者确认。')
  }

  return lines.join('\n')
}

function resolveReviewForRead(
  reviewId: number | undefined,
  draftId: number | undefined,
  chapterNumber: number | undefined,
  text: (zhCN: string, enUS: string) => string,
): ReviewFull {
  let meta: ReviewMeta | null = null
  if (reviewId !== undefined) {
    meta = ReviewRepository.getMeta(reviewId)
  } else {
    const summaries = chapterNumber !== undefined
      ? ReviewRepository.listSummaries({ chapterNumber })
      : draftId !== undefined
        ? ReviewRepository.listSummaries({ draftId })
        : []
    meta = summaries.at(-1) ?? null
  }
  if (!meta) {
    throw new Error(text(
      '没有找到匹配的审稿报告；请用 list 确认报告 ID，或提供 review_id / chapter_number / draft_id。',
      'No matching review report was found; use list to confirm the report ID, or pass review_id / chapter_number / draft_id.',
    ))
  }
  const full = ReviewRepository.getFull(meta.id)
  if (!full) {
    throw new Error(text(
      `审稿报告 ${meta.id} 的正文读取失败。`,
      `The body of review report ${meta.id} could not be read.`,
    ))
  }
  return full
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
      ? 'Review report manager: action "list" lists report metadata and supports filtering by review_id, draft_id, or chapter_number; action "read" returns the report body (summary, severity-rated items with verbatim quotes, and chapter-goal verification) for a review_id, or the latest report for a chapter_number / draft_id; action "close" closes open review report tabs. Use delete_review_report to permanently delete a report.'
      : '审稿报告管理工具：action "list" 列出报告元数据，可按 review_id、draft_id 或 chapter_number 过滤；action "read" 读取报告正文（摘要、带原文引用的分级问题清单、章节目标核验），可用 review_id 精确读取，或按 chapter_number / draft_id 读取最新一份；action "close" 关闭主工作区中已打开的审稿报告 Tab。永久删除报告请使用 delete_review_report。',
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

      if (action === 'read') {
        const full = resolveReviewForRead(reviewId, draftId, chapterNumber, text)
        const draft = DraftRepository.getMeta(full.baseDraftId)
        const targetChapter = draft?.chapterNumber ?? chapterNumber ?? 0
        const draftVersion = draft?.version ?? 0
        return {
          content: [{ type: 'text', text: formatReviewReport(full, targetChapter, draftVersion, isEn, language) }],
          details: {
            action,
            reviewId: full.id,
            chapterNumber: targetChapter,
            draftVersion,
            reviewIndex: full.reviewIndex,
            kind: full.kind,
            sourceReviewId: full.sourceReviewId,
            content: full.content,
            ...(full.kind === 'review'
              ? { confirmedReviewId: ReviewRepository.getLatestConfirmation(full.id)?.id ?? null }
              : {}),
          },
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
        '操作类型："list" 列出审稿报告元数据（默认）；"read" 读取报告正文（摘要、问题清单与章节目标核验）；"close" 关闭主工作区中已打开的审稿报告 Tab。',
        'Operation: "list" lists review report metadata (default); "read" returns the report body with summary, items, and chapter-goal verification; "close" closes open review report tabs in the main workspace.',
      ),
    })),
    review_id: Type.Optional(Type.Integer({
      minimum: 1,
      description: text(
        '审稿报告数据库 ID（list 过滤 / read 精确读取 / close 定位均可使用）。',
        'Review report database ID (used for filtering with list, reading with read, or targeting with close).',
      ),
    })),
    draft_id: Type.Optional(Type.Integer({
      minimum: 1,
      description: text(
        '草稿版本 ID：list 时只列出该草稿派生的审稿报告；read 时读取该草稿最新一份报告。',
        'Draft version ID: list only review reports derived from that draft; read the latest report for that draft.',
      ),
    })),
    chapter_number: Type.Optional(Type.Integer({
      minimum: 1,
      description: text(
        '章节序号：list/close 该章报告；read 时读取该章最新一份报告。',
        'Chapter number: list or close reports for that chapter; read the latest report for that chapter.',
      ),
    })),
  })
}
