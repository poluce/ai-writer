import { describe, expect, it } from 'vitest'

import { createManageMcpTool } from '../tools/manage-mcp.tool'
import { createNovelConfigTool } from '../tools/novel-config.tool'
import { createStoryArchitectureTool } from '../tools/story-architecture.tool'
import { createWebFetchTool } from '../tools/web-fetch.tool'

const sink = () => undefined

describe('tool declarations carry the migrated usage rules', () => {
  it('web_fetch requires itself instead of bash/curl/wget', () => {
    const zh = createWebFetchTool('zh-CN').description
    const en = createWebFetchTool('en-US').description
    expect(zh).toContain('bash')
    expect(zh).toContain('curl')
    expect(zh).toContain('wget')
    expect(en).toContain('bash')
    expect(en).toContain('curl')
    expect(en).toContain('wget')
  })

  it('manage_mcp forbids manual bash proxy scripts', () => {
    expect(createManageMcpTool('zh-CN').description).toContain('bash')
    expect(createManageMcpTool('zh-CN').description).toContain('代理')
    expect(createManageMcpTool('en-US').description).toContain('bash')
    expect(createManageMcpTool('en-US').description).toContain('prox')
  })

  it('novel_config and story_architecture require reading before modifying', () => {
    expect(createNovelConfigTool('zh-CN', sink).description).toContain('action: "read"')
    expect(createNovelConfigTool('zh-CN', sink).description).toContain('局部替换')
    expect(createStoryArchitectureTool('zh-CN', sink).description).toContain('action: "read"')
    expect(createStoryArchitectureTool('en-US', sink).description).toContain('action: "read"')
  })
})
