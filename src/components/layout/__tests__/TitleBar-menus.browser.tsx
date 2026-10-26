import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { page } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useLocaleStore } from '../../../stores/locale-store'
import { useThemeStore } from '../../../stores/theme-store'
import TitleBar from '../TitleBar'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement
const originalLocaleState = useLocaleStore.getState()
const originalThemeState = useThemeStore.getState()

beforeEach(() => {
  useLocaleStore.setState({ locale: 'zh-CN' })
  useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' })
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

  it('exposes the four themes as a menu instead of a single cycling icon', async () => {
    await act(async () => root.render(<TitleBar />))

    // 当前主题直接写在按钮上，不需要盲点循环
    const trigger = page.getByRole('button', { name: '浅色' })
    await expect.element(trigger).toBeVisible()

    await act(async () => trigger.click())

    const themeMenu = page.getByRole('menu')
    for (const label of ['浅色', '黑夜', '纸质', '星空']) {
      await expect.element(themeMenu.getByRole('button', { name: label, exact: true })).toBeVisible()
    }

    await act(async () => themeMenu.getByRole('button', { name: '纸质', exact: true }).click())
    // 主题切换走 View Transition，状态在动画回调里落地
    await expect.poll(() => useThemeStore.getState().theme).toBe('paper')
  })
})
