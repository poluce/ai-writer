import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { page } from 'vitest/browser'

import type { ModelProfile } from '../../../shared/domain-data'
import { useLLMStore } from '../../../stores/llm-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import { OpenProjectFirstPage } from '../OpenProjectFirstPage'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement
const originalLocaleState = useLocaleStore.getState()
const originalProjectState = useProjectStore.getState()
const originalLlmState = useLLMStore.getState()

const model: ModelProfile = {
  id: 'launcher-model',
  name: 'DeepSeek V4.1',
  provider: 'deepseek',
  protocol: 'openai',
  modelName: 'deepseek-v4.1-flash',
  apiKey: '',
  baseUrl: '',
  temperature: 0.7,
  maxTokens: 4096,
  purposes: ['generation', 'refinement', 'summary'],
}

const latest = {
  name: '掌管仙宗差点被推翻',
  path: 'C:\\novels\\xianzong',
  updatedAt: new Date().toISOString(),
  snapshot: {
    lastChapterNumber: 47,
    lastChapterTitle: '玄天宗的对账夜',
    totalWords: 124300,
    finalizedChapters: 42,
    totalChapters: 120,
    excerpt: '玄天宗的山门在雨里亮了整夜。',
  },
}

const other = {
  name: '雾城档案',
  path: 'C:\\novels\\wucheng',
  updatedAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
  snapshot: { lastChapterNumber: 89, totalWords: 312000, finalizedChapters: 88, totalChapters: 200 },
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'zh-CN' })
  useProjectStore.setState({ currentProject: null, recentProjects: [latest, other] })
  useLLMStore.setState({ models: [model], defaultModelId: model.id })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  useLocaleStore.setState(originalLocaleState)
  useProjectStore.setState(originalProjectState)
  useLLMStore.setState(originalLlmState)
})

describe('OpenProjectFirstPage launcher', () => {
  it('continues the latest project with real progress data and lists the rest', async () => {
    await act(async () => root.render(<OpenProjectFirstPage />))

    const heading = page.getByRole('heading', { level: 1 })
    await expect.element(heading).toHaveTextContent('掌管仙宗差点被推翻')
    await expect.element(page.getByText('第 47 章')).toBeVisible()
    await expect.element(page.getByText('玄天宗的对账夜')).toBeVisible()
    await expect.element(page.getByText('12.4 万字')).toBeVisible()
    await expect.element(page.getByText('39%')).toBeVisible()
    await expect.element(page.getByText('玄天宗的山门在雨里亮了整夜。')).toBeVisible()
    await expect.element(page.getByRole('button', { name: '继续写作', exact: true })).toBeVisible()

    await expect.element(page.getByRole('button', { name: /^雾城档案/ })).toBeVisible()
    await expect.element(page.getByText('第 89 章', { exact: false })).toBeVisible()

    // 开始面板：新建 / 打开 / 拆解三条入口，以及模型就绪状态
    await expect.element(page.getByRole('button', { name: '新建项目', exact: true })).toBeVisible()
    await expect.element(page.getByRole('button', { name: '打开项目', exact: true })).toBeVisible()
    await expect.element(page.getByText('模型已就绪')).toBeVisible()
    await expect.element(page.getByText('DeepSeek V4.1')).toBeVisible()
  })

  it('starts from an intro when there is no recent project and no model', async () => {
    useProjectStore.setState({ currentProject: null, recentProjects: [] })
    useLLMStore.setState({ models: [], defaultModelId: null })
    await act(async () => root.render(<OpenProjectFirstPage />))

    await expect.element(page.getByRole('heading', { level: 1 })).toHaveTextContent('开始一部长篇')
    // 开场只保留一组新建 / 打开，不和工作区右侧的开始面板重复
    expect(page.getByRole('button', { name: '新建项目', exact: true }).elements()).toHaveLength(1)
    expect(page.getByRole('button', { name: '打开项目', exact: true }).elements()).toHaveLength(0)
    await expect.element(page.getByText('最近打开的作品会显示在这里')).toBeVisible()
    await expect.element(page.getByText('尚未配置模型')).toBeVisible()
    await expect.element(page.getByRole('button', { name: '去设置', exact: true })).toBeVisible()
  })
})
