import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { useLocaleStore } from '../../../stores/locale-store'
import { useLLMStore } from '../../../stores/llm-store'
import { useProjectStore } from '../../../stores/project-store'
import { setActiveProjectSessionContext } from '../../../shared/project-session-context'
import { loadWorldMap } from '../../../services/world-map-service'
import WorldMapEditor from '../WorldMapEditor'
import { sampleWorldMap } from './world-map-fixture'

const generateExecute = vi.hoisted(() => vi.fn())

vi.mock('../../../services/workflows/commands/generate-world-map.command', () => ({
  GenerateWorldMapCommand: class {
    execute(...args: never[]) { return generateExecute(...args) }
  },
}))

vi.mock('../../../services/world-map-service', () => ({
  loadWorldMap: vi.fn(),
  saveWorldMap: vi.fn(async () => ({ success: true })),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const projectPath = 'C:\\novels\\world-map-browser'
const originalLocaleState = useLocaleStore.getState()
const originalProjectState = useProjectStore.getState()
const originalLLMState = useLLMStore.getState()
let root: Root | undefined
let container: HTMLDivElement | undefined

const project = {
  id: 'world-map-browser',
  name: '掌管仙宗差点被推翻',
  path: projectPath,
  novelConfig: {
    genre: '仙侠',
    coreOutline: '散修逆炼死煞。',
    worldSetting: '五域以灵脉为界。',
    goldenFinger: '逆命道鉴。',
    protagonistProfile: '李宣。',
  },
  characterStates: '',
  createdAt: '',
  updatedAt: '',
}

async function mount() {
  useLocaleStore.setState({ locale: 'zh-CN' })
  useProjectStore.setState({ currentProject: project as never })
  setActiveProjectSessionContext({ projectId: project.id, projectPath })
  container = document.createElement('div')
  container.style.width = '1440px'
  container.style.height = '900px'
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root?.render(<WorldMapEditor projectKey={projectPath} />))
}

beforeEach(() => {
  vi.mocked(loadWorldMap).mockReset()
  generateExecute.mockReset()
  useLLMStore.setState({ defaultModelId: null })
})

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  useLocaleStore.setState(originalLocaleState)
  useProjectStore.setState(originalProjectState)
  useLLMStore.setState(originalLLMState)
  setActiveProjectSessionContext(null)
})

describe('world map page', () => {
  it('starts from a single AI-generation entry instead of an empty editor', async () => {
    vi.mocked(loadWorldMap).mockResolvedValue({ success: true, data: null })
    await mount()

    await expect.element(page.getByRole('heading', { name: '世界地图', exact: true })).toBeVisible()
    await expect.element(page.getByRole('button', { name: /生成世界/ }).first()).toBeVisible()
    await expect.element(page.getByText('还没有世界地图')).toBeVisible()
    await expect.element(page.getByText('只生成建议，不会直接改动项目文件')).toBeVisible()
  })

  it('renders the saved map, two ladders, and the selected faction detail', async () => {
    vi.mocked(loadWorldMap).mockResolvedValue({ success: true, data: sampleWorldMap() })
    await mount()

    await expect.element(page.getByRole('heading', { name: '九域' })).toBeVisible()
    await expect.element(page.getByRole('img', { name: '九域世界地图' })).toBeVisible()
    await expect.element(page.getByRole('heading', { name: '势力等级' })).toBeVisible()
    await expect.element(page.getByRole('heading', { name: '境界体系' })).toBeVisible()
    await expect.element(page.getByRole('heading', { name: '天枢宗' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: /校对世界/ })).toBeVisible()
  })

  it('shows generation progress while the world-map tool is running', async () => {
    vi.mocked(loadWorldMap).mockResolvedValue({ success: true, data: null })
    generateExecute.mockReturnValue(new Promise(() => {}))
    useLLMStore.setState({ defaultModelId: 'model-1' })
    await mount()

    await page.getByRole('button', { name: /生成世界/ }).click()
    await expect.element(page.getByRole('heading', { name: '正在生成世界地图' })).toBeVisible()
    await expect.element(page.getByText('模型正在通过世界地图工具构建区域、势力与等级阶梯。')).toBeVisible()
  })

  it('holds a generated draft in preview until the author applies it', async () => {
    vi.mocked(loadWorldMap).mockResolvedValue({ success: true, data: null })
    generateExecute.mockResolvedValue(sampleWorldMap())
    useLLMStore.setState({ defaultModelId: 'model-1' })
    await mount()

    await page.getByRole('button', { name: /生成世界/ }).click()
    await expect.element(page.getByRole('button', { name: /应用地图/ })).toBeVisible()
    await expect.element(page.getByText('生成预览 · 尚未应用')).toBeVisible()
    await expect.element(page.getByRole('button', { name: /取消/ })).toBeVisible()
  })

  it('switches between the flat atlas and the interactive globe', async () => {
    vi.mocked(loadWorldMap).mockResolvedValue({ success: true, data: sampleWorldMap() })
    await mount()

    await page.getByRole('button', { name: '球体' }).click()
    await expect.element(page.getByRole('img', { name: '九域世界地图 · 球体' })).toBeVisible()
    await expect.element(page.getByText('总览 · 球体')).toBeVisible()

    await page.getByRole('button', { name: '平面' }).click()
    await expect.element(page.getByRole('img', { name: '九域世界地图' })).toBeVisible()
  })

  it('opens the faction proofreading panel without touching the saved map first', async () => {
    vi.mocked(loadWorldMap).mockResolvedValue({ success: true, data: sampleWorldMap() })
    await mount()

    await page.getByRole('button', { name: /校对世界/ }).click()
    await expect.element(page.getByRole('button', { name: /完成校对/ })).toBeVisible()
    await page.getByRole('button', { name: /编辑势力/ }).click()
    await expect.element(page.getByText('校对 · 势力')).toBeVisible()
    await expect.element(page.getByRole('button', { name: /保存修改/ })).toBeVisible()
  })
})
