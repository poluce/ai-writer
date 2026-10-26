import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { page } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useEditorStore, type EditorTab } from '../../../stores/editor-store'
import { useEditorDraftLedgerStore } from '../../../stores/editor-draft-ledger-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { useThemeStore } from '../../../stores/theme-store'
import TitleBar from '../TitleBar'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement
const originalLocaleState = useLocaleStore.getState()
const originalThemeState = useThemeStore.getState()
const originalEditorState = useEditorStore.getState()
const originalLedgerState = useEditorDraftLedgerStore.getState()

function tab(overrides: Partial<EditorTab>): EditorTab {
  return { id: 'tab-1', name: '第一章', type: 'chapter', ...overrides }
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'zh-CN' })
  useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' })
  useEditorStore.setState({ tabs: [], activeTabId: null })
  useEditorDraftLedgerStore.setState({ draftLedgers: {} })
  Object.defineProperty(window, 'velaAPI', {
    configurable: true,
    value: {
      invoke: vi.fn(async () => ({ success: true })),
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
  await act(async () => root.unmount())
  container.remove()
  useLocaleStore.setState(originalLocaleState)
  useThemeStore.setState(originalThemeState)
  useEditorStore.setState(originalEditorState)
  useEditorDraftLedgerStore.setState(originalLedgerState)
  Reflect.deleteProperty(window, 'velaAPI')
})

describe('TitleBar save indicator', () => {
  it('does not claim "已保存" when no editor item is open', async () => {
    await act(async () => root.render(<TitleBar />))

    // 启动页 / 未打开任何编辑器时没有任何东西可保存，不显示保存状态
    expect(page.getByText('已保存', { exact: true }).query()).toBeNull()
    expect(page.getByText('有修改', { exact: true }).query()).toBeNull()
  })

  it('shows the save state only while an editor tab exists', async () => {
    useEditorStore.setState({ tabs: [tab({ dirty: false })], activeTabId: 'tab-1' })
    await act(async () => root.render(<TitleBar />))
    await expect.element(page.getByText('已保存', { exact: true })).toBeVisible()

    await act(async () => {
      useEditorStore.setState({ tabs: [tab({ dirty: true })] })
    })
    await expect.element(page.getByText('有修改', { exact: true })).toBeVisible()

    await act(async () => {
      useEditorStore.setState({ tabs: [], activeTabId: null })
    })
    expect(page.getByText('有修改', { exact: true }).query()).toBeNull()
    expect(page.getByText('已保存', { exact: true }).query()).toBeNull()
  })
})
