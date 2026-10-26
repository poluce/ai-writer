import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectData } from '../../../../shared/ipc-channels'
import type { ReviewFull, ReviewMeta } from '../../../../shared/contracts/review'
import { globalEventBus } from '../../../../shared/event-bus'
import { setActiveProjectSessionContext } from '../../../../shared/project-session-context'
import { useEditorStore } from '../../../../stores/editor-store'
import { useLocaleStore } from '../../../../stores/locale-store'
import { useProjectStore } from '../../../../stores/project-store'
import type { DraftMeta } from '../../../../stores/draft-store'
import DraftBoxGroup from '../DraftBoxGroup'

const PROJECT_PATH = 'C:\\novels\\review-report-tree'
const OTHER_PROJECT_PATH = 'C:\\novels\\other-review-report-tree'
const PROJECT_SESSION = {
  projectId: 'review-report-tree',
  projectPath: PROJECT_PATH,
}

const project: ProjectData = {
  id: PROJECT_SESSION.projectId,
  name: 'Review report tree',
  path: PROJECT_PATH,
  novelConfig: {
    genre: '', subGenre: '', targetAudience: '', totalChapters: 4, wordsPerChapter: 2500,
    plotStructure: 'three_act', narrativePOV: 'third_limited', coreOutline: 'Configured',
    worldSetting: '', goldenFinger: '', protagonistProfile: '', globalGuidance: '',
  },
  characterStates: '',
  createdAt: '',
  updatedAt: '',
}

const draftMeta: DraftMeta = {
  id: 1,
  chapterNumber: 1,
  version: 1,
  status: 'draft',
  source: 'write',
  wordCount: 12,
  createdAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z',
  fileName: 'draft_v1.md',
  filePath: 'vela://draft/1',
}

function reviewMeta(id: number, reviewIndex: number): ReviewMeta {
  return {
    id,
    baseDraftId: draftMeta.id,
    reviewIndex,
    contentId: 100 + id,
    createdAt: `2026-08-${20 + reviewIndex}T00:00:00.000Z`,
    kind: 'review',
    sourceReviewId: null,
  }
}

function confirmationMeta(id: number, reviewIndex: number, sourceReviewId: number): ReviewMeta {
  return {
    ...reviewMeta(id, reviewIndex),
    kind: 'confirmation',
    sourceReviewId,
  }
}

function reviewReport(items: Array<{ severity: string; description: string }>): string {
  return JSON.stringify({
    summary: '测试报告',
    items: items.map((item, index) => ({
      category: '情节逻辑',
      severity: item.severity,
      description: item.description,
      quote: `第 ${index + 1} 段原文`,
    })),
  })
}

function reviewFull(meta: ReviewMeta, content: string): ReviewFull {
  return { ...meta, content, sourceDraft: null }
}

const originalEditorState = useEditorStore.getState()
const originalLocaleState = useLocaleStore.getState()
const originalProjectState = useProjectStore.getState()

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | undefined
let root: Root | undefined
let invoke: ReturnType<typeof vi.fn>
let reviews: ReviewMeta[]
let contents: Map<number, string>

function reviewCalls(channel: string): unknown[][] {
  return invoke.mock.calls.filter(([called]) => called === channel)
}

function reviewNodes(): HTMLElement[] {
  return Array.from(container?.querySelectorAll<HTMLElement>('.tree-item') ?? [])
    .filter(node => node.textContent?.includes('审查报告 #') ?? false)
}

beforeEach(() => {
  reviews = [reviewMeta(11, 1)]
  contents = new Map([
    [11, reviewReport([
      { severity: 'error', description: '角色在同一场景重复出现。' },
      { severity: 'warning', description: '场景切换过于突然。' },
      { severity: 'warning', description: '对话语气前后不一致。' },
      { severity: 'warning', description: '段落节奏偏慢。' },
    ])],
  ])
  useLocaleStore.setState({ locale: 'zh-CN', initialized: true })
  useProjectStore.setState({
    currentProject: project,
    projectSessionEpoch: 1,
    fileTree: [],
    loading: false,
  })
  useEditorStore.setState({ tabs: [], activeTabId: null })
  setActiveProjectSessionContext(PROJECT_SESSION)

  invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
    if (channel === 'db:blueprint-get') {
      return { chapterNumber: draftMeta.chapterNumber, title: '测试章' }
    }
    if (channel === 'db:review-list') {
      if (args[1] !== PROJECT_PATH) throw new Error('review-list received an unexpected project path')
      return reviews
    }
    if (channel === 'db:review-get-full') {
      const id = args[0] as number
      const content = contents.get(id)
      const meta = reviews.find(item => item.id === id)
      if (!meta || content === undefined) return null
      return reviewFull(meta, content)
    }
    throw new Error(`Unexpected IPC channel in review report tree test: ${channel}`)
  })
  Object.defineProperty(window, 'velaAPI', {
    configurable: true,
    value: {
      invoke,
      on: vi.fn(() => () => {}),
      once: vi.fn(),
      send: vi.fn(),
      setZoomLevel: vi.fn(),
      setZoomFactor: vi.fn(),
      getZoomLevel: vi.fn(() => 0),
    },
  })

  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  Reflect.deleteProperty(window, 'velaAPI')
  setActiveProjectSessionContext(null)
  useEditorStore.setState(originalEditorState)
  useLocaleStore.setState(originalLocaleState)
  useProjectStore.setState(originalProjectState)
  vi.restoreAllMocks()
})

async function renderDraftBox(): Promise<void> {
  await act(async () => {
    root?.render(<DraftBoxGroup draftsByChapter={{ 1: [draftMeta] }} />)
  })
}

describe('draft box review report nodes', () => {
  it('renders review reports nested under the draft with the latest severity summary', async () => {
    await renderDraftBox()

    await vi.waitFor(() => {
      expect(container?.textContent).toContain('审查报告 #1')
    })

    // 嵌套缩进比草稿行（40）更深一级。
    const node = reviewNodes()[0]
    expect(node.style.paddingLeft).toBe('56px')
    // 摘要只取最新一轮：1 严重 · 3 建议。
    expect(node.textContent).toContain('1 严重')
    expect(node.textContent).toContain('3 建议')
    expect(container?.textContent).not.toContain('待核实')

    const listCalls = reviewCalls('db:review-list')
    expect(listCalls).toHaveLength(1)
    expect(listCalls[0]?.[1]).toBe(draftMeta.id)
    expect(listCalls[0]?.[2]).toBe(PROJECT_PATH)
    expect(listCalls[0]?.[3]).toEqual(PROJECT_SESSION)

    const fullCalls = reviewCalls('db:review-get-full')
    expect(fullCalls).toHaveLength(1)
    expect(fullCalls[0]?.[1]).toBe(11)
  })

  it('opens a review report tab from the clicked node', async () => {
    await renderDraftBox()

    await vi.waitFor(() => {
      expect(reviewNodes()).toHaveLength(1)
    })

    const node = reviewNodes()[0]
    await act(async () => {
      node.click()
    })

    await vi.waitFor(() => {
      expect(useEditorStore.getState().tabs.some(tab => tab.type === 'review-report')).toBe(true)
    })

    const tab = useEditorStore.getState().tabs.find(item => item.type === 'review-report')
    expect(tab?.reviewId).toBe(11)
    expect(tab?.projectKey).toBe(PROJECT_PATH)
    expect(tab?.filePath).toBe(draftMeta.filePath)
    expect(tab?.chapterNumber).toBe(1)
    expect(tab?.chapterDir).toBe('vela://draft/ch1')
    expect(tab?.content).toContain('角色在同一场景重复出现')
    expect(tab?.name).toBe('审查报告：第1章')

    // 打开的审查 Tab 对应节点应呈 active 态。
    await vi.waitFor(() => {
      expect(reviewNodes()[0]?.className).toContain('active')
    })
  })

  it('refreshes review nodes only for the matching project session', async () => {
    await renderDraftBox()

    await vi.waitFor(() => {
      expect(container?.textContent).toContain('审查报告 #1')
    })

    reviews = [reviewMeta(11, 1), reviewMeta(12, 2)]
    contents.set(12, reviewReport([
      { severity: 'error', description: '伏笔未回收。' },
      { severity: 'error', description: '时间线冲突。' },
    ]))

    // 其他项目（或已失效会话）的刷新事件不得驱动本项目侧栏。
    await act(async () => {
      globalEventBus.emit('REFRESH_RESOURCE', {
        resources: ['reviews'],
        projectPath: OTHER_PROJECT_PATH,
        projectSession: { projectId: 'other', projectPath: OTHER_PROJECT_PATH },
      })
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    expect(container?.textContent).not.toContain('审查报告 #2')

    await act(async () => {
      globalEventBus.emit('REFRESH_RESOURCE', {
        resources: ['reviews', 'fileTree'],
        projectPath: PROJECT_PATH,
        projectSession: PROJECT_SESSION,
      })
    })

    await vi.waitFor(() => {
      expect(container?.textContent).toContain('审查报告 #2')
      expect(reviewNodes()[1]?.textContent).toContain('2 严重')
    })
    const [first, second] = reviewNodes()
    expect(first?.textContent).not.toContain('严重')
    expect(second?.textContent).toContain('2 严重')
    expect(second?.textContent).toContain('0 建议')
    // 刷新后依然只对最新一轮拉全文（首轮创建时一次，发布新轮次时一次）。
    await vi.waitFor(() => {
      expect(reviewCalls('db:review-get-full').map(([, id]) => id)).toEqual([11, 12])
    })
  })

  it('hides human confirmation snapshots and numbers reports by their visible order', async () => {
    reviews = [
      reviewMeta(11, 1),
      confirmationMeta(12, 2, 11),
      reviewMeta(13, 3),
    ]
    contents.set(13, reviewReport([
      { severity: 'warning', description: '第二轮的改进建议。' },
    ]))

    await renderDraftBox()

    await vi.waitFor(() => {
      expect(reviewNodes()).toHaveLength(2)
    })
    expect(reviewNodes()[0]?.textContent).toContain('审查报告 #1')
    expect(reviewNodes()[1]?.textContent).toContain('审查报告 #2')
    expect(container?.textContent).not.toContain('审查报告 #3')
    // 摘要始终取「最新一份审稿报告」，确认快照不参与。
    await vi.waitFor(() => {
      expect(reviewCalls('db:review-get-full').map(([, id]) => id)).toEqual([13])
    })
  })
})
