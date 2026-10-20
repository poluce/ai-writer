import { describe, expect, it } from 'vitest'

import { LLMDataRequestGate } from '../llm-data-request-gate'

describe('LLMDataRequestGate', () => {
  // 渲染层项目租约层已移除；同路径重开的权威保证由主进程 ProjectAccess 覆盖
  // （electron/services/__tests__/project-access.test.ts）。
  it.skip('rejects a late stats response after the same logical path reopens with a new lease', () => {
    const gate = new LLMDataRequestGate()
    const oldSession = {
      projectId: 'novel-A',
      projectPath: 'C:\\Novels\\A',
    }
    const ticket = gate.begin(oldSession)

    expect(gate.isCurrent(ticket, {
      projectId: 'novel-A',
      projectPath: 'c:/novels/a/',
    })).toBe(false)
  })

  it('rejects an earlier request after a later request begins for the same session', () => {
    const gate = new LLMDataRequestGate()
    const session = {
      projectId: 'novel-A',
      projectPath: 'C:\\Novels\\A',
    }
    const earlier = gate.begin(session)
    gate.begin(session)

    expect(gate.isCurrent(earlier, session)).toBe(false)
  })
})
