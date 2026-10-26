import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { BottomPanelTabs, runningTaskCount } from '../BottomPanelTabs'
import { useLayoutStore } from '../../../stores/layout-store'

describe('BottomPanelTabs', () => {
  beforeEach(() => {
    useLayoutStore.setState({ bottomPanelOpen: true, bottomTab: 'tasks', activeRailItem: 'project' })
  })

  it('keeps tasks, logs, and model calls permanently available', () => {
    const html = renderToString(<BottomPanelTabs />)
    for (const label of ['任务', '日志', '模型调用']) {
      expect(html).toContain(label)
    }
  })

  it('counts only running and waiting tasks for the badge', () => {
    expect(runningTaskCount([{ status: 'running' }, { status: 'waiting' }])).toBe(2)
    expect(runningTaskCount([{ status: 'paused' }, { status: 'completed' }])).toBe(0)
  })

  it('switches tab without stealing the content rail highlight', () => {
    useLayoutStore.getState().selectBottomTab('log')

    const state = useLayoutStore.getState()
    expect(state.bottomTab).toBe('log')
    expect(state.bottomPanelOpen).toBe(true)
    // 左栏高亮仍属于内容导航，不被底部页签改写
    expect(state.activeRailItem).toBe('project')
  })

  it('collapses the panel when the active tab is selected again', () => {
    useLayoutStore.getState().selectBottomTab('models')
    expect(useLayoutStore.getState().bottomPanelOpen).toBe(true)

    useLayoutStore.getState().selectBottomTab('models')
    expect(useLayoutStore.getState().bottomPanelOpen).toBe(false)
  })
})
