import type { AgentTool } from '@earendil-works/pi-agent-core'
import { StringEnum, Type } from '@earendil-works/pi-ai'

import { getCurrentProjectPath } from '../../database'
import { BlueprintRepository } from '../../repositories/blueprint-repository'
import { ConsistencyExemptionRepository } from '../../repositories/consistency-exemption-repository'
import { DraftRepository } from '../../repositories/draft-repository'
import { ProjectCoreRepository } from '../../repositories/project-core-repository'
import { ReviewRepository } from '../../repositories/review-repository'
import { SourceDraftChangedError } from '../../repositories/draft-source-guard'
import { SummaryRepository } from '../../repositories/summary-repository'
import type { RendererActionSink } from '../../../src/shared/agent-events'
import {
  findBlueprintContinuityRisks,
  mergeConsistencyFindingsIntoReview,
  type ReviewLike,
} from '../../../src/shared/consistency-preflight'
import {
  chapterGoalReviewItems,
  freezeChapterGoals,
  normalizeChapterGoalReview,
} from '../../../src/shared/chapter-goal-review'
import type { DraftStatus } from '../../../src/shared/draft-status'
import { normalizeReviewContract } from '../../../src/shared/review-contract'
import {
  writingLanguageText,
  type WritingLanguage,
} from '../../../src/shared/writing-language'

const ItemSchema = Type.Object({
  category: Type.String({
    description: '问题分类，例如：设定一致性 / 人物动机 / 情节逻辑 / 节奏 / 对白 / 伏笔 / 文风 / 文字基础。',
  }),
  severity: StringEnum(['error', 'warning', 'pass'] as const, {
    description: 'error = 硬伤或前后矛盾；warning = 建议改进；pass = 明确通过的检查项（pass 不引用原文）。',
  }),
  description: Type.String({
    description: '问题描述，说明哪里不对以及为什么。最多 200 字。',
  }),
  quote: Type.Optional(Type.String({
    description: '问题对应的原文片段，必须逐字来自当前草稿。error / warning 必填，最多 160 字。',
  })),
})

const GoalReviewSchema = Type.Object({
  id: Type.String({ description: '章节目标 id，形如 ch3:keyEvents:1；先读蓝图确认本章目标。' }),
  status: StringEnum(['completed', 'unmet', 'unknown'] as const, {
    description: '该目标在正文中的完成状态。',
  }),
  description: Type.String({ description: '判断依据或未完成原因。' }),
  evidence: Type.Optional(Type.Array(Type.Object({
    quote: Type.String({ description: '正文中逐字出现的证据片段。' }),
  }), { description: '正文证据；status 不是 unknown 时至少一条，且必须能在正文中逐字匹配。' })),
})

const Schema = Type.Object({
  chapter_number: Type.Integer({ minimum: 1, description: '被审稿的章节号。' }),
  draft_id: Type.Optional(Type.Integer({
    minimum: 1,
    description: '目标草稿版本 id；不传时默认审该章最新草稿。',
  })),
  summary: Type.String({ description: '审稿结论摘要，最多 120 字。' }),
  items: Type.Array(ItemSchema, {
    description: '审稿问题清单，1-10 条。每条 error / warning 必须带原文引用；pass 不带引用。',
  }),
  goal_reviews: Type.Optional(Type.Array(GoalReviewSchema, {
    description: '章节目标逐项核验；蓝图有本章目标时建议填写。证据必须在正文中逐字出现。',
  })),
})

interface SubmitChapterReviewDetails {
  chapterNumber: number
  draftId: number
  reviewId: number
  reviewIndex: number
  itemCount: number
}

/**
 * 审稿助手唯一的写工具：把对话中形成的审稿结论落成一条 reviews 记录，
 * 并打开现有审稿报告面板。
 *
 * 报告与草稿版本强绑定（expectedSource）：草稿在审稿期间被改动时写入失败，
 * 避免审稿单落在错误版本的正文上。
 */
export function createSubmitChapterReviewTool(
  uiLanguage: WritingLanguage,
  rendererAction: RendererActionSink,
): AgentTool<typeof Schema, SubmitChapterReviewDetails> {
  const text = (zhCN: string, enUS: string) => writingLanguageText(uiLanguage, zhCN, enUS)
  const language = uiLanguage

  return {
    name: 'submit_chapter_review',
    label: 'Submit Chapter Review',
    description: language === 'en-US'
      ? 'Submit the chapter review report: summary, severity-rated items (each error/warning must quote the draft), and optional per-goal verification. Binds the review to the current draft version, persists it, and opens the review report where the author selects items and confirms before revision. This is the only write action of the review assistant.'
      : '提交章节审稿报告：结论摘要、按严重程度分级的问题清单（每条 error / warning 必须引用草稿原文）、可选的章节目标逐项核验。报告会绑定当前草稿版本并落库，随后打开审稿报告，由作者勾选确认后再修稿。这是审稿助手唯一的写入动作。',
    parameters: Schema,
    isWriteOperation: () => true,
    execute: async (_id, params) => {
      const projectPath = getCurrentProjectPath()
      if (!projectPath) {
        throw new Error(text('未打开小说项目', 'No novel project is currently open'))
      }

      const writingLanguage = ProjectCoreRepository.get()?.writingLanguage ?? language
      const chapterNumber = params.chapter_number
      if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
        throw new Error(text('chapter_number 必须是从 1 开始的正整数', 'chapter_number must be an integer starting at 1'))
      }

      const meta = params.draft_id
        ? DraftRepository.getMeta(params.draft_id)
        : DraftRepository.getLatestByChapter(chapterNumber)
      if (!meta) {
        throw new Error(text(
          `找不到第 ${chapterNumber} 章的草稿；请先用 manage_drafts 读取确认。`,
          `No draft was found for Chapter ${chapterNumber}; confirm with manage_drafts first.`,
        ))
      }
      if (meta.chapterNumber !== chapterNumber) {
        throw new Error(text(
          `指定的草稿属于第 ${meta.chapterNumber} 章，与 chapter_number=${chapterNumber} 不一致。`,
          `The selected draft belongs to Chapter ${meta.chapterNumber}, not Chapter ${chapterNumber}.`,
        ))
      }
      const full = DraftRepository.getFull(meta.id)
      if (!full) {
        throw new Error(text(
          '读取草稿正文失败；请先确认草稿仍然存在。',
          'The draft body could not be read; confirm the draft still exists.',
        ))
      }

      let report: ReviewLike
      try {
        report = normalizeReviewContract({
          summary: params.summary,
          items: params.items,
          ...(params.goal_reviews === undefined ? {} : { goalReviews: params.goal_reviews }),
        }) as unknown as ReviewLike
      } catch {
        throw new Error(text(
          '审稿报告不符合合同：summary 最多 120 字；items 需 1-10 条；每条 description 最多 200 字且非空；error / warning 必须带 quote（引用原文，最多 160 字），pass 不带 quote。请修正后重新提交。',
          'The review report does not match the contract: summary must be at most 120 chars; items must be 1-10; each description must be non-empty and at most 200 chars; error/warning require a verbatim quote (max 160 chars); pass must not include a quote. Fix and resubmit.',
        ))
      }

      const blueprint = BlueprintRepository.getByChapter(chapterNumber)
      report = applyChapterGoalReview(report, blueprint, full.content, chapterNumber, writingLanguage, text)
      report = applyContinuityPreflight(report, chapterNumber, blueprint, writingLanguage)

      const content = JSON.stringify(report, null, 2)
      let created: { id: number; reviewIndex: number }
      try {
        created = ReviewRepository.create({
          baseDraftId: meta.id,
          content,
          expectedSource: {
            id: meta.id,
            chapterNumber: meta.chapterNumber,
            version: meta.version,
            status: meta.status as DraftStatus,
            content: full.content,
          },
        })
      } catch (error) {
        if (error instanceof SourceDraftChangedError) {
          throw new Error(text(
            '草稿在审稿期间发生了变化，报告未保存；请重新读取最新草稿后再提交一次审稿。',
            'The draft changed during the review, so the report was not saved. Read the latest draft again and resubmit the review.',
          ))
        }
        throw new Error(text(
          `保存审稿报告失败：${error instanceof Error ? error.message : String(error)}`,
          `Could not save the review report: ${error instanceof Error ? error.message : String(error)}`,
        ))
      }

      const itemCount = Array.isArray(report.items) ? report.items.length : 0
      try {
        await rendererAction({
          type: 'open_review_report',
          chapterNumber,
          draftId: meta.id,
          draftPath: `vela://draft/${meta.id}`,
          chapterDir: `vela://draft/ch${chapterNumber}`,
          reportPath: `vela://draft/ch${chapterNumber}/v${meta.version}/review${created.reviewIndex}`,
          reviewId: created.id,
          reviewIndex: created.reviewIndex,
          content,
        })
      } catch {
        // 报告已经落库；打开面板失败不影响审稿事实，用户仍可从草稿工具栏打开。
      }

      return {
        content: [{
          type: 'text',
          text: text(
            `审稿报告已保存并打开（第 ${chapterNumber} 章，r${created.reviewIndex}，共 ${itemCount} 条）。请作者在报告里勾选要采纳的问题并确认清单；确认后即可走「根据意见修稿」。`,
            `The review report was saved and opened (Chapter ${chapterNumber}, r${created.reviewIndex}, ${itemCount} items). Ask the author to select items and confirm the checklist; the confirmed checklist can drive the revision.`,
          ),
        }],
        details: {
          chapterNumber,
          draftId: meta.id,
          reviewId: created.id,
          reviewIndex: created.reviewIndex,
          itemCount,
        },
      }
    },
  }
}

/** ProjectCoreRepository 未初始化时沿用工具构造时的语言，不丢本地化。 */
type LanguageText = (zhCN: string, enUS: string) => string

function applyChapterGoalReview(
  report: ReviewLike,
  blueprint: ReturnType<typeof BlueprintRepository.getByChapter>,
  draft: string,
  chapterNumber: number,
  language: WritingLanguage,
  text: LanguageText,
): ReviewLike {
  // 没有蓝图就没有可核对的本章目标；此时不生成目标核验项。
  if (!blueprint) return report
  const frozenGoals = freezeChapterGoals(chapterNumber, blueprint.keyEvents)
  if (frozenGoals.coverage === 'not_configured') return report

  const raw = (report as Record<string, unknown>).goalReviews
  const goalReview = normalizeChapterGoalReview(raw, frozenGoals, draft, language)
  const next: ReviewLike = { ...report, goalReview }
  delete (next as Record<string, unknown>).goalReviews
  next.items = [...(Array.isArray(report.items) ? report.items : []), ...chapterGoalReviewItems(goalReview, language)]

  if (next.items.some(item => item.severity === 'unknown')) {
    next.summary = text('审稿包含待核实项目，不能视为全部通过。', 'The review contains unresolved items and is not an overall pass.')
  } else if (goalReview.items.some(item => item.status === 'unmet')) {
    next.summary = text('本章存在尚未完成的目标，请核对逐项证据。', 'Some chapter goals are unmet; check their evidence.')
  }
  return next
}

function applyContinuityPreflight(
  report: ReviewLike,
  chapterNumber: number,
  blueprint: ReturnType<typeof BlueprintRepository.getByChapter>,
  language: WritingLanguage,
): ReviewLike {
  if (!blueprint) return report
  try {
    const projections = SummaryRepository.listFinalizedContinuityBefore(chapterNumber)
    const exemptions = ConsistencyExemptionRepository.list()
    const findings = findBlueprintContinuityRisks(projections, blueprint, exemptions)
    if (findings.length === 0) return report
    return mergeConsistencyFindingsIntoReview(report, findings, language)
  } catch {
    // 确定性预检不可用时，审稿报告仍按 LLM 结论落库；不阻断主流程。
    return report
  }
}
