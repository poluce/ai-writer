import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { closeProjectDatabase, initProjectDatabase } from '../../database'
import { BlueprintRepository } from '../../repositories/blueprint-repository'
import { DraftRepository } from '../../repositories/draft-repository'
import { toolResultText } from '../source-freshness'
import { buildToolsForAssistantType } from '../tool-builder'
import type { BlueprintData } from '../../../src/shared/blueprint'

let projectRoot = ''

function blueprint(title: string): BlueprintData {
  return {
    chapterNumber: 1,
    title,
    role: '开端',
    purpose: '交代主角入局。',
    keyEvents: '主角在危楼醒来。',
    characters: ['陆沉'],
    suspenseHook: '门外传来脚步声。',
    userGuidance: '',
    notes: '',
    notesUpdatedAt: '',
  }
}

/** 渲染层在真实运行时负责落盘局部替换；测试里只要确认它接受了请求。 */
const rendererAction = (action: { type: string }) => (
  action.type === 'replace_draft_excerpt' ? { ok: true, summary: '已替换正文片段。' } : undefined
)

function writerTools() {
  const tools = buildToolsForAssistantType('writer', 'zh-CN', rendererAction as never)
  return {
    readBlueprint: tools.find(tool => tool.name === 'read_blueprint')!,
    drafts: tools.find(tool => tool.name === 'manage_drafts')!,
  }
}

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-novel-freshness-'))
  initProjectDatabase(projectRoot)
})

afterEach(() => {
  closeProjectDatabase()
  fs.rmSync(projectRoot, { recursive: true, force: true })
})

describe('writer draft writes against stale sources (end to end)', () => {
  it('refuses a write whose blueprint changed after the read, and keeps no draft', async () => {
    BlueprintRepository.upsert(blueprint('旧标题'))
    const { readBlueprint, drafts } = writerTools()

    await readBlueprint.execute('read-1', { chapter_number: 1 } as never)
    BlueprintRepository.upsert(blueprint('改后的标题'))

    const refused = await drafts.execute('write-1', {
      action: 'write',
      chapter_number: 1,
      content: '陆沉在危楼醒来，门外传来脚步声。',
    } as never)

    expect(toolResultText(refused)).toContain('写入被拒绝：源信息已变更')
    expect(toolResultText(refused)).toContain('第 1 章蓝图')
    expect(DraftRepository.listByChapter(1)).toHaveLength(0)
  })

  it('refuses a write when the blueprint was never read this turn', async () => {
    BlueprintRepository.upsert(blueprint('旧标题'))
    const { drafts } = writerTools()

    const refused = await drafts.execute('write-1', {
      action: 'write',
      chapter_number: 1,
      content: '陆沉在危楼醒来。',
    } as never)

    expect(toolResultText(refused)).toContain('写入被拒绝：缺少必要的源信息读取')
    expect(DraftRepository.listByChapter(1)).toHaveLength(0)
  })

  it('persists the draft once the blueprint has been read from the current state', async () => {
    BlueprintRepository.upsert(blueprint('改后的标题'))
    const { readBlueprint, drafts } = writerTools()

    await readBlueprint.execute('read-1', { chapter_number: 1 } as never)
    const written = await drafts.execute('write-1', {
      action: 'write',
      chapter_number: 1,
      content: '陆沉在危楼醒来，门外传来脚步声。',
    } as never)

    expect(toolResultText(written)).toContain('已成功为第 1 章生成新草稿')
    expect(DraftRepository.listByChapter(1)).toHaveLength(1)
  })

  it('lets the writer revise its own draft again without a new external change', async () => {
    BlueprintRepository.upsert(blueprint('标题'))
    const { readBlueprint, drafts } = writerTools()

    await readBlueprint.execute('read-1', { chapter_number: 1 } as never)
    await drafts.execute('write-1', {
      action: 'write',
      chapter_number: 1,
      content: '第一版正文。',
    } as never)

    const revised = await drafts.execute('write-2', {
      action: 'replace_excerpt',
      chapter_number: 1,
      old_text: '第一版正文。',
      new_text: '第二版正文。',
    } as never)

    expect(toolResultText(revised)).toContain('已替换')
    expect(DraftRepository.listByChapter(1)).toHaveLength(1)
    expect(DraftRepository.getLatestByChapter(1)?.wordCount).toBeGreaterThan(0)
  })
})
