import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectData } from '../../../../shared/ipc-channels'
import type { ReviewFull, ReviewMeta } from '../../../../shared/contracts/review'
import { setActiveProjectSessionContext } from '../../../../shared/project-session-context'
import { useEditorStore } from '../../../../stores/editor-store'
import { useLocaleStore } from '../../../../stores/locale-store'
import { useProjectStore } from '../../../../stores/project-store'
import type { DraftMeta } from '../../../../stores/draft-store'
import { registerMenuSetter, unregisterMenuSetter, type SidebarMenuState } from '../sidebar-menu'
import DraftBoxGroup from '../DraftBoxGroup'

const PROJECT_PATH = 'C:\\novels\\review-report-lifecycle'
const PROJECT_SESSION = { projectId: 'review-report-lifecycle', projectPath: PROJECT_PATH }

const project: ProjectData = {
  id: PROJECT_SESSION.projectId,
  name: 'Review report lifecycle',
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

const reviewMeta: ReviewMeta = {
  id: 11,
  baseDraftId: draftMeta.id,
  reviewIndex: 1,
  contentId: 111,
  createdAt: '2026-08-29T00:00:00.000Z',
  kind: 'review',
  sourceReviewId: null,
}

const reviewContent = JSON.stringify({
  summary: '测试报告',
  items: [{ category: '情节逻辑', severity: 'error', description: '角色位置冲突。' }],
})

const originalEditorState = useEditorStore.getState()
const originalLocaleState = useLocaleStore.getState()
const originalProjectState = useProjectStore.getState()

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | undefined
let root: Root | undefined
let invoke: ReturnType<typeof vi.fn>
let menuState: SidebarMenuState | null
let deleteResult: {
  success: boolean
  errorCode?: 'REVIEW_NOT_FOUND' | 'REVIEW_IN_USE_BY_PENDING_REVISION'
  error?: string
}

function reviewNodes(): HTMLElement[] {
  return Array.from(container?.querySelectorAll<HTMLElement>('.tree-item') ?? [])
    .filter(node => node.textContent?.includes('审查报告 #') ?? false)
}

function confirmButton(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    .find(button => button.textContent?.trim() === label)
}

beforeEach(() => {
  deleteResult = { success: true }
  menuState = null
  registerMenuSetter(state => { menuState = state })

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
    if (channel === 'db:review-list') return [reviewMeta]
    if (channel === 'db:review-get-full') {
      return {
        ...reviewMeta,
        content: reviewContent,
        sourceDraft: null,
      } satisfies ReviewFull
    }
    if (channel === 'db:review-delete') {
      if (args[1] !== PROJECT_PATH) throw new Error('review-delete received an unexpected project path')
      if (deleteResult.success) {
        // 删除后侧栏刷新时会拉到空列表。
        invoke.mockImplementation(async (called: string) => {
          if (called === 'db:blueprint-get') return { chapterNumber: 1, title: '测试章' }
          if (called === 'db:review-list') return []
          if (called === 'db:review-get-full') return null
          if (called === 'db:review-delete') return deleteResult
          throw new Error(`Unexpected IPC channel after delete: ${called}`)
        })
      }
      return deleteResult
    }
    throw new Error(`Unexpected IPC channel in review lifecycle test: ${channel}`)
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
  unregisterMenuSetter()
  Reflect.deleteProperty(window, 'velaAPI')
  setActiveProjectSessionContext(null)
  useEditorStore.setState(originalEditorState)
  useLocaleStore.setState(originalLocaleState)
  useProjectStore.setState(originalProjectState)
  document.querySelectorAll('div').forEach(node => {
    if (node.textContent === '删除审查报告' || node.textContent === '取消删除') node.remove()
  })
  vi.restoreAllMocks()
})

async function renderDraftBox(): Promise<void> {
  await act(async () => {
    root?.render(<DraftBoxGroup draftsByChapter={{ 1: [draftMeta] }} />)
  })
  await vi.waitFor(() => {
    expect(reviewNodes()).toHaveLength(1)
  })
}

async function openReviewTab(): Promise<void> {
  await act(async () => {
    reviewNodes()[0]!.click()
  })
  await vi.waitFor(() => {
    expect(useEditorStore.getState().tabs.some(tab => tab.type === 'review-report')).toBe(true)
  })
}

async function openContextMenu(): Promise<SidebarMenuState> {
  const node = reviewNodes()[0]!
  await act(async () => {
    node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 24, clientY: 24 }))
  })
  if (!menuState) throw new Error('Sidebar context menu did not open')
  return menuState
}

async function clickMenuItem(label: string): Promise<void> {
  const state = await openContextMenu()
  const item = state.items.find(entry => 'label' in entry && entry.label === label)
  if (!item || !('onClick' in item)) throw new Error(`Missing menu item: ${label}`)
  const onClick = item.onClick
  if (!onClick) throw new Error(`Menu item has no handler: ${label}`)
  await act(async () => {
    onClick()
  })
}

async function confirmDeletion(): Promise<void> {
  await vi.waitFor(() => {
    expect(confirmButton('删除')).toBeTruthy()
  })
  await act(async () => {
    confirmButton('删除')!.click()
    await new Promise(resolve => setTimeout(resolve, 20))
  })
}

describe('review report lifecycle from the sidebar', () => {
  it('closes an open review tab from the context menu', async () => {
    await renderDraftBox()
    await openReviewTab()

    await clickMenuItem('关闭审查报告')

    await vi.waitFor(() => {
      expect(useEditorStore.getState().tabs.some(tab => tab.type === 'review-report')).toBe(false)
    })
  })

  it('deletes a review report after confirmation and refreshes the sidebar', async () => {
    await renderDraftBox()
    await openReviewTab()

    await clickMenuItem('删除审查报告')
    await confirmDeletion()

    await vi.waitFor(() => {
      expect(invoke.mock.calls.some(([channel, id, path]) => (
        channel === 'db:review-delete' && id === reviewMeta.id && path === PROJECT_PATH
      ))).toBe(true)
    })
    await vi.waitFor(() => {
      expect(reviewNodes()).toHaveLength(0)
    })
    // 删除后对应 Tab 一起关闭。
    expect(useEditorStore.getState().tabs.some(tab => tab.type === 'review-report')).toBe(false)
  })

  it('keeps the report when it is still used by a pending revision', async () => {
    deleteResult = {
      success: false,
      errorCode: 'REVIEW_IN_USE_BY_PENDING_REVISION',
      error: 'pending revision',
    }
    await renderDraftBox()

    await clickMenuItem('删除审查报告')
    await confirmDeletion()

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('正在用于修稿')
    })
    expect(reviewNodes()).toHaveLength(1)
  })
})
