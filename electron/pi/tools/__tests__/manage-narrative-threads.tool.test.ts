import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { closeProjectDatabase, initProjectDatabase } from '../../../database'
import { FinalizedDraftImportRepository } from '../../../repositories/finalized-draft-import-repository'
import { NarrativeThreadRepository } from '../../../repositories/narrative-thread-repository'
import { countDraftUnits } from '../../../../src/shared/draft-units'
import { createManageNarrativeThreadsTool } from '../manage-narrative-threads.tool'

let projectRoot = ''

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0]
  if (!first || first.type !== 'text' || typeof first.text !== 'string') {
    throw new Error('expected text content')
  }
  return first.text
}

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-thread-manage-'))
  initProjectDatabase(projectRoot)
})

afterEach(() => {
  closeProjectDatabase()
  fs.rmSync(projectRoot, { recursive: true, force: true })
})

describe('manage_narrative_threads', () => {
  it('creates, updates, and deletes a thread plan', async () => {
    const tool = createManageNarrativeThreadsTool('zh-CN')

    const created = await tool.execute('c1', {
      action: 'create_plan',
      title: '旧码头的钥匙',
      type: '伏笔',
      target_start_chapter: 1,
      target_end_chapter: 3,
      author_intent: '第三章打开仓库。',
    })
    expect(textOf(created)).toContain('已创建叙事线索')
    expect(created.details).toMatchObject({ action: 'create_plan', thread: { title: '旧码头的钥匙' } })
    const createdThread = (created.details as { thread: { id: number } }).thread
    expect(NarrativeThreadRepository.list()).toHaveLength(1)

    const updated = await tool.execute('c2', {
      action: 'update_plan',
      thread_id: createdThread.id,
      title: '被篡改的航海日志',
      target_end_chapter: 9,
    })
    expect(textOf(updated)).toContain('已更新叙事线索')
    expect(NarrativeThreadRepository.getPlan(createdThread.id)).toMatchObject({
      title: '被篡改的航海日志',
      targetStartChapter: 1,
      targetEndChapter: 9,
      authorIntent: '第三章打开仓库。',
    })

    const deleted = await tool.execute('c3', { action: 'delete_plan', thread_id: createdThread.id })
    expect(textOf(deleted)).toContain('已删除叙事线索')
    expect(NarrativeThreadRepository.list()).toHaveLength(0)
  })

  it('confirms an event against a finalized chapter and its verbatim evidence', async () => {
    const plan = NarrativeThreadRepository.createPlan({
      title: '旧码头的钥匙',
      type: '伏笔',
      targetStartChapter: 1,
      targetEndChapter: 3,
      authorIntent: '第三章打开仓库。',
    })
    const finalized = FinalizedDraftImportRepository.commit(projectRoot, {
      operationId: 'thread-manage-source',
      chapters: [
        { chapterNumber: 1, title: '旧码头', content: '林岚捡到钥匙。', wordCount: countDraftUnits('林岚捡到钥匙。') },
      ],
    })
    const tool = createManageNarrativeThreadsTool('zh-CN')
    const result = await tool.execute('c1', {
      action: 'confirm_event',
      thread_id: plan.id,
      draft_id: finalized.drafts[0]!.draftId,
      event_type: 'planted',
      evidence: '林岚捡到钥匙。',
      reason: '埋设钥匙来源。',
    })

    expect(textOf(result)).toContain('已记录叙事线索')
    expect(textOf(result)).toContain('第 1 章 旧码头【planted】')
    expect(result.details).toMatchObject({ action: 'confirm_event', event: { type: 'planted', chapterNumber: 1 } })
    expect(NarrativeThreadRepository.list()[0]?.events).toHaveLength(1)
  })

  it('rejects evidence that is not in the finalized chapter', async () => {
    const plan = NarrativeThreadRepository.createPlan({
      title: '旧码头的钥匙',
      type: '伏笔',
      targetStartChapter: 1,
      targetEndChapter: 3,
      authorIntent: '第三章打开仓库。',
    })
    const finalized = FinalizedDraftImportRepository.commit(projectRoot, {
      operationId: 'thread-manage-evidence',
      chapters: [
        { chapterNumber: 1, title: '旧码头', content: '林岚捡到钥匙。', wordCount: countDraftUnits('林岚捡到钥匙。') },
      ],
    })
    const tool = createManageNarrativeThreadsTool('zh-CN')
    await expect(tool.execute('c1', {
      action: 'confirm_event',
      thread_id: plan.id,
      draft_id: finalized.drafts[0]!.draftId,
      event_type: 'planted',
      evidence: '不存在的句子。',
    })).rejects.toThrow('无法确认线索事件')
  })

  it('requires the create fields before writing', async () => {
    const tool = createManageNarrativeThreadsTool('zh-CN')
    await expect(tool.execute('c1', { action: 'create_plan', title: '只有标题' }))
      .rejects.toThrow('创建叙事线索需要')
    expect(NarrativeThreadRepository.list()).toEqual([])
  })
})
