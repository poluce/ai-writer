import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createReadContinuityFactsTool } from '../read-continuity-facts.tool'
import { SummaryRepository } from '../../../repositories/summary-repository'
import * as databaseModule from '../../../database'

vi.mock('../../../repositories/summary-repository', () => ({
  SummaryRepository: { listFinalizedContinuityBefore: vi.fn() },
}))

vi.mock('../../../database', () => ({
  getCurrentProjectPath: vi.fn(),
}))

function textOf(res: { content: Array<{ type: string; text?: string }> }): string {
  const first = res.content[0]
  if (!first || first.type !== 'text' || typeof first.text !== 'string') {
    throw new Error('expected text content')
  }
  return first.text
}

function projection(chapterNumber: number, statement = '林霜已经死亡') {
  return {
    draftId: chapterNumber,
    chapterNumber,
    chapterTitle: `第${chapterNumber}章标题`,
    chapterNotes: `第${chapterNumber}章要点`,
    facts: [{
      category: 'character-state',
      entities: ['林霜'],
      statement,
      sourceChapter: chapterNumber,
      evidence: '原文证据',
    }],
    sourceStatus: 'current',
  }
}

describe('read_continuity_facts tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(databaseModule.getCurrentProjectPath).mockReturnValue('/workspace/novel')
  })

  it('returns finalized continuity facts before the requested chapter', async () => {
    vi.mocked(SummaryRepository.listFinalizedContinuityBefore).mockReturnValue([
      projection(1),
      projection(2),
    ] as never)
    const tool = createReadContinuityFactsTool('zh-CN')

    const result = await tool.execute('call-1', { before_chapter: 3 })

    expect(SummaryRepository.listFinalizedContinuityBefore).toHaveBeenCalledWith(3)
    expect(result.details).toMatchObject({ chapters: 2, facts: 2 })
    const text = textOf(result)
    expect(text).toContain('已定稿连续性事实')
    expect(text).toContain('第1章要点')
    expect(text).toContain('林霜已经死亡')
  })

  it('limits how many chapters are shown and reports the omission', async () => {
    vi.mocked(SummaryRepository.listFinalizedContinuityBefore).mockReturnValue([
      projection(1),
      projection(2),
      projection(3),
    ] as never)
    const tool = createReadContinuityFactsTool('zh-CN')

    const result = await tool.execute('call-2', { before_chapter: 4, limit: 2 })

    const text = textOf(result)
    expect(text).not.toContain('第1章要点')
    expect(text).toContain('第2章要点')
    expect(text).toContain('第3章要点')
    expect(text).toContain('另有 1 章')
  })

  it('explains when there is no finalized history yet', async () => {
    vi.mocked(SummaryRepository.listFinalizedContinuityBefore).mockReturnValue([])
    const tool = createReadContinuityFactsTool('zh-CN')

    const result = await tool.execute('call-3', { before_chapter: 2 })

    expect(result.details).toMatchObject({ chapters: 0, facts: 0 })
    expect(textOf(result)).toContain('没有已定稿章节')
  })

  it('rejects when no project is open', async () => {
    vi.mocked(databaseModule.getCurrentProjectPath).mockReturnValue(null)
    const tool = createReadContinuityFactsTool('zh-CN')

    await expect(tool.execute('call-4', { before_chapter: 2 }))
      .rejects.toThrow('未打开小说项目')
  })
})
