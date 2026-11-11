import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { setActiveProjectSessionContext } from '../../../shared/project-session-context'
import { useAgentStore } from '../../../stores/agent-store'
import { useLayoutStore } from '../../../stores/layout-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import SynopsisEditor from '../SynopsisEditor'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PROJECT_PATH = 'C:\\novels\\synopsis-editor'
const PROJECT_SESSION = {
  projectId: 'synopsis-editor',
  projectPath: PROJECT_PATH,
}

const OUTLINE = [
  '# 情节大纲',
  '',
  '全书围绕灵脉异变展开，主角从铁砧镇一路追查到终局。',
  '',
  '## 第一卷',
  '',
  '第1–20章：核对记录',
  '林舟逐条核对旧案记录，确认灵脉异变的第一个信号。',
  '',
  '第21章：破门',
  '宗门废墟之下，林舟第一次触碰旧铁锤里的传承。',
  '',
  '## 第二卷',
  '',
  '第22–100章：反噬',
  '记忆损耗的代价持续推进，并在终局兑现。',
  '',
  '> 本大纲已覆盖至第 20 章（全书 100 章），其余章节将在后续批次继续生成。',
  '',
].join('\n')

const project = {
  id: PROJECT_SESSION.projectId,
  name: 'Synopsis editor',
  path: PROJECT_PATH,
  novelConfig: { totalChapters: 100, writingLanguage: 'zh-CN' },
}

let root: Root
let container: HTMLDivElement
let core: Record<string, unknown>
let roster: Record<string, unknown>
let coreUpdates: Array<Record<string, unknown>>
let sendMessage: ReturnType<typeof vi.fn>
const originalAgent = useAgentStore.getState()
const originalLayout = useLayoutStore.getState()
const originalLocale = useLocaleStore.getState()

beforeEach(() => {
  sendMessage = vi.fn(async () => {})
  core = { synopsis: '', totalChapters: 100, writingLanguage: 'zh-CN' }
  roster = { status: 'ready' }
  coreUpdates = []
  useLocaleStore.setState({ locale: 'zh-CN', initialized: true })
  useProjectStore.setState({ currentProject: project as never })
  useLayoutStore.setState({ aiPanelOpen: false, rightView: 'agent' })
  useAgentStore.setState({ sendMessage: sendMessage as never })
  setActiveProjectSessionContext(PROJECT_SESSION)
  Object.defineProperty(window, 'velaAPI', {
    configurable: true,
    value: {
      invoke: vi.fn(async (channel: string, ...args: unknown[]) => {
        if (channel === 'db:project-core-get') return core
        if (channel === 'db:character-roster-read') return roster
        if (channel === 'db:project-core-update') {
          const payload = args[0] as Record<string, unknown>
          coreUpdates.push(payload)
          core = { ...core, ...payload }
          return { success: true }
        }
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
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  Reflect.deleteProperty(window, 'velaAPI')
  setActiveProjectSessionContext(null)
  useAgentStore.setState(originalAgent)
  useLayoutStore.setState(originalLayout)
  useLocaleStore.setState(originalLocale)
  useProjectStore.setState({ currentProject: null })
})

async function renderEditor() {
  await act(async () => root.render(<SynopsisEditor projectKey={PROJECT_PATH} />))
}

describe('SynopsisEditor', () => {
  it('hands off empty plot planning to the right-side Architect assistant', async () => {
    await renderEditor()

    const planButton = page.getByRole('button', { name: /AI 构思情节/ })
    await expect.element(planButton).toBeVisible()
    await act(async () => planButton.click())

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
    expect(useLayoutStore.getState()).toMatchObject({ aiPanelOpen: true, rightView: 'architect' })
    expect(sendMessage.mock.calls[0]?.[1]).toBe('architect')
    expect(String(sendMessage.mock.calls[0]?.[0])).toContain('分卷情节大纲')
  })

  it('hands off plot refinement to the Architect assistant when an outline already exists', async () => {
    core = { synopsis: OUTLINE, totalChapters: 100, writingLanguage: 'zh-CN' }
    await renderEditor()

    const refineButton = page.getByRole('button', { name: /AI 完善情节/ })
    await expect.element(refineButton).toBeVisible()
    await act(async () => refineButton.click())

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
    expect(useLayoutStore.getState()).toMatchObject({ aiPanelOpen: true, rightView: 'architect' })
    expect(sendMessage.mock.calls[0]?.[1]).toBe('architect')
    expect(String(sendMessage.mock.calls[0]?.[0])).toContain('read_architecture')
  })

  it('warns about missing architecture inputs until every authoritative block exists', async () => {
    core = {
      synopsis: '',
      premise: '',
      worldbuilding: '',
      totalChapters: 100,
      writingLanguage: 'zh-CN',
    }
    roster = { status: 'legacy_repair_required' }
    await renderEditor()

    await expect.element(page.getByText(/建议先在「故事架构」完成：前提概要、人物、环境/)).toBeVisible()

    core = {
      synopsis: '',
      premise: '前提'.repeat(40),
      worldbuilding: '世界观'.repeat(40),
      totalChapters: 100,
      writingLanguage: 'zh-CN',
    }
    roster = { status: 'ready' }
    await act(async () => page.getByRole('button', { name: '刷新状态' }).click())

    await vi.waitFor(() => {
      expect(container.textContent).not.toContain('建议先在「故事架构」完成')
    })
  })

  it('renders the whole outline as one document and drives it from the volume table of contents', async () => {
    core = { synopsis: OUTLINE, totalChapters: 100, writingLanguage: 'zh-CN' }
    await renderEditor()

    // 左侧是按分卷组织的活页标签目录。
    const toc = () => container.querySelector('[data-testid="synopsis-toc"]')?.textContent ?? ''
    expect(toc()).toContain('总览')
    expect(toc()).toContain('第一卷')
    expect(toc()).toContain('第二卷')

    // 右侧是整份拼接好的大纲，所有段落都在同一篇文档里。
    const doc = container.querySelector('[data-testid="synopsis-document"]') as HTMLElement
    expect(doc.textContent).toContain('第1–20章')
    expect(doc.textContent).toContain('第21章')
    expect(doc.textContent).toContain('第22–100章')
    expect(doc.textContent).toContain('本大纲已覆盖至第 20 章')
    expect(doc.querySelectorAll('[data-node-id]')).toHaveLength(4)

    // 展开第一卷与第二卷分组并点击目录项 → 该项成为当前段落（右侧文档随之滚动定位）。
    const tocGroup = page.getByTestId('synopsis-toc')
    await act(async () => tocGroup.getByText('第一卷', { exact: true }).click())
    await act(async () => tocGroup.getByText('第二卷', { exact: true }).click())
    expect(toc()).toContain('第22–100章')
    await act(async () => tocGroup.getByText('第21章', { exact: true }).click())
    expect(container.querySelector('[aria-current="true"]')?.textContent).toContain('第21章')

    // 再次点击分卷标签可折叠回去。
    await act(async () => tocGroup.getByText('第二卷', { exact: true }).click())
    expect(toc()).not.toContain('第22–100章')
  })

  it('saves an edited section back into the whole outline without touching other ranges', async () => {
    core = { synopsis: OUTLINE, totalChapters: 100, writingLanguage: 'zh-CN' }
    container.style.height = '400px'
    await renderEditor()

    const tocGroup = page.getByTestId('synopsis-toc')
    await act(async () => tocGroup.getByText('第一卷', { exact: true }).click())
    const editor = page.getByRole('textbox', { name: '第21章的大纲正文' })
    await act(async () => editor.fill('林舟破门而入，却发现传承早已被人取走。'))

    expect(container.textContent).toContain('未保存 1 段')
    await act(async () => page.getByRole('button', { name: '保存「第21章」' }).click())

    await vi.waitFor(() => expect(coreUpdates).toHaveLength(1))
    expect(coreUpdates[0].synopsis).toBe(OUTLINE.replace(
      '宗门废墟之下，林舟第一次触碰旧铁锤里的传承。',
      '林舟破门而入，却发现传承早已被人取走。',
    ))
    await vi.waitFor(() => expect(container.textContent).not.toContain('未保存'))
    // 其余章节区间原样保留。
    expect(container.textContent).toContain('第22–100章')
  })

  it('saves several edited sections in one write without shifting earlier offsets', async () => {
    core = { synopsis: OUTLINE, totalChapters: 100, writingLanguage: 'zh-CN' }
    container.style.height = '500px'
    await renderEditor()

    await act(async () => page.getByRole('textbox', { name: '第1–20章的大纲正文' })
      .fill('林舟核对到第三条线索时，发现封锁令的签发时间被人改过。'))
    await act(async () => page.getByRole('textbox', { name: '第22–100章的大纲正文' })
      .fill('记忆代价在终局一次性兑现，林舟失去了自己的名字。'))
    expect(container.textContent).toContain('未保存 2 段')

    await act(async () => page.getByRole('button', { name: '保存全部' }).click())

    await vi.waitFor(() => expect(coreUpdates).toHaveLength(1))
    const saved = String(coreUpdates[0].synopsis)
    expect(saved).toBe(OUTLINE
      .replace(
        '林舟逐条核对旧案记录，确认灵脉异变的第一个信号。',
        '林舟核对到第三条线索时，发现封锁令的签发时间被人改过。',
      )
      .replace(
        '记忆损耗的代价持续推进，并在终局兑现。',
        '记忆代价在终局一次性兑现，林舟失去了自己的名字。',
      ))
  })

  it('falls back to one whole-document section when the outline has no chapter labels', async () => {
    core = {
      synopsis: '# 情节大纲\n\n第一幕：主角失去家园。\n\n第二幕：主角夺回主动权。',
      totalChapters: 100,
      writingLanguage: 'zh-CN',
    }
    await renderEditor()

    await expect.element(page.getByRole('heading', { name: '全文' })).toBeVisible()
    await expect.element(page.getByRole('textbox', { name: '全文的大纲正文' }))
      .toHaveValue('第一幕：主角失去家园。\n\n第二幕：主角夺回主动权。')
  })

  it('supports drag resizing the table of contents width and persists to storage', async () => {
    core = { synopsis: OUTLINE, totalChapters: 100, writingLanguage: 'zh-CN' }
    await renderEditor()

    const sash = container.querySelector('[role="separator"]') as HTMLElement
    expect(sash).not.toBeNull()

    const tocPanel = container.querySelector('[data-testid="synopsis-toc"]')?.parentElement as HTMLElement
    const initialWidth = tocPanel.offsetWidth

    // 模拟拖拽移动 50px
    await act(async () => {
      sash.dispatchEvent(new PointerEvent('pointerdown', { clientX: 200, bubbles: true }))
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 250, bubbles: true }))
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 250, bubbles: true }))
    })

    expect(tocPanel.offsetWidth).toBe(initialWidth + 50)
  })
})
