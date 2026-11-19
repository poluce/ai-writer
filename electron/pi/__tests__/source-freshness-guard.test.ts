import { describe, expect, it, vi } from 'vitest'

import type { AnyAgentTool } from '../tool-types'
import {
  SourceFreshnessGuard,
  toolResultText,
  type SourceReadRequest,
} from '../source-freshness'
import { withSourceFreshnessGuard } from '../tool-builder'

function sourceKey(request: SourceReadRequest): string {
  return `${request.toolName}:${JSON.stringify(request.params)}`
}

function textTool(name: string, read: () => string): AnyAgentTool {
  return {
    name,
    label: name,
    description: name,
    parameters: {} as never,
    execute: async () => ({ content: [{ type: 'text', text: read() }] }),
  } as unknown as AnyAgentTool
}

function draftTool(onWrite: () => void): AnyAgentTool {
  return {
    name: 'manage_drafts',
    label: 'Manage Drafts',
    description: 'manage drafts',
    parameters: {} as never,
    isWriteOperation: (params: Record<string, unknown>) => (
      ['write', 'replace_excerpt', 'delete'].includes(String(params.action ?? 'read'))
    ),
    execute: async () => {
      onWrite()
      return { content: [{ type: 'text', text: '草稿已写入' }] }
    },
  } as unknown as AnyAgentTool
}

describe('SourceFreshnessGuard', () => {
  it('flags a required read that never happened', async () => {
    const store = new Map<string, string>()
    const guard = new SourceFreshnessGuard({
      reread: async request => store.get(sourceKey(request)) ?? '',
    })

    const violations = await guard.inspect([{
      request: { toolName: 'read_blueprint', params: { chapter_number: 2 } },
      label: '第 2 章蓝图',
    }])

    expect(violations).toEqual([{
      toolName: 'read_blueprint',
      params: { chapter_number: 2 },
      label: '第 2 章蓝图',
      reason: 'missing-read',
    }])
  })

  it('flags a source that changed after it was read and clears after rebaseline', async () => {
    const store = new Map<string, string>([['read_blueprint:{"chapter_number":1}', '旧蓝图']])
    const guard = new SourceFreshnessGuard({
      reread: async request => store.get(sourceKey(request)) ?? '',
    })
    guard.record({ toolName: 'read_blueprint', params: { chapter_number: 1 } }, '第 1 章蓝图', '旧蓝图')

    expect(await guard.inspect([])).toEqual([])

    store.set('read_blueprint:{"chapter_number":1}', '改后的蓝图')
    expect(await guard.inspect([])).toMatchObject([{ reason: 'changed-since-read', label: '第 1 章蓝图' }])

    await guard.rebaseline()
    expect(await guard.inspect([])).toEqual([])
  })
})

describe('withSourceFreshnessGuard', () => {
  function buildWriterLikeTools(state: { blueprint: string; writes: number }) {
    const read = textTool('read_blueprint', () => `第 1 章蓝图\n${state.blueprint}`)
    const drafts = draftTool(() => { state.writes += 1 })
    const tools = withSourceFreshnessGuard([read, drafts], 'zh-CN', { enforceDraftWrites: true })
    return {
      read: tools.find(tool => tool.name === 'read_blueprint')!,
      drafts: tools.find(tool => tool.name === 'manage_drafts')!,
    }
  }

  it('refuses a draft write before the chapter blueprint was read', async () => {
    const state = { blueprint: '标题: 旧', writes: 0 }
    const { drafts } = buildWriterLikeTools(state)

    const result = await drafts.execute('call-1', { action: 'write', chapter_number: 1 } as never)

    expect(state.writes).toBe(0)
    expect(toolResultText(result)).toContain('写入被拒绝：缺少必要的源信息读取')
    expect((result as { details?: { status?: string } }).details?.status).toBe('refused')
  })

  it('allows the write after a fresh read and refuses it again once the blueprint changes', async () => {
    const state = { blueprint: '标题: 旧', writes: 0 }
    const { read, drafts } = buildWriterLikeTools(state)

    await read.execute('call-read-1', { chapter_number: 1 } as never)
    await drafts.execute('call-write-1', { action: 'write', chapter_number: 1 } as never)
    expect(state.writes).toBe(1)

    state.blueprint = '标题: 新'
    const refused = await drafts.execute('call-write-2', { action: 'replace_excerpt', chapter_number: 1 } as never)
    expect(state.writes).toBe(1)
    expect(toolResultText(refused)).toContain('写入被拒绝：源信息已变更')
    expect(toolResultText(refused)).toContain('第 1 章蓝图')

    await read.execute('call-read-2', { chapter_number: 1 } as never)
    await drafts.execute('call-write-3', { action: 'replace_excerpt', chapter_number: 1 } as never)
    expect(state.writes).toBe(2)
  })

  it('keeps its own writes from looking like external changes', async () => {
    const state = { blueprint: '标题: 旧', writes: 0 }
    const { read, drafts } = buildWriterLikeTools(state)

    await read.execute('call-read', { chapter_number: 1 } as never)
    await drafts.execute('call-write-1', { action: 'write', chapter_number: 1 } as never)
    await drafts.execute('call-write-2', { action: 'replace_excerpt', chapter_number: 1 } as never)

    expect(state.writes).toBe(2)
  })

  it('does not gate read-only assistants', async () => {
    const state = { blueprint: '标题: 旧', writes: 0 }
    const read = textTool('read_blueprint', () => state.blueprint)
    const drafts = draftTool(() => { state.writes += 1 })
    const tools = withSourceFreshnessGuard([read, drafts], 'zh-CN', { enforceDraftWrites: false })

    await tools.find(tool => tool.name === 'manage_drafts')!
      .execute('call-write', { action: 'write', chapter_number: 1 } as never)

    expect(state.writes).toBe(1)
  })
})

describe('buildToolsForAssistantType wiring', () => {
  it('refuses the writing assistant draft write until it reads the blueprint', async () => {
    const { buildToolsForAssistantType } = await import('../tool-builder')
    const tools = buildToolsForAssistantType('writer', 'zh-CN', vi.fn())
    const drafts = tools.find(tool => tool.name === 'manage_drafts')

    expect(drafts).toBeDefined()
    const result = await drafts!.execute('call-write', { action: 'write', chapter_number: 1 } as never)

    expect(toolResultText(result)).toContain('写入被拒绝')
  })
})
