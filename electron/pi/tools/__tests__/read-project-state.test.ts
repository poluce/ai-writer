import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createReadProjectStateTool } from '../read-project-state.tool'

vi.mock('../../../repositories/project-core-repository', () => ({
  ProjectCoreRepository: { get: vi.fn() },
}))
vi.mock('../../../repositories/blueprint-repository', () => ({
  BlueprintRepository: { getAll: vi.fn() },
}))
vi.mock('../../../repositories/draft-repository', () => ({
  DraftRepository: { listAll: vi.fn() },
}))
vi.mock('../../../repositories/finalization-repository', () => ({
  FinalizationRepository: { listRecent: vi.fn() },
}))
vi.mock('../../../repositories/post-process-repository', () => ({
  PostProcessRepository: { listRuns: vi.fn(), getSteps: vi.fn() },
}))

import { ProjectCoreRepository } from '../../../repositories/project-core-repository'
import { BlueprintRepository } from '../../../repositories/blueprint-repository'
import { DraftRepository } from '../../../repositories/draft-repository'
import { FinalizationRepository } from '../../../repositories/finalization-repository'
import { PostProcessRepository } from '../../../repositories/post-process-repository'

const coreGetMock = ProjectCoreRepository.get as ReturnType<typeof vi.fn>
const bpGetAllMock = BlueprintRepository.getAll as ReturnType<typeof vi.fn>
const draftListMock = DraftRepository.listAll as ReturnType<typeof vi.fn>
const finalizationListMock = FinalizationRepository.listRecent as ReturnType<typeof vi.fn>
const postProcessListMock = PostProcessRepository.listRuns as ReturnType<typeof vi.fn>
const postProcessStepsMock = PostProcessRepository.getSteps as ReturnType<typeof vi.fn>

beforeEach(() => {
  coreGetMock.mockReset()
  bpGetAllMock.mockReset()
  draftListMock.mockReset()
  draftListMock.mockReturnValue([])
  finalizationListMock.mockReset()
  finalizationListMock.mockReturnValue([])
  postProcessListMock.mockReset()
  postProcessListMock.mockReturnValue([])
  postProcessStepsMock.mockReset()
  postProcessStepsMock.mockReturnValue([])
})

describe('read_project_state', () => {
  it('renders config, chapter progress, recent notes, and the blueprint list by default', async () => {
    coreGetMock.mockReturnValue({
      projectName: '测试小说', genre: 'fantasy', subGenre: '', targetAudience: 'male',
      totalChapters: 10, wordsPerChapter: 2000, plotStructure: 'three-act',
      narrativePov: 'third', writingStyle: '简洁',
    })
    bpGetAllMock.mockReturnValue([
      { chapterNumber: 2, title: '第二章', notes: '要点2' },
      { chapterNumber: 1, title: '第一章', notes: '要点1' },
    ])
    draftListMock.mockReturnValue([
      { chapterNumber: 1, status: 'finalized' },
      { chapterNumber: 2, status: 'draft' },
    ])

    const tool = createReadProjectStateTool('zh-CN')
    const result = await tool.execute('c1', {})
    const first = result.content[0]
    if (first.type !== 'text') throw new Error('expected text content')
    expect(first.text).toContain('测试小说')
    expect(first.text).toContain('小说配置')
    expect(first.text).toContain('章节进度')
    expect(first.text).toContain('| 1 | ✅ | ✅ | ✅ |')
    expect(first.text).toContain('| 2 | ✅ | ✅ | ❌ |')
    expect(first.text).toContain('近章要点')
    expect(first.text).toContain('要点1')
    expect(first.text).toContain('蓝图清单（2 个）')
    expect(first.text).toContain('第 1 章: 第一章')
    expect(result.details).toMatchObject({ chapters: 2 })
  })

  it('returns only the requested sections', async () => {
    coreGetMock.mockReturnValue(null)
    bpGetAllMock.mockReturnValue([])

    const tool = createReadProjectStateTool('zh-CN')
    const result = await tool.execute('c1', { sections: ['config'] })
    const first = result.content[0]
    if (first.type !== 'text') throw new Error('expected text content')
    expect(first.text).toContain('小说配置')
    expect(first.text).not.toContain('章节进度')
    expect(first.text).not.toContain('近章要点')
    expect(first.text).not.toContain('蓝图清单')
    expect(result.details).toMatchObject({ sections: ['config'] })
  })

  it('falls back to every section when the request is empty', async () => {
    coreGetMock.mockReturnValue({ projectName: '空项目', totalChapters: 0, wordsPerChapter: 0 })
    bpGetAllMock.mockReturnValue([])

    const tool = createReadProjectStateTool('zh-CN')
    const result = await tool.execute('c1', { sections: [] })
    const first = result.content[0]
    if (first.type !== 'text') throw new Error('expected text content')
    expect(first.text).toContain('小说配置')
    expect(first.text).toContain('章节进度')
    expect(first.text).toContain('近章要点')
    expect(first.text).toContain('蓝图清单')
  })

  it('truncates long chapter lists and keeps the total count visible', async () => {
    coreGetMock.mockReturnValue({ projectName: '长篇', totalChapters: 5000, wordsPerChapter: 2000 })
    bpGetAllMock.mockReturnValue(Array.from({ length: 250 }, (_, index) => ({
      chapterNumber: index + 1,
      title: `第${index + 1}章`,
      notes: '',
    })))

    const tool = createReadProjectStateTool('zh-CN')
    const result = await tool.execute('c1', { sections: ['progress'] })
    const first = result.content[0]
    if (first.type !== 'text') throw new Error('expected text content')
    expect(first.text).toContain('共 250 章，仅列出前 200 章')
    expect(first.text).toContain('| 200 |')
    expect(first.text).not.toContain('| 201 |')
  })

  it('surfaces pending finalizations and failed post-processing steps', async () => {
    coreGetMock.mockReturnValue({ projectName: '长篇', totalChapters: 3, wordsPerChapter: 2000 })
    bpGetAllMock.mockReturnValue([])
    finalizationListMock.mockReturnValue([
      {
        finalizationId: 'f1', draftId: 3, chapterNumber: 3, chapterTitle: '第三章',
        contentSnapshot: '', contentHash: 'h', contentRevision: 1,
        targetFileName: '', knowledgeDocumentId: '',
        publicationStatus: 'pending', lastError: '磁盘无写入权限', publishedAt: null,
      },
      {
        finalizationId: 'f2', draftId: 2, chapterNumber: 2, chapterTitle: '第二章',
        contentSnapshot: '', contentHash: 'h', contentRevision: 1,
        targetFileName: '', knowledgeDocumentId: '',
        publicationStatus: 'published', lastError: '', publishedAt: '2026-10-27T00:00:00Z',
      },
    ])
    postProcessListMock.mockReturnValue([
      {
        id: 'run-1', triggerSourceType: 'chapter_finalize', triggerSourceId: '3',
        sourceLabel: '第3章 第三章', allCriticalPassed: false,
        createdAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z',
      },
    ])
    postProcessStepsMock.mockReturnValue([
      { id: 1, runId: 'run-1', stepKey: 'character_roster', label: '角色卡更新', critical: true, ok: false, errorMsg: '角色提取失败', attemptCount: 1, completedAt: '', lastAttemptAt: '' },
      { id: 2, runId: 'run-1', stepKey: 'knowledge_index', label: '知识库索引', critical: false, ok: true, errorMsg: '', attemptCount: 1, completedAt: '', lastAttemptAt: '' },
    ])

    const tool = createReadProjectStateTool('zh-CN')
    const result = await tool.execute('c1', { sections: ['health'] })
    const first = result.content[0]
    if (first.type !== 'text') throw new Error('expected text content')
    expect(first.text).toContain('定稿与后处理状态')
    expect(first.text).toContain('待发布 / 发布失败（1 条）')
    expect(first.text).toContain('第3章 第三章 · 待发布 · 磁盘无写入权限')
    expect(first.text).toContain('后处理失败（1 条）')
    expect(first.text).toContain('第3章 第三章')
    expect(first.text).toContain('角色卡更新（关键）：角色提取失败')
    expect(first.text).not.toContain('知识库索引')
    expect(result.details).toMatchObject({ finalizationPending: 1, postProcessFailures: 1 })
  })

  it('reports a clean finalization/post-processing state', async () => {
    coreGetMock.mockReturnValue({ projectName: '长篇', totalChapters: 1, wordsPerChapter: 2000 })
    bpGetAllMock.mockReturnValue([])

    const tool = createReadProjectStateTool('zh-CN')
    const result = await tool.execute('c1', { sections: ['health'] })
    const first = result.content[0]
    if (first.type !== 'text') throw new Error('expected text content')
    expect(first.text).toContain('当前没有待发布的定稿，也没有失败的后处理步骤')
    expect(result.details).toMatchObject({ finalizationPending: 0, postProcessFailures: 0 })
  })

  it('builds every section in English for an English project', async () => {
    coreGetMock.mockReturnValue({
      projectName: 'Novel', genre: 'fantasy', subGenre: '', targetAudience: 'adult',
      totalChapters: 10, wordsPerChapter: 2000, plotStructure: 'three_act',
      narrativePov: 'third_limited', writingStyle: 'plain',
    })
    bpGetAllMock.mockReturnValue([{ chapterNumber: 1, title: 'One', notes: 'note' }])
    draftListMock.mockReturnValue([{ chapterNumber: 1, status: 'finalized' }])

    const tool = createReadProjectStateTool('en-US')
    const result = await tool.execute('c1', {})
    const first = result.content[0]
    if (first.type !== 'text') throw new Error('expected text content')
    expect(first.text).toContain('Novel configuration')
    expect(first.text).toContain('Chapter progress')
    expect(first.text).toContain('Recent chapter notes')
    expect(first.text).toContain('Blueprints (1)')
    expect(first.text).not.toMatch(/[\u3400-\u9fff]/u)
  })
})
