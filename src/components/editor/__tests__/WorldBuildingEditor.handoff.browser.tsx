import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setActiveProjectSessionContext } from '../../../shared/project-session-context'
import { useAgentStore } from '../../../stores/agent-store'
import { useLayoutStore } from '../../../stores/layout-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import { ipc } from '../../../services/ipc-client'
import WorldBuildingEditor from '../WorldBuildingEditor'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PROJECT_PATH = 'C:\\novels\\arch-handoff-browser'
const PROJECT_SESSION = Object.freeze({
  projectId: 'arch-handoff-project',
  projectPath: PROJECT_PATH,
})

const originalAgentState = useAgentStore.getState()
const originalLayoutState = useLayoutStore.getState()
const originalLocaleState = useLocaleStore.getState()
const originalProjectState = useProjectStore.getState()

let container: HTMLDivElement
let root: Root
let sendMessage: ReturnType<typeof vi.fn>

beforeEach(() => {
  sendMessage = vi.fn(async () => {})
  useLocaleStore.setState({ locale: 'zh-CN', initialized: true })
  useLayoutStore.setState({ aiPanelOpen: false, rightView: 'agent' })
  useAgentStore.setState({ sendMessage: sendMessage as never })
  useProjectStore.setState({
    currentProject: {
      id: PROJECT_SESSION.projectId,
      name: 'Arch Handoff',
      path: PROJECT_PATH,
      novelConfig: {},
    } as never,
  })
  setActiveProjectSessionContext(PROJECT_SESSION)

  vi.spyOn(ipc, 'invokeWithProjectSession').mockImplementation((async (_session: unknown, channel: string) => {
    if (channel === 'db:project-core-get') {
      return {
        premise: '一段已经存在超过五十个字符的故事前提概要，用于验证更新而非空稿构思流程。',
        worldbuilding: '',
      }
    }
    if (channel === 'db:character-roster-read') {
      return { status: 'ready', revision: 1, entries: [], renderedMarkdown: '' }
    }
    throw new Error(`unexpected channel: ${channel}`)
  }) as never)

  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  setActiveProjectSessionContext(null)
  useAgentStore.setState(originalAgentState, true)
  useLayoutStore.setState(originalLayoutState, true)
  useLocaleStore.setState(originalLocaleState, true)
  useProjectStore.setState(originalProjectState, true)
})

describe('WorldBuildingEditor architect assistant handoff', () => {
  it('routes toolbar and per-section generate buttons directly to the architect assistant', async () => {
    await act(async () => root.render(<WorldBuildingEditor projectKey={PROJECT_PATH} />))
    await vi.waitFor(() => expect(container.textContent).toContain('架构助手构思'))

    const topButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.includes('架构助手构思'))
    expect(topButton).toBeDefined()

    await act(async () => topButton?.click())
    expect(useLayoutStore.getState()).toMatchObject({ aiPanelOpen: true, rightView: 'architect' })
    expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('故事架构（前提概要、世界观与核心人物）'), 'architect')

    const sectionButtons = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .filter(button => button.textContent?.includes('AI 生成'))
    expect(sectionButtons.length).toBe(3)

    // 前提概要已有内容 -> 完善/更新语境
    await act(async () => sectionButtons[0]?.click())
    expect(sendMessage).toHaveBeenLastCalledWith(expect.stringContaining('前提概要'), 'architect')

    // 世界观为空 -> 构思语境
    await act(async () => sectionButtons[1]?.click())
    expect(sendMessage).toHaveBeenLastCalledWith(expect.stringContaining('环境与世界观'), 'architect')

    // 人物 -> manage_characters 语境
    await act(async () => sectionButtons[2]?.click())
    expect(sendMessage).toHaveBeenLastCalledWith(expect.stringContaining('manage_characters'), 'architect')
  })
})
