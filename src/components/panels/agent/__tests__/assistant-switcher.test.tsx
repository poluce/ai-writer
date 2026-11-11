import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AssistantSwitcher } from '../AssistantSwitcher'

describe('AssistantSwitcher', () => {
  it('renders one entry per assistant view', () => {
    const html = renderToString(<AssistantSwitcher />)
    for (const title of ['助手', '架构', '蓝图', '写作', '审稿']) {
      expect(html).toContain(`title="${title}"`)
    }
    expect(html).not.toContain('title="输出"')
  })

  it('exposes the five assistant views as a tablist', () => {
    const html = renderToString(<AssistantSwitcher />)
    expect(html).toContain('role="tablist"')
    expect(html.match(/role="tab"/g)?.length).toBe(5)
  })
})
