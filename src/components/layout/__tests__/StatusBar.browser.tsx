import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { page } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useLLMStore } from '../../../stores/llm-store'
import { useLocaleStore } from '../../../stores/locale-store'
import type { ModelProfile } from '../../../shared/domain-data'
import StatusBar from '../StatusBar'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement
const originalLocaleState = useLocaleStore.getState()
const originalLLMState = useLLMStore.getState()

function model(overrides: Partial<ModelProfile>): ModelProfile {
  return {
    id: 'model-1',
    name: 'Gemini 3.8 Flash',
    provider: 'gemini',
    protocol: 'gemini',
    modelName: 'gemini-3.8-flash',
    apiKey: 'test-key',
    baseUrl: 'http://127.0.0.1:9',
    temperature: 0.7,
    maxTokens: 4096,
    purposes: ['generation'],
    ...overrides,
  }
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'zh-CN' })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  useLocaleStore.setState(originalLocaleState)
  useLLMStore.setState(originalLLMState)
})

describe('StatusBar', () => {
  it('keeps the model name out of the status bar so it cannot become a second settings entry', async () => {
    useLLMStore.setState({ models: [model({})], defaultModelId: 'model-1' })
    await act(async () => root.render(<StatusBar />))

    // 品牌分段仍然在，作为状态栏正常渲染的基准，并在软件名后展示版本号
    await expect.element(page.getByText('AI Writer')).toBeVisible()
    await expect.element(page.getByText(`v${__APP_VERSION__}`)).toBeVisible()
    // 当前模型名不再展示，也不存在点击进设置的入口
    expect(page.getByText('Gemini 3.8 Flash').query()).toBeNull()
    expect(page.getByText('未配置模型').query()).toBeNull()
    expect(page.getByRole('button', { name: '设置' }).query()).toBeNull()
  })

  it('shows no model placeholder when no model is configured', async () => {
    useLLMStore.setState({ models: [], defaultModelId: null })
    await act(async () => root.render(<StatusBar />))

    expect(page.getByText('未配置模型').query()).toBeNull()
    expect(page.getByText('No model configured').query()).toBeNull()
  })
})
