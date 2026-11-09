import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { page } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ProjectData } from '../../../shared/ipc-channels'
import { useLayoutStore } from '../../../stores/layout-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import LeftToolWindowBar from '../LeftToolWindowBar'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement
const originalLayout = useLayoutStore.getState()
const originalLocale = useLocaleStore.getState()
const originalProject = useProjectStore.getState()

const project: ProjectData = {
  id: 'left-rail-browser-project',
  name: '测试书',
  path: 'C:\\novels\\left-rail-browser',
  novelConfig: {
    genre: '', subGenre: '', targetAudience: '', totalChapters: 3, wordsPerChapter: 2500,
    plotStructure: 'three_act', narrativePOV: 'third_limited', coreOutline: '',
    worldSetting: '', goldenFinger: '', protagonistProfile: '', globalGuidance: '',
  },
  characterStates: '',
  createdAt: '',
  updatedAt: '',
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'zh-CN' })
  useLayoutStore.setState({ activeRailItem: 'project', settingsOpen: false })
  useProjectStore.setState({ currentProject: null })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  useLayoutStore.setState(originalLayout)
  useLocaleStore.setState(originalLocale)
  useProjectStore.setState(originalProject)
})

describe('LeftToolWindowBar project gating', () => {
  it('shows every workspace entry once a project is open', async () => {
    useProjectStore.setState({ currentProject: project })
    await act(async () => root.render(<LeftToolWindowBar />))

    for (const label of ['项目', '架构', '情节', '蓝图', '剧情', '人物', '知识库', '设置']) {
      await expect.element(page.getByRole('button', { name: label, exact: true })).toBeVisible()
    }
  })

  it('keeps only the project and settings entries on the launcher', async () => {
    await act(async () => root.render(<LeftToolWindowBar />))

    await expect.element(page.getByRole('button', { name: '项目', exact: true })).toBeVisible()
    await expect.element(page.getByRole('button', { name: '设置', exact: true })).toBeVisible()
    for (const label of ['架构', '情节', '蓝图', '剧情', '人物', '知识库']) {
      expect(page.getByRole('button', { name: label, exact: true }).query()).toBeNull()
    }
  })
})
