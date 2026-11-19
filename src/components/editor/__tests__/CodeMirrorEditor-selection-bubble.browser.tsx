/**
 * 浮动条的存在条件（浏览器侧）：
 * 它只属于“当前这一段选区”。选区被收起（点击别处、失焦、程序清空选区）时必须消失；
 * 焦点移进浮动条内部（批注输入框）时则要保留，否则作者没法写批注。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { useLocaleStore } from '../../../stores/locale-store'
import CodeMirrorEditor from '../CodeMirrorEditor'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement
let outsideButton: HTMLButtonElement

const PASSAGE = '第一段正文，用来测试浮动条的显示条件。'

beforeEach(() => {
  window.getSelection()?.removeAllRanges()
  container = document.createElement('div')
  container.style.width = '720px'
  document.body.append(container)
  outsideButton = document.createElement('button')
  outsideButton.type = 'button'
  outsideButton.textContent = '编辑器外按钮'
  document.body.append(outsideButton)
  root = createRoot(container)
  useLocaleStore.setState({ locale: 'zh-CN' })
  Object.defineProperty(window, 'velaAPI', {
    configurable: true,
    value: {
      invoke: vi.fn(async (channel: string) => {
        if (channel === 'prompt:load-global') return { templates: [], diagnostics: [] }
        throw new Error(`Unexpected IPC channel: ${channel}`)
      }),
      on: vi.fn(() => () => {}),
      once: vi.fn(),
      send: vi.fn(),
      setZoomLevel: vi.fn(),
      setZoomFactor: vi.fn(),
      getZoomLevel: vi.fn(() => 0),
    },
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  outsideButton.remove()
  Reflect.deleteProperty(window, 'velaAPI')
  window.getSelection()?.removeAllRanges()
})

const bubbleAction = () => page.getByRole('button', { name: '润色' }).query()

async function mountAndSelect(options: { enableAnnotations?: boolean; text?: string } = {}) {
  const text = options.text ?? PASSAGE
  await act(async () => root.render(
    <CodeMirrorEditor content={text} mode="prose" enableAnnotations={options.enableAnnotations} />,
  ))
  await act(async () => page.getByText(text).click({ clickCount: 3 }))
  await vi.waitFor(() => expect(bubbleAction()).not.toBeNull())
}

describe('编辑器浮动条只跟随当前选区', () => {
  it('选中文字才出现，焦点离开编辑器后消失', async () => {
    await mountAndSelect()
    expect(bubbleAction()).not.toBeNull()

    await act(async () => outsideButton.focus())
    await vi.waitFor(() => expect(bubbleAction()).toBeNull())
  })

  it('点击编辑器之外的区域时消失', async () => {
    await mountAndSelect()
    expect(bubbleAction()).not.toBeNull()

    await act(async () => page.getByRole('button', { name: '编辑器外按钮' }).click())
    await vi.waitFor(() => expect(bubbleAction()).toBeNull())
  })

  it('焦点进入批注输入框时保留，并允许继续输入批注', async () => {
    const text = '第二段正文，用来测试写批注时不关闭浮动条。'
    await mountAndSelect({ enableAnnotations: true, text })

    const input = page.getByPlaceholder('这段有什么问题？').element() as HTMLInputElement
    await act(async () => input.focus())
    await act(async () => page.getByPlaceholder('这段有什么问题？').fill('这里的节奏太快了'))

    expect(bubbleAction()).not.toBeNull()
    expect(input.value).toBe('这里的节奏太快了')
  })

  it('关闭后重新选中一段文字会再次出现', async () => {
    await mountAndSelect()
    await act(async () => outsideButton.focus())
    await vi.waitFor(() => expect(bubbleAction()).toBeNull())

    await act(async () => page.getByText(PASSAGE).click({ clickCount: 3 }))
    await vi.waitFor(() => expect(bubbleAction()).not.toBeNull())
  })
})
