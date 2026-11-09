import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { NovelConfig, ProjectData } from '../../shared/ipc-channels'
import { setActiveProjectSessionContext } from '../../shared/project-session-context'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'
import NovelConfigEditor from '../editor/NovelConfigEditor'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const originalLocaleState = useLocaleStore.getState()
const originalProjectState = useProjectStore.getState()

let root: Root | undefined
let container: HTMLDivElement | undefined

function baseConfig(): NovelConfig {
  return {
    writingLanguage: 'zh-CN',
    genre: '仙侠',
    subGenre: '修仙',
    targetAudience: '男频',
    totalChapters: 100,
    wordsPerChapter: 3000,
    plotStructure: 'freeform',
    narrativePOV: 'third_limited',
    narrativeThreadDormantChapterThreshold: 3,
    coreOutline: '散修李宣灵根劣等，寿元将尽，靠着逆命道鉴逆炼死煞。',
    worldSetting: '',
    goldenFinger: '逆命道鉴。',
    protagonistProfile: '李宣，寒微出身，极擅忍耐。',
    globalGuidance: '每章留一个可回收的钩子。',
    writingStyle: '',
    referenceWorks: '',
    needsGoldenFinger: true,
  }
}

function project(): ProjectData {
  return {
    id: 'document-page',
    name: '掌管仙宗差点被推翻',
    path: 'C:\\novels\\document-page',
    novelConfig: baseConfig(),
    characterStates: '',
    createdAt: '',
    updatedAt: '',
  }
}

async function mount(projectData: ProjectData, saveProject = vi.fn(async () => true)) {
  useLocaleStore.setState({ locale: 'zh-CN' })
  useProjectStore.setState({ currentProject: projectData, saveProject: saveProject as never })
  setActiveProjectSessionContext({ projectId: projectData.id, projectPath: projectData.path })
  container = document.createElement('div')
  container.style.height = '800px'
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root?.render(<NovelConfigEditor projectKey={projectData.path} />))
  return saveProject
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

describe('novel config as a document', () => {
  it('renders the document title and sections without a manual save button', async () => {
    await mount(project())

    await expect.element(page.getByRole('heading', { name: '作品设定', exact: true })).toBeVisible()
    await expect.element(page.getByRole('heading', { name: '核心大纲', exact: true })).toBeVisible()
    await expect.element(page.getByRole('heading', { name: '世界观 / 初始设定', exact: true })).toBeVisible()
    await expect.element(page.getByRole('heading', { name: '写作纪律', exact: true })).toBeVisible()
    await expect.element(page.getByRole('button', { name: '补齐设定', exact: true })).toBeVisible()
    expect(page.getByRole('button', { name: '保存', exact: true }).query()).toBeNull()
  })

  it('keeps project coordinates closed until the author asks for them', async () => {
    await mount(project())

    expect(page.getByRole('combobox', { name: '写作语言' }).query()).toBeNull()
    await act(async () => page.getByRole('button', { name: '编辑作品坐标' }).click())
    await expect.element(page.getByRole('combobox', { name: '写作语言' })).toBeVisible()
    await expect.element(page.getByRole('combobox', { name: '金手指' })).toBeVisible()
  })

  it('edits prose in place and auto-saves without a save action', async () => {
    const saveProject = await mount(project())

    await act(async () => page.getByRole('button', { name: '编辑', exact: true }).first().click())
    const editor = page.getByRole('textbox', { name: '核心大纲' })
    await act(async () => editor.fill('李宣决定先夺回被宗门扣下的灵田。'))
    expect(useProjectStore.getState().currentProject?.novelConfig.coreOutline).toBe('李宣决定先夺回被宗门扣下的灵田。')

    await vi.waitFor(() => expect(saveProject).toHaveBeenCalled(), { timeout: 3000 })
    await expect.element(page.getByText('李宣决定先夺回被宗门扣下的灵田。', { exact: true })).toBeVisible()
  })

  it('scrolls the document to a section from the margin navigation', async () => {
    await mount(project())

    await act(async () => page.getByRole('button', { name: '写作纪律' }).click())
    await vi.waitFor(() => {
      expect(document.querySelector('.novel-settings-nav-item.active')?.textContent).toContain('写作纪律')
    })
  })
})
