import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { page } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useLayoutStore } from '../../../stores/layout-store'
import { useLocaleStore } from '../../../stores/locale-store'
import AssistantRail from '../AssistantRail'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement
const originalLayoutState = useLayoutStore.getState()
const originalLocaleState = useLocaleStore.getState()

beforeEach(() => {
  useLocaleStore.setState({ locale: 'zh-CN' })
  useLayoutStore.setState({ aiPanelOpen: false, rightView: 'agent' })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  useLayoutStore.setState(originalLayoutState)
  useLocaleStore.setState(originalLocaleState)
})

describe('AssistantRail', () => {
  it('keeps the five assistant views reachable while the panel is closed', async () => {
    await act(async () => root.render(<AssistantRail />))

    for (const label of ['写作', '架构', '蓝图', '审稿', '输出']) {
      await expect.element(page.getByRole('button', { name: label, exact: true })).toBeVisible()
    }

    await act(async () => page.getByRole('button', { name: '审稿', exact: true }).click())
    expect(useLayoutStore.getState().aiPanelOpen).toBe(true)
    expect(useLayoutStore.getState().rightView).toBe('review')
  })

  it('steps aside while the assistant panel is open', async () => {
    useLayoutStore.setState({ aiPanelOpen: true })
    await act(async () => root.render(<AssistantRail />))

    expect(container.querySelector('.writer-right-rail')).toBeNull()
  })
})
