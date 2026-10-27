import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { closeProjectDatabase, initProjectDatabase } from '../../../database'
import { FinalizedDraftImportRepository } from '../../../repositories/finalized-draft-import-repository'
import { NarrativeThreadRepository } from '../../../repositories/narrative-thread-repository'
import { countDraftUnits } from '../../../../src/shared/draft-units'
import { createReadNarrativeThreadsTool } from '../read-narrative-threads.tool'

let projectRoot = ''

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0]
  if (!first || first.type !== 'text' || typeof first.text !== 'string') {
    throw new Error('expected text content')
  }
  return first.text
}

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-thread-tool-'))
  initProjectDatabase(projectRoot)
})

afterEach(() => {
  closeProjectDatabase()
  fs.rmSync(projectRoot, { recursive: true, force: true })
})

describe('read_narrative_threads', () => {
  it('reads planned threads and confirmed events with status and evidence', async () => {
    const plan = NarrativeThreadRepository.createPlan({
      title: '旧码头的钥匙',
      type: '伏笔',
      targetStartChapter: 1,
      targetEndChapter: 3,
      authorIntent: '第三章打开仓库。',
    })
    NarrativeThreadRepository.createPlan({
      title: '失踪的航海日志',
      type: '支线',
      targetStartChapter: 2,
      targetEndChapter: 8,
      authorIntent: '第八章揭示日志由谁伪造。',
    })

    const finalized = FinalizedDraftImportRepository.commit(projectRoot, {
      operationId: 'thread-tool-source',
      chapters: [
        { chapterNumber: 1, title: '旧码头', content: '林岚捡到钥匙。', wordCount: countDraftUnits('林岚捡到钥匙。') },
      ],
    })
    NarrativeThreadRepository.confirmEvent({
      planId: plan.id,
      draftId: finalized.drafts[0]!.draftId,
      type: 'planted',
      evidence: '林岚捡到钥匙。',
      reason: '埋设钥匙来源。',
    })

    const tool = createReadNarrativeThreadsTool('zh-CN')
    const result = await tool.execute('c1', {})
    const body = textOf(result)

    expect(body).toContain('叙事线索（共 2 条；进行中 2 条；逾期 0 条）')
    expect(body).toContain('旧码头的钥匙 [伏笔] · 已埋设')
    expect(body).toContain('目标章节：第 1–3 章')
    expect(body).toContain('作者意图：第三章打开仓库。')
    expect(body).toContain('已确认事件：')
    expect(body).toContain('第 1 章【埋设】「林岚捡到钥匙。」— 埋设钥匙来源。')
    expect(body).toContain('失踪的航海日志 [支线] · 已计划')
    expect(result.details).toEqual({ threads: 2, events: 1 })
  })

  it('filters active threads and can omit confirmed events', async () => {
    NarrativeThreadRepository.createPlan({
      title: '旧码头的钥匙',
      type: '伏笔',
      targetStartChapter: 1,
      targetEndChapter: 3,
      authorIntent: '第三章打开仓库。',
    })
    NarrativeThreadRepository.createPlan({
      title: '失踪的航海日志',
      type: '支线',
      targetStartChapter: 2,
      targetEndChapter: 8,
      authorIntent: '第八章揭示日志由谁伪造。',
    })

    const tool = createReadNarrativeThreadsTool('zh-CN')
    const active = await tool.execute('c1', { status: 'active', include_events: false })
    expect(textOf(active)).toContain('旧码头的钥匙')
    expect(textOf(active)).toContain('失踪的航海日志')
    expect(textOf(active)).not.toContain('已确认事件：')

    const empty = await tool.execute('c2', { status: 'resolved' })
    expect(textOf(empty)).toContain('当前项目还没有叙事线索记录')
  })

  it('tells the assistant when the project has no threads yet', async () => {
    const tool = createReadNarrativeThreadsTool('en-US')
    const result = await tool.execute('c1', {})
    expect(textOf(result)).toContain('no narrative threads yet')
    expect(result.details).toEqual({ threads: 0, events: 0 })
  })
})
