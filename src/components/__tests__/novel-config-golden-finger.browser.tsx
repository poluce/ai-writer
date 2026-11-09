import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { page } from 'vitest/browser'
import { afterEach, describe, expect, it } from 'vitest'

import type { ProjectData } from '../../shared/ipc-channels'
import { setActiveProjectSessionContext } from '../../shared/project-session-context'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'
import NovelConfigEditor from '../editor/NovelConfigEditor'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const originalLocaleState = useLocaleStore.getState()
const originalProjectState = useProjectStore.getState()

let root: Root | undefined
let container: HTMLDivElement | undefined

function project(needsGoldenFinger?: boolean): ProjectData {
  return {
    id: 'golden-finger-toggle',
    name: '城中村改造纪实',
    path: 'C:\\novels\\golden-finger-toggle',
    novelConfig: {
      writingLanguage: 'zh-CN',
      genre: '都市',
      subGenre: '',
      targetAudience: '男频',
      totalChapters: 100,
      wordsPerChapter: 3000,
      plotStructure: 'freeform',
      narrativePOV: 'third_limited',
      coreOutline: '陈默要在城中村拆完前保住老屋。',
      worldSetting: '',
      goldenFinger: '前世记忆。',
      protagonistProfile: '',
      globalGuidance: '',
      ...(needsGoldenFinger === undefined ? {} : { needsGoldenFinger }),
    },
    characterStates: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

async function mount(projectData: ProjectData) {
  useLocaleStore.setState({ locale: 'zh-CN' })
  useProjectStore.setState({ currentProject: projectData })
  container = document.createElement('div')
  container.style.height = '600px'
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root?.render(<NovelConfigEditor projectKey={projectData.path} />))
}

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  useLocaleStore.setState(originalLocaleState)
  useProjectStore.setState(originalProjectState)
  setActiveProjectSessionContext(null)
})

describe('novel config golden-finger setting', () => {
  it('hides the golden-finger section after switching it to not needed', async () => {
    await mount(project())

    await expect.element(page.getByText('金手指 / 核心卖点', { exact: true })).toBeVisible()
    const select = page.getByRole('combobox', { name: '金手指' })
    expect((select.element() as HTMLSelectElement).value).toBe('yes')

    await act(async () => select.selectOptions('no'))

    expect(page.getByText('金手指 / 核心卖点', { exact: true }).query()).toBeNull()
    expect(useProjectStore.getState().currentProject?.novelConfig.needsGoldenFinger).toBe(false)
    expect((page.getByRole('combobox', { name: '金手指' }).element() as HTMLSelectElement).value).toBe('no')
  })

  it('keeps the section hidden for projects that never needed a golden finger', async () => {
    await mount(project(false))

    expect(page.getByText('金手指 / 核心卖点', { exact: true }).query()).toBeNull()
    expect((page.getByRole('combobox', { name: '金手指' }).element() as HTMLSelectElement).value).toBe('no')
    // 其他章节仍然正常呈现
    await expect.element(page.getByText('核心大纲', { exact: true })).toBeVisible()
  })
})
