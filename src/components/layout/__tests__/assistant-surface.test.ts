import { describe, expect, it } from 'vitest'

import { resolveAssistantSurface } from '../assistant-surface'

describe('assistant surface', () => {
  it('only shows the expanded panel when a project is open and the panel is expanded', () => {
    expect(resolveAssistantSurface(true, true)).toBe('panel')
    expect(resolveAssistantSurface(false, true)).toBe('rail')
    // 未打开项目时助手内容没有事实来源：即使面板状态是展开，也只保留图标条
    expect(resolveAssistantSurface(true, false)).toBe('rail')
    expect(resolveAssistantSurface(false, false)).toBe('rail')
  })
})
