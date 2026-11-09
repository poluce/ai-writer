import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { page } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectData } from '../../../shared/ipc-channels'
import { useLayoutStore } from '../../../stores/layout-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import { useThemeStore } from '../../../stores/theme-store'
import TitleBar from '../TitleBar'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement
const originalLocaleState = useLocaleStore.getState()
const originalThemeState = useThemeStore.getState()
const originalProjectState = useProjectStore.getState()
const originalLayoutState = useLayoutStore.getState()

const project: ProjectData = {
  id: 'titlebar-menu-project',
  name: '测试书',
  path: 'C:\\novels\\titlebar-menu',
  novelConfig: {
    genre: '', subGenre: '', targetAudience: '', totalChapters: 3, wordsPerChapter: 2500,
    plotStructure: 'three_act', narrativePOV: 'third_limited', coreOutline: 'Configured',
    worldSetting: '', goldenFinger: '', protagonistProfile: '', globalGuidance: '',
  },
  characterStates: '',
  createdAt: '',
  updatedAt: '',
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'zh-CN' })
  useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' })
  useProjectStore.setState({ currentProject: null })
  useLayoutStore.setState({ aiPanelOpen: true })
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
  useProjectStore.setState(originalProjectState)
  useLayoutStore.setState(originalLayoutState)
  Reflect.deleteProperty(window, 'velaAPI')
})

describe('TitleBar menus', () => {
  it('keeps the title bar free of duplicate commands and exposes them from the main menu', async () => {
    await act(async () => root.render(<TitleBar />))

    // 标题栏不再重复命令入口：新建 / 打开 / 更多 全部收进主菜单
    expect(page.getByRole('button', { name: '新建', exact: true }).query()).toBeNull()
    expect(page.getByRole('button', { name: '打开', exact: true }).query()).toBeNull()
    expect(page.getByRole('button', { name: '更多', exact: true }).query()).toBeNull()
    // 设置入口只保留左栏底部：标题栏没有第二个齿轮
    expect(page.getByRole('button', { name: '设置' }).query()).toBeNull()

    const trigger = page.getByRole('button', { name: '主菜单' })
    await expect.element(trigger).toBeVisible()
    await act(async () => trigger.click())

    const mainMenu = page.getByRole('menu', { name: '主菜单' })
    for (const name of [/新建项目/, /打开项目/, /导入原稿/, /拆解仿写/, /导出/, /备份/, /退出/]) {
      await expect.element(mainMenu.getByRole('button', { name })).toBeVisible()
    }
    // 主菜单不再重复设置入口
    expect(mainMenu.getByRole('button', { name: '设置' }).query()).toBeNull()
  })

  it('exposes the four themes from the main menu instead of a standalone title-bar control', async () => {
    await act(async () => root.render(<TitleBar />))

    // 主题不再占用标题栏：入口统一收进主菜单
    expect(page.getByRole('button', { name: '浅色' }).query()).toBeNull()

    const trigger = page.getByRole('button', { name: '主菜单' })
    await expect.element(trigger).toBeVisible()
    await act(async () => trigger.click())

    const mainMenu = page.getByRole('menu', { name: '主菜单' })
    for (const label of ['浅色', '黑夜', '纸质', '星空']) {
      await expect.element(mainMenu.getByRole('button', { name: label, exact: true })).toBeVisible()
    }

    await act(async () => mainMenu.getByRole('button', { name: '纸质', exact: true }).click())
    // 主题切换走 View Transition，状态在动画回调里落地
    await expect.poll(() => useThemeStore.getState().theme).toBe('paper')
  })

  it('exposes both interface languages from the main menu', async () => {
    await act(async () => root.render(<TitleBar />))

    // 语言不再占用标题栏：入口统一收进主菜单
    expect(page.getByRole('button', { name: 'EN' }).query()).toBeNull()

    const trigger = page.getByRole('button', { name: '主菜单' })
    await expect.element(trigger).toBeVisible()
    await act(async () => trigger.click())

    const mainMenu = page.getByRole('menu', { name: '主菜单' })
    await expect.element(mainMenu.getByRole('button', { name: '简体中文', exact: true })).toBeVisible()
    await expect.element(mainMenu.getByRole('button', { name: 'English', exact: true })).toBeVisible()

    await act(async () => mainMenu.getByRole('button', { name: 'English', exact: true }).click())
    await expect.poll(() => useLocaleStore.getState().locale).toBe('en-US')
  })

  it('reopens the assistant panel from the main menu after it was closed', async () => {
    useLayoutStore.setState({ aiPanelOpen: false })
    await act(async () => root.render(<TitleBar />))

    const trigger = page.getByRole('button', { name: '主菜单' })
    await expect.element(trigger).toBeVisible()
    await act(async () => trigger.click())

    // 面板关闭后，关闭按钮随面板消失；主菜单里保留唯一的重新打开入口
    const item = page
      .getByRole('menu', { name: '主菜单' })
      .getByRole('button', { name: 'AI 写作助手' })
    await expect.element(item).toBeVisible()
    expect(item.element().getAttribute('aria-pressed')).toBe('false')

    await act(async () => item.click())
    expect(useLayoutStore.getState().aiPanelOpen).toBe(true)

    // 快捷键是第二条恢复路径：Ctrl+Shift+A 收起 / 展开助手面板
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, shiftKey: true, bubbles: true }),
      )
    })
    expect(useLayoutStore.getState().aiPanelOpen).toBe(false)
  })

  it('shows the project switch only while a project is open', async () => {
    await act(async () => root.render(<TitleBar />))

    // 启动页没有项目：不显示「当前项目：未打开项目」
    expect(page.getByText('当前项目：').query()).toBeNull()
    expect(page.getByRole('button', { name: '未打开项目' }).query()).toBeNull()

    await act(async () => useProjectStore.setState({ currentProject: project }))

    await expect.element(page.getByText('当前项目：')).toBeVisible()
    await expect.element(page.getByRole('button', { name: '测试书' })).toBeVisible()
  })
})
