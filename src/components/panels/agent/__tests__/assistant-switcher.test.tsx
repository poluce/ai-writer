import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AssistantSwitcher, shouldPulseOutputTab } from '../AssistantSwitcher'

describe('AssistantSwitcher', () => {
  it('renders one entry per assistant view', () => {
    const html = renderToString(<AssistantSwitcher />)
    for (const title of ['写作', '架构', '蓝图', '审稿', '输出']) {
      expect(html).toContain(`title="${title}"`)
    }
  })

  it('exposes the five views as a tablist', () => {
    const html = renderToString(<AssistantSwitcher />)
    expect(html).toContain('role="tablist"')
    expect(html.match(/role="tab"/g)?.length).toBe(5)
  })

  it('only pulses the output tab when work runs outside the output view', () => {
    expect(shouldPulseOutputTab('agent', [{ status: 'running' }])).toBe(true)
    expect(shouldPulseOutputTab('agent', [{ status: 'waiting' }])).toBe(true)
    expect(shouldPulseOutputTab('ai-output', [{ status: 'running' }])).toBe(false)
    expect(shouldPulseOutputTab('agent', [{ status: 'completed' }])).toBe(false)
    expect(shouldPulseOutputTab('review', [])).toBe(false)
  })
})
