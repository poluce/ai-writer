import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../database', () => ({
  getCurrentProjectPath: vi.fn(),
}))

import { getCurrentProjectPath } from '../../../database'
import { createListFilesTool } from '../list-files.tool'

const projectPathMock = getCurrentProjectPath as ReturnType<typeof vi.fn>

let projectRoot = ''

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0]
  if (!first || first.type !== 'text' || typeof first.text !== 'string') {
    throw new Error('expected text content')
  }
  return first.text
}

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-list-files-'))
  projectPathMock.mockReset()
  projectPathMock.mockReturnValue(projectRoot)

  fs.mkdirSync(path.join(projectRoot, 'notes'))
  fs.mkdirSync(path.join(projectRoot, 'chapters'))
  fs.mkdirSync(path.join(projectRoot, '.vela'))
  fs.writeFileSync(path.join(projectRoot, 'outline.md'), '# 大纲\n')
  fs.writeFileSync(path.join(projectRoot, 'notes', 'a.md'), 'a\n')
  fs.writeFileSync(path.join(projectRoot, 'chapters', 'ch1.txt'), '正文')
  fs.writeFileSync(path.join(projectRoot, '.vela', 'vela.db'), 'private')
})

afterEach(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true })
})

describe('list_files', () => {
  it('lists project folders and files while hiding app-owned directories', async () => {
    const tool = createListFilesTool('zh-CN')
    const result = await tool.execute('call-1', {})
    const body = textOf(result)

    expect(body).toContain('项目文件')
    expect(body).toContain('- notes/')
    expect(body).toContain('- chapters/')
    expect(body).toContain('- outline.md')
    expect(body).toContain('- notes/a.md')
    expect(body).not.toContain('.vela')
    expect(result.details).toMatchObject({ root: '.', pattern: '*', truncated: false })
  })

  it('filters files with a glob pattern and skips directory rows', async () => {
    const tool = createListFilesTool('zh-CN')
    const result = await tool.execute('call-1', { pattern: '*.md' })
    const body = textOf(result)

    expect(body).toContain('- outline.md')
    expect(body).toContain('- notes/a.md')
    expect(body).not.toContain('chapters/ch1.txt')
    expect((result.details as { entries: Array<{ path: string }> }).entries.map(entry => entry.path))
      .toEqual(['notes/a.md', 'outline.md'])
  })

  it('stops at the entry limit and reports truncation', async () => {
    const tool = createListFilesTool('zh-CN')
    const result = await tool.execute('call-1', { limit: 2 })
    const details = result.details as { entries: unknown[]; truncated: boolean }
    expect(details.entries).toHaveLength(2)
    expect(details.truncated).toBe(true)
    expect(textOf(result)).toContain('结果被截断')
  })

  it('rejects directories outside the project', async () => {
    const tool = createListFilesTool('zh-CN')
    await expect(tool.execute('call-1', { directory: '../' }))
      .rejects.toThrow('超出了项目目录范')
  })

  it('suggests read_file when the target is a file', async () => {
    const tool = createListFilesTool('zh-CN')
    await expect(tool.execute('call-1', { directory: 'outline.md' }))
      .rejects.toThrow('不是目录')
  })
})
