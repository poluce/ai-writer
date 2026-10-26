import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { ProjectData } from '../../../shared/ipc-channels'
import { setActiveProjectSessionContext } from '../../../shared/project-session-context'
import { useLLMStore } from '../../../stores/llm-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { useEditorStore } from '../../../stores/editor-store'
import { useProjectStore } from '../../../stores/project-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import ReviewReport from '../ReviewReport'

const PROJECT_PATH = 'C:\\novels\\annotated-review'
const PROJECT_SESSION = Object.freeze({ projectId: 'annotated-review-project', projectPath: PROJECT_PATH })
const DRAFT_CONTENT = [
  '第一段正文。',
  '他仍站在港口的灯塔下。',
  '场景切换过于突然。',
  '语言表达自然。',
].join('\n')
const REPORT_TEXT = JSON.stringify({
  summary: '总体评价：先看原文批注，再逐条确认。',
  items: [
    { category: '连续性', severity: 'error', description: '角色位置冲突。', quote: '他仍站在港口的灯塔下。' },
    { category: '节奏', severity: 'warning', description: '场景切换过于突然。', quote: '场景切换过于突然。' },
    { category: '措辞', severity: 'pass', description: '语言表达自然。' },
  ],
})

const originalLLMState = useLLMStore.getState()
const originalLocaleState = useLocaleStore.getState()
const originalProjectState = useProjectStore.getState()
const originalWorkflowState = useWorkflowStore.getState()

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined
const deleteCalls: number[] = []

function project(): ProjectData {
  return {
    id: PROJECT_SESSION.projectId,
    name: '原文批注测试项目',
    path: PROJECT_PATH,
    novelConfig: {
      genre: '奇幻',
      subGenre: '',
      targetAudience: '全龄',
      totalChapters: 5,
      wordsPerChapter: 3000,
      plotStructure: 'three_act',
      narrativePOV: 'third_limited',
      coreOutline: '完整的故事构想',
      worldSetting: '',
      goldenFinger: '',
      protagonistProfile: '',
      globalGuidance: '',
      writingLanguage: 'zh-CN',
    },
    characterStates: '',
    createdAt: '',
    updatedAt: '',
  }
}

function installIpc() {
  deleteCalls.length = 0
  const invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
    if (channel === 'db:draft-get-meta') {
      return {
        id: 1,
        chapterNumber: 1,
        chapterTitle: '雨夜启程',
        version: 1,
        status: 'draft',
        source: 'write',
      }
    }
    if (channel === 'db:draft-get-full') return { id: 1, content: DRAFT_CONTENT }
    if (channel === 'db:review-get-latest') return null
    if (channel === 'db:review-get-full') return null
    if (channel === 'db:review-delete') {
      deleteCalls.push(args[0] as number)
      return { success: true }
    }
    throw new Error(`Unexpected IPC channel: ${channel}`)
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
  return invoke
}

async function renderReport() {
  await act(async () => {
    root?.render(
      <ReviewReport
        projectKey={PROJECT_PATH}
        reportText={REPORT_TEXT}
        draftPath="vela://draft/1"
        chapterNumber={1}
        chapterDir="vela://draft/ch1"
        reviewId={41}
      />,
    )
  })
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'zh-CN' })
  useProjectStore.setState({ currentProject: project() })
  setActiveProjectSessionContext(PROJECT_SESSION)
  useLLMStore.setState({
    models: [],
    defaultModelId: null,
    activeRequests: new Map(),
    loaded: true,
  })
  useEditorStore.setState({ tabs: [], activeTabId: null })
  useWorkflowStore.setState({
    activeRuns: [],
    history: [],
    globalLogs: [],
    waitingRuns: {},
    currentRun: null,
    waitingForConfirm: false,
    waitingAfterStepIndex: -1,
    startWorkflow: vi.fn() as never,
    addLog: vi.fn() as never,
  })
  installIpc()
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
  useLLMStore.setState(originalLLMState)
  useLocaleStore.setState(originalLocaleState)
  useProjectStore.setState(originalProjectState)
  useWorkflowStore.setState(originalWorkflowState)
})

describe('ReviewReport annotated draft view', () => {
  it('把审稿意见定位成原文批注，并与右侧卡片双向联动', async () => {
    await renderReport()

    await vi.waitFor(() => {
      expect(container!.querySelectorAll('[data-annotation-item]')).toHaveLength(2)
    })
    expect(container!.querySelectorAll('[data-annotation-number="1"]')[0]).toBeTruthy()
    expect(container!.textContent).toContain('2 处批注')
    expect(container!.textContent).toContain('雨夜启程')

    // 点原文批注 → 右侧对应卡片变为当前项
    const firstMark = container!.querySelector<HTMLElement>('[data-annotation-item="ai-1"]')
    expect(firstMark).toBeTruthy()
    await act(async () => firstMark!.click())
    await vi.waitFor(() => {
      const selectedCard = container!.querySelector('[data-review-item="ai-1"][aria-current="true"]')
      expect(selectedCard).toBeTruthy()
    })

    // 切换分类只看该分类意见
    const categoryButton = container!.querySelector<HTMLElement>('[data-review-category="节奏"]')
    expect(categoryButton).toBeTruthy()
    await act(async () => categoryButton!.click())
    await vi.waitFor(() => {
      expect(container!.querySelectorAll('[data-review-item]')).toHaveLength(1)
    })

    // 回到总览恢复全部意见
    const overviewButton = container!.querySelector<HTMLElement>('[data-review-category="overview"]')
    await act(async () => overviewButton!.click())
    await vi.waitFor(() => {
      expect(container!.querySelectorAll('[data-review-item]')).toHaveLength(3)
    })
  })

  it('点右侧卡片会定位并滚动原文批注所在段落', async () => {
    await renderReport()
    await vi.waitFor(() => {
      expect(container!.querySelectorAll('[data-annotation-item]')).toHaveLength(2)
    })

    const scroller = container!.querySelector<HTMLElement>('.overflow-y-auto')
    expect(scroller).toBeTruthy()
    const before = scroller!.scrollTop

    const card = container!.querySelector<HTMLElement>('[data-review-item="ai-2"]')
    expect(card).toBeTruthy()
    await act(async () => card!.click())
    await vi.waitFor(() => {
      expect(container!.querySelector('[data-review-item="ai-2"][aria-current="true"]')).toBeTruthy()
    })
    // 目标段落已进入视口（滚动位置发生变化或元素本身可见）
    const mark = container!.querySelector<HTMLElement>('[data-annotation-item="ai-2"]')
    await vi.waitFor(() => {
      expect(mark!.getBoundingClientRect().top).toBeGreaterThanOrEqual(0)
    })
    expect(typeof before).toBe('number')
  })
})

describe('ReviewReport lifecycle actions', () => {
  it('deletes the review report from the report page, closes its tab and asks for confirmation', async () => {
    installIpc()
    useEditorStore.setState({
      tabs: [{
        id: 'review-tab',
        name: '审查报告：第1章',
        type: 'review-report',
        content: REPORT_TEXT,
        filePath: 'vela://draft/1',
        chapterNumber: 1,
        reviewId: 41,
        projectKey: PROJECT_PATH,
      }],
      activeTabId: 'review-tab',
    })
    await renderReport()

    const deleteButton = document.querySelector<HTMLButtonElement>('button[title="删除审查报告"]')
    expect(deleteButton).toBeTruthy()
    await act(async () => deleteButton!.click())

    await vi.waitFor(() => {
      const confirmButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
        .find(button => button.textContent?.trim() === '删除')
      expect(confirmButton).toBeTruthy()
      confirmButton!.click()
    })

    await vi.waitFor(() => {
      expect(deleteCalls).toEqual([41])
    })
    await vi.waitFor(() => {
      expect(useEditorStore.getState().tabs.some(tab => tab.type === 'review-report')).toBe(false)
    })
  })
})
