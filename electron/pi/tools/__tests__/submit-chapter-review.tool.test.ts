import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSubmitChapterReviewTool } from '../submit-chapter-review.tool'
import { SourceDraftChangedError } from '../../../repositories/draft-source-guard'
import { BlueprintRepository } from '../../../repositories/blueprint-repository'
import { ConsistencyExemptionRepository } from '../../../repositories/consistency-exemption-repository'
import { DraftRepository } from '../../../repositories/draft-repository'
import { ProjectCoreRepository } from '../../../repositories/project-core-repository'
import { ReviewRepository } from '../../../repositories/review-repository'
import { SummaryRepository } from '../../../repositories/summary-repository'
import * as databaseModule from '../../../database'

vi.mock('../../../repositories/blueprint-repository', () => ({
  BlueprintRepository: { getByChapter: vi.fn() },
}))

vi.mock('../../../repositories/consistency-exemption-repository', () => ({
  ConsistencyExemptionRepository: { list: vi.fn() },
}))

vi.mock('../../../repositories/draft-repository', () => ({
  DraftRepository: {
    getMeta: vi.fn(),
    getLatestByChapter: vi.fn(),
    getFull: vi.fn(),
  },
}))

vi.mock('../../../repositories/project-core-repository', () => ({
  ProjectCoreRepository: { get: vi.fn() },
}))

vi.mock('../../../repositories/review-repository', () => ({
  ReviewRepository: { create: vi.fn() },
}))

vi.mock('../../../repositories/summary-repository', () => ({
  SummaryRepository: { listFinalizedContinuityBefore: vi.fn() },
}))

vi.mock('../../../database', () => ({
  getCurrentProjectPath: vi.fn(),
}))

const DRAFT_BODY = '陆舟站在山门前，雨声很密。他握紧玉佩，忽然听见脚步。'

function draftMeta(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 7,
    chapterNumber: 1,
    chapterTitle: '山门雨夜',
    version: 1,
    status: 'draft',
    source: 'write',
    contentId: 70,
    wordCount: DRAFT_BODY.length,
    sourceDependencies: [],
    dependenciesStale: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function blueprint(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    chapterNumber: 1,
    title: '山门雨夜',
    role: '开端',
    purpose: '建立主角处境',
    keyEvents: '陆舟发现玉佩异样',
    characters: ['陆舟'],
    suspenseHook: '脚步声是谁',
    userGuidance: '',
    notes: '',
    notesUpdatedAt: '',
    ...overrides,
  }
}

function textOf(res: { content: Array<{ type: string; text?: string }> }): string {
  const first = res.content[0]
  if (!first || first.type !== 'text' || typeof first.text !== 'string') {
    throw new Error('expected text content')
  }
  return first.text
}

describe('submit_chapter_review tool', () => {
  const rendererAction = vi.fn(async () => ({ ok: true as const, summary: 'opened' }))

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(databaseModule.getCurrentProjectPath).mockReturnValue('/workspace/novel')
    vi.mocked(ProjectCoreRepository.get).mockReturnValue({ writingLanguage: 'zh-CN' } as never)
    vi.mocked(DraftRepository.getLatestByChapter).mockReturnValue(draftMeta() as never)
    vi.mocked(DraftRepository.getFull).mockReturnValue({ ...draftMeta(), content: DRAFT_BODY } as never)
    vi.mocked(BlueprintRepository.getByChapter).mockReturnValue(null)
    vi.mocked(SummaryRepository.listFinalizedContinuityBefore).mockReturnValue([])
    vi.mocked(ConsistencyExemptionRepository.list).mockReturnValue([])
    vi.mocked(ReviewRepository.create).mockReturnValue({ id: 55, reviewIndex: 1 })
  })

  it('persists a valid review bound to the current draft and opens the report', async () => {
    const tool = createSubmitChapterReviewTool('zh-CN', rendererAction)

    const result = await tool.execute('call-1', {
      chapter_number: 1,
      summary: '本章节奏稳，但有一处人物动机需要补足。',
      items: [
        {
          category: '人物动机',
          severity: 'warning',
          description: '陆舟在雨夜突然听见脚步就握紧玉佩，缺少警觉来源的铺垫。',
          quote: '他握紧玉佩，忽然听见脚步',
        },
      ],
    })

    expect(result.details).toMatchObject({ chapterNumber: 1, draftId: 7, reviewId: 55, reviewIndex: 1, itemCount: 1 })
    expect(textOf(result)).toContain('审稿报告已保存并打开')

    expect(DraftRepository.getLatestByChapter).toHaveBeenCalledWith(1)
    expect(ReviewRepository.create).toHaveBeenCalledTimes(1)
    const createParams = vi.mocked(ReviewRepository.create).mock.calls[0][0]
    expect(createParams.baseDraftId).toBe(7)
    expect(createParams.expectedSource).toEqual({
      id: 7,
      chapterNumber: 1,
      version: 1,
      status: 'draft',
      content: DRAFT_BODY,
    })
    const saved = JSON.parse(createParams.content)
    expect(saved.summary).toContain('节奏稳')
    expect(saved.items[0]).toMatchObject({ category: '人物动机', severity: 'warning' })

    expect(rendererAction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'open_review_report',
      chapterNumber: 1,
      draftId: 7,
      reviewId: 55,
      reviewIndex: 1,
      draftPath: 'vela://draft/7',
      chapterDir: 'vela://draft/ch1',
    }))
  })

  it('rejects an invalid contract before writing anything', async () => {
    const tool = createSubmitChapterReviewTool('zh-CN', rendererAction)

    await expect(tool.execute('call-2', {
      chapter_number: 1,
      summary: '问题',
      items: [
        {
          category: '文字基础',
          severity: 'warning',
          description: '错别字',
          // 缺 quote：warning / error 必须带原文引用。
        },
      ],
    })).rejects.toThrow('审稿报告不符合合同')

    expect(ReviewRepository.create).not.toHaveBeenCalled()
    expect(rendererAction).not.toHaveBeenCalled()
  })

  it('rejects a draft whose chapter does not match the requested chapter', async () => {
    const tool = createSubmitChapterReviewTool('zh-CN', rendererAction)

    await expect(tool.execute('call-3', {
      chapter_number: 2,
      summary: '问题',
      items: [{ category: '情节逻辑', severity: 'pass', description: '本章因果闭合' }],
    })).rejects.toThrow('不一致')
  })

  it('reports a friendly error when the draft changed mid-review', async () => {
    vi.mocked(ReviewRepository.create).mockImplementation(() => {
      throw new SourceDraftChangedError()
    })
    const tool = createSubmitChapterReviewTool('zh-CN', rendererAction)

    await expect(tool.execute('call-4', {
      chapter_number: 1,
      summary: '问题',
      items: [{ category: '情节逻辑', severity: 'pass', description: '本章因果闭合' }],
    })).rejects.toThrow('草稿在审稿期间发生了变化')
  })

  it('normalizes chapter goal reviews against the blueprint', async () => {
    vi.mocked(BlueprintRepository.getByChapter).mockReturnValue(blueprint() as never)
    const tool = createSubmitChapterReviewTool('zh-CN', rendererAction)

    const result = await tool.execute('call-5', {
      chapter_number: 1,
      summary: '本章目标基本完成。',
      items: [{ category: '情节逻辑', severity: 'pass', description: '推进顺畅' }],
      goal_reviews: [{
        id: 'ch1:keyEvents:1',
        status: 'completed',
        description: '主角注意到玉佩的异样。',
        evidence: [{ quote: '他握紧玉佩' }],
      }],
    })

    const createParams = vi.mocked(ReviewRepository.create).mock.calls[0][0]
    const saved = JSON.parse(createParams.content)
    expect(saved.goalReviews).toBeUndefined()
    expect(saved.goalReview).toMatchObject({ version: 1, chapterNumber: 1, coverage: 'complete' })
    expect(saved.goalReview.items[0].status).toBe('completed')
    expect(saved.items.some((item: { category: string }) => item.category === '本章目标')).toBe(true)
    expect(result.details.itemCount).toBe(2)
  })

  it('merges deterministic continuity preflight findings into the report', async () => {
    vi.mocked(BlueprintRepository.getByChapter).mockReturnValue(blueprint({ characters: ['林霜'] }) as never)
    vi.mocked(SummaryRepository.listFinalizedContinuityBefore).mockReturnValue([{
      draftId: 3,
      chapterNumber: 1,
      chapterTitle: '前章',
      chapterNotes: '',
      facts: [{
        category: 'character-state',
        entities: ['林霜'],
        statement: '林霜已经死亡',
        sourceChapter: 1,
        evidence: '林霜当场气绝',
      }],
      sourceStatus: 'current',
    }] as never)
    const tool = createSubmitChapterReviewTool('zh-CN', rendererAction)

    await tool.execute('call-6', {
      chapter_number: 1,
      summary: '审查完成。',
      items: [{ category: '情节逻辑', severity: 'pass', description: '推进顺畅' }],
    })

    const createParams = vi.mocked(ReviewRepository.create).mock.calls[0][0]
    const saved = JSON.parse(createParams.content)
    expect(saved.items.some((item: { category: string }) => item.category === '确定性一致性预检')).toBe(true)
  })
})
