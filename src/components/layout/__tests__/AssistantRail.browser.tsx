import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { page } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ProjectData } from '../../../shared/ipc-channels'
import { useLayoutStore } from '../../../stores/layout-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import AssistantRail from '../AssistantRail'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement
const originalLayoutState = useLayoutStore.getState()
const originalLocaleState = useLocaleStore.getState()
const originalProjectState = useProjectStore.getState()

const project: ProjectData = {
  id: 'assistant-rail-project',
  name: '测试书',
  path: 'C:\\novels\\assistant-rail',
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
  useLayoutStore.setState({ aiPanelOpen: false, rightView: 'agent' })
  useProjectStore.setState({ currentProject: null })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  useLayoutStore.setState(originalLayoutState)
  useLocaleStore.setState(originalLocaleState)
  useProjectStore.setState(originalProjectState)
})

describe('AssistantRail', () => {
  it('keeps the five assistant views reachable while the panel is closed', async () => {
    useProjectStore.setState({ currentProject: project })
    await act(async () => root.render(<AssistantRail />))

    for (const label of ['助手', '架构', '蓝图', '写作', '审稿']) {
      await expect.element(page.getByRole('button', { name: label, exact: true })).toBeVisible()
    }
    expect(page.getByRole('button', { name: '输出', exact: true }).query()).toBeNull()

    await act(async () => page.getByRole('button', { name: '写作', exact: true }).click())
    expect(useLayoutStore.getState().aiPanelOpen).toBe(true)
    expect(useLayoutStore.getState().rightView).toBe('writer')

    await act(async () => useLayoutStore.setState({ aiPanelOpen: false }))
    await act(async () => page.getByRole('button', { name: '审稿', exact: true }).click())
    expect(useLayoutStore.getState().aiPanelOpen).toBe(true)
    expect(useLayoutStore.getState().rightView).toBe('review')
  })

  it('steps aside while the assistant panel is shown', async () => {
    useProjectStore.setState({ currentProject: project })
    useLayoutStore.setState({ aiPanelOpen: true })
    await act(async () => root.render(<AssistantRail />))

    expect(container.querySelector('.writer-right-rail')).toBeNull()
  })

  it('hides the rail on the launcher, before a project is open', async () => {
    await act(async () => root.render(<AssistantRail />))

    expect(container.querySelector('.writer-right-rail')).toBeNull()
    expect(page.getByRole('toolbar').query()).toBeNull()
  })
})

