import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import { useEditorStore } from '../../../stores/editor-store'
import { setActiveProjectSessionContext } from '../../../shared/project-session-context'
import EditorArea from '../EditorArea'

vi.mock('../../../services/world-map-service', () => ({
  loadWorldMap: vi.fn(async () => ({ success: true, data: null })),
  saveWorldMap: vi.fn(async () => ({ success: true })),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const projectPath = 'C:\\novels\\tab-check'
const project = {
  id: 'tab-check', name: '测试项目', path: projectPath,
  novelConfig: { genre: '仙侠', coreOutline: '大纲', worldSetting: '世界', goldenFinger: '金手指', protagonistProfile: '主角' },
  characterStates: '', createdAt: '', updatedAt: '',
}
let root: Root | undefined
let container: HTMLDivElement | undefined
const originalEditorState = useEditorStore.getState()
const originalLocaleState = useLocaleStore.getState()
const originalProjectState = useProjectStore.getState()

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  useEditorStore.setState(originalEditorState)
  useLocaleStore.setState(originalLocaleState)
  useProjectStore.setState(originalProjectState)
  setActiveProjectSessionContext(null)
})

describe('world map tab integration', () => {
  it('renders the world map page for the active project tab', async () => {
    useLocaleStore.setState({ locale: 'zh-CN' })
    useProjectStore.setState({ currentProject: project as never })
    setActiveProjectSessionContext({ projectId: project.id, projectPath })
    const tabId = `world-map-editor:${encodeURIComponent(projectPath)}`
    useEditorStore.setState({
      tabs: [{ id: tabId, name: '世界地图', type: 'world-map', projectKey: projectPath }],
      activeTabId: tabId,
    })
    container = document.createElement('div')
    container.style.width = '1200px'
    container.style.height = '760px'
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root?.render(<EditorArea />))
    const worldMapTab = page.getByText('世界地图', { exact: true }).first()
    await expect.element(worldMapTab).toBeVisible()
    await worldMapTab.click()
    await expect.element(page.getByRole('heading', { name: '世界地图', exact: true })).toBeVisible()
    await expect.element(page.getByRole('button', { name: /生成世界/ })).toBeVisible()
  })
})
