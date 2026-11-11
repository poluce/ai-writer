import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import AssistantSettings from '../AssistantSettings'

const originalLocaleState = useLocaleStore.getState()

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface TestVelaApi {
  invoke: ReturnType<typeof vi.fn>
  on: () => () => void
  once: () => void
  send: () => void
  setZoomLevel: () => void
  setZoomFactor: () => void
  getZoomLevel: () => number
}

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  useLocaleStore.setState(originalLocaleState)
  const { useProjectStore } = await import('../../../stores/project-store')
  useProjectStore.setState({ currentProject: null })
})

function installIpc(): ReturnType<typeof vi.fn> {
  const invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
    if (channel === 'prompt:load-global') return { templates: [], diagnostics: [] }
    if (channel === 'fs:check-exists') return false
    if (channel === 'prompt:save-global') return { success: true }
    if (channel === 'prompt:delete-global') return { success: true }
    if (channel === 'agent:system-prompt') {
      const assistantType = args[1] as string | undefined
      return {
        success: true,
        prompt: '真实拼接的系统提示词',
        blocks: [
          { kind: 'project_facts', label: '项目信息', source: 'auto', editable: false, chars: 12, text: '项目名称: 潮门' },
          { kind: 'hard_rules', label: '软件硬规则', source: 'builtin', editable: true, chars: 10, text: '硬规则' },
          { kind: 'identity', label: '助手身份', source: 'builtin', editable: true, chars: 10, text: '身份' },
          { kind: 'work_rules', label: '工作规范', source: 'builtin', editable: true, chars: 10, text: '规范' },
          {
            kind: 'skill_catalog',
            label: '技能目录',
            source: 'auto',
            editable: false,
            chars: 8,
            text: `${assistantType}: review-chapter`,
          },
        ],
      }
    }
    throw new Error(`Unexpected IPC channel: ${channel}`)
  })
  ;(window as unknown as { velaAPI: TestVelaApi }).velaAPI = {
    invoke,
    on: () => () => {},
    once: () => {},
    send: () => {},
    setZoomLevel: () => {},
    setZoomFactor: () => {},
    getZoomLevel: () => 0,
  }
  return invoke
}

async function renderSettings(): Promise<void> {
  useLocaleStore.setState({ locale: 'zh-CN' })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<AssistantSettings />)
  })
}

describe('assistant settings page', () => {
  it('shows one shared module list and auto-saves edits to the selected scope', async () => {
    const invoke = installIpc()
    await renderSettings()

    // 五个助手页签 + 共用模块清单（无序号）。
    await expect.element(page.getByRole('button', { name: '主助手' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: '写作助手' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: '审稿助手' })).toBeVisible()
    for (const label of ['软件硬规则', '助手身份', '工作规范', '技能目录']) {
      await expect.element(page.getByRole('button', { name: new RegExp(label) })).toBeVisible()
    }

    const editor = page.getByRole('textbox')
    await expect.element(editor).toBeVisible()
    await expect.element(editor).toHaveValue(expect.stringContaining('【不可变系统合同】'))

    // 切换到审稿助手：保持当前选中的模块，不跳回软件硬规则。
    await act(async () => {
      await page.getByRole('button', { name: /助手身份/ }).click()
    })
    await act(async () => {
      await page.getByRole('button', { name: '审稿助手' }).click()
    })
    // 选中项仍是助手身份：编辑区显示审稿助手身份，而不是回到软件硬规则。
    await expect.element(page.getByRole('textbox')).toHaveValue(expect.stringContaining('你是一位'))

    // 再切回软件硬规则：硬规则是四个助手共用的同一份模板。
    await act(async () => {
      await page.getByRole('button', { name: /软件硬规则/ }).click()
    })
    await expect.element(page.getByRole('textbox')).toHaveValue(expect.stringContaining('【不可变系统合同】'))

    // 切换到审稿助手：硬规则是四个助手共用的同一份模板。
    await act(async () => {
      await page.getByRole('button', { name: '审稿助手' }).click()
    })
    await act(async () => {
      await page.getByRole('button', { name: /软件硬规则/ }).click()
    })
    await expect.element(page.getByRole('textbox')).toHaveValue(expect.stringContaining('【不可变系统合同】'))

    await act(async () => {
      await page.getByRole('textbox').fill('新的硬规则内容')
    })

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('prompt:save-global', expect.objectContaining({
        content: '新的硬规则内容',
      }))
    }, { timeout: 3000 })
    await expect.element(page.getByText(/已自动保存到全局/)).toBeVisible()

    // 切换到审稿助手后，模块清单仍是同一套，但技能目录按该助手读取。
    await act(async () => {
      await page.getByRole('button', { name: '审稿助手' }).click()
    })
    await expect.element(page.getByRole('button', { name: /软件硬规则/ })).toBeVisible()
    await act(async () => {
      await page.getByRole('button', { name: /技能目录/ }).click()
    })
    await expect.element(page.getByText('review: review-chapter')).toBeVisible()

    // 预览直接展示真实拼接结果，不再按模块拆分。
    await act(async () => {
      await page.getByRole('button', { name: '预览最终系统提示词' }).click()
    })
    await expect.element(page.getByText('真实拼接的系统提示词')).toBeVisible()
  })

  it('shows only project facts under the project scope', async () => {
    installIpc()
    useProjectStore.setState({
      currentProject: {
        id: 'project-1',
        name: '潮门',
        path: 'C:\\novels\\chaomen',
        novelConfig: { writingLanguage: 'zh-CN' },
      } as never,
    })

    await renderSettings()
    await act(async () => {
      await page.getByRole('button', { name: '本项目' }).click()
    })

    await expect.element(page.getByRole('button', { name: /项目信息/ })).toBeVisible()
    expect(page.getByRole('button', { name: /软件硬规则/ }).elements()).toHaveLength(0)
    await expect.element(page.getByText('由项目数据自动生成，随设定实时更新，不可编辑。')).toBeVisible()
    await expect.element(page.getByText('项目名称: 潮门')).toBeVisible()

    // 回到全局，恢复之前选中的模块列表。
    await act(async () => {
      await page.getByRole('button', { name: '全局' }).click()
    })
    await expect.element(page.getByRole('button', { name: /软件硬规则/ })).toBeVisible()
  })
})
