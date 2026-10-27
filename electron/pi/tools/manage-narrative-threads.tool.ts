import type { AgentTool } from '@earendil-works/pi-agent-core'
import { StringEnum, Type } from '@earendil-works/pi-ai'

import { getCurrentProjectPath, getProjectDb } from '../../database'
import { NarrativeThreadRepository } from '../../repositories/narrative-thread-repository'
import {
  writingLanguageText,
  type WritingLanguage,
} from '../../../src/shared/writing-language'

export const NARRATIVE_THREAD_ACTIONS = [
  'create_plan',
  'update_plan',
  'delete_plan',
  'confirm_event',
] as const

export const NARRATIVE_EVENT_TYPES = ['planted', 'progressing', 'resolved', 'abandoned'] as const

type NarrativeThreadAction = (typeof NARRATIVE_THREAD_ACTIONS)[number]
type NarrativeEventType = (typeof NARRATIVE_EVENT_TYPES)[number]

function resolveAction(raw: string): NarrativeThreadAction {
  if (raw === 'create_plan' || raw === '新建计划' || raw === '新增线索') return 'create_plan'
  if (raw === 'update_plan' || raw === '修改计划' || raw === '更新线索') return 'update_plan'
  if (raw === 'delete_plan' || raw === '删除计划' || raw === '删除线索') return 'delete_plan'
  if (raw === 'confirm_event' || raw === '确认事件' || raw === '记录事件') return 'confirm_event'
  return 'create_plan'
}

const Schema = Type.Object({
  action: StringEnum(NARRATIVE_THREAD_ACTIONS, {
    description: 'Operation: "create_plan", "update_plan", "delete_plan", or "confirm_event". Use read_narrative_threads to inspect existing threads first.',
  }),
  thread_id: Type.Optional(Type.Integer({
    minimum: 1,
    description: 'Target narrative thread ID. Required for update_plan, delete_plan, and confirm_event.',
  })),
  title: Type.Optional(Type.String({
    description: 'Thread title (required for create_plan).',
  })),
  type: Type.Optional(Type.String({
    description: 'Thread type, for example 伏笔, 支线, 长期承诺 (required for create_plan).',
  })),
  target_start_chapter: Type.Optional(Type.Integer({
    minimum: 1,
    description: 'First chapter the thread is expected to cover (required for create_plan).',
  })),
  target_end_chapter: Type.Optional(Type.Integer({
    minimum: 1,
    description: 'Last chapter by which the thread should be resolved (required for create_plan).',
  })),
  author_intent: Type.Optional(Type.String({
    description: 'The author intent: what this thread should accomplish (required for create_plan).',
  })),
  draft_id: Type.Optional(Type.Integer({
    minimum: 1,
    description: 'Finalized draft ID that provides the evidence for confirm_event.',
  })),
  event_type: Type.Optional(StringEnum(NARRATIVE_EVENT_TYPES, {
    description: 'Event type for confirm_event: "planted", "progressing", "resolved", or "abandoned".',
  })),
  evidence: Type.Optional(Type.String({
    description: 'Short verbatim excerpt copied from the finalized draft (required for confirm_event).',
  })),
  reason: Type.Optional(Type.String({
    description: 'Why this event matters for the thread (optional for confirm_event).',
  })),
})

/** 管理叙事线索计划与已确认事件；事件证据必须来自已定稿正文。 */
export function createManageNarrativeThreadsTool(
  language: WritingLanguage,
): AgentTool<typeof Schema, Record<string, unknown>> {
  const isEn = language === 'en-US'
  const text = (zhCN: string, enUS: string) => writingLanguageText(language, zhCN, enUS)
  const description = isEn
    ? 'Create, update, or delete narrative thread plans (foreshadowing and subplots), and confirm planted/progressing/resolved/abandoned events from finalized chapter text. Read existing threads with read_narrative_threads first; confirmed events must quote the finalized draft verbatim.'
    : '创建、修改或删除叙事线索计划（伏笔/支线），并基于已定稿正文确认埋设、推进、回收或放弃事件。修改前先用 read_narrative_threads 查看现有线索；确认事件必须引用定稿正文里的原文证据。'

  return {
    name: 'manage_narrative_threads',
    label: 'Manage Narrative Threads',
    description,
    parameters: Schema,
    isWriteOperation: () => true,
    execute: async (_id, params) => {
      if (!getCurrentProjectPath() || !getProjectDb()) {
        throw new Error(text('未打开小说项目', 'No novel project is currently open'))
      }

      const action = resolveAction(String(params.action ?? 'create_plan').toLowerCase().trim())

      if (action === 'create_plan') {
        const title = params.title?.trim() ?? ''
        const type = params.type?.trim() ?? ''
        const authorIntent = params.author_intent?.trim() ?? ''
        const start = params.target_start_chapter
        const end = params.target_end_chapter
        if (!title || !type || !authorIntent || !Number.isInteger(start) || !Number.isInteger(end)) {
          throw new Error(text(
            '创建叙事线索需要 title、type、author_intent、target_start_chapter、target_end_chapter。',
            'Creating a thread requires title, type, author_intent, target_start_chapter, and target_end_chapter.',
          ))
        }
        if (start! < 1 || end! < start!) {
          throw new Error(text('目标章节范围无效：结束章必须不早于开始章。', 'Invalid target chapter range: the end chapter must not be before the start chapter.'))
        }
        const created = NarrativeThreadRepository.createPlan({
          title,
          type,
          targetStartChapter: start!,
          targetEndChapter: end!,
          authorIntent,
        })
        return {
          content: [{
            type: 'text',
            text: text(
              `已创建叙事线索 #${created.id}「${created.title}」[${created.type}]，目标第 ${created.targetStartChapter}–${created.targetEndChapter} 章。`,
              `Created narrative thread #${created.id} "${created.title}" [${created.type}], targeting Chapters ${created.targetStartChapter}-${created.targetEndChapter}.`,
            ),
          }],
          details: { action, thread: created },
        }
      }

      const threadId = params.thread_id
      if (!Number.isInteger(threadId) || (threadId ?? 0) < 1) {
        throw new Error(text('该操作需要正整数 thread_id。', 'This operation requires a positive thread_id.'))
      }

      if (action === 'update_plan') {
        const existing = NarrativeThreadRepository.getPlan(threadId!)
        if (!existing) {
          throw new Error(text(`叙事线索 #${threadId} 不存在。`, `Narrative thread #${threadId} does not exist.`))
        }
        const start = params.target_start_chapter ?? existing.targetStartChapter
        const end = params.target_end_chapter ?? existing.targetEndChapter
        if (start < 1 || end < start) {
          throw new Error(text('目标章节范围无效：结束章必须不早于开始章。', 'Invalid target chapter range: the end chapter must not be before the start chapter.'))
        }
        const updated = NarrativeThreadRepository.updatePlan(threadId!, {
          title: params.title?.trim() || existing.title,
          type: params.type?.trim() || existing.type,
          targetStartChapter: start,
          targetEndChapter: end,
          authorIntent: params.author_intent?.trim() || existing.authorIntent,
        })
        return {
          content: [{
            type: 'text',
            text: text(
              `已更新叙事线索 #${updated.id}「${updated.title}」，目标第 ${updated.targetStartChapter}–${updated.targetEndChapter} 章。`,
              `Updated narrative thread #${updated.id} "${updated.title}", targeting Chapters ${updated.targetStartChapter}-${updated.targetEndChapter}.`,
            ),
          }],
          details: { action, thread: updated },
        }
      }

      if (action === 'delete_plan') {
        const existing = NarrativeThreadRepository.getPlan(threadId!)
        if (!existing) {
          throw new Error(text(`叙事线索 #${threadId} 不存在。`, `Narrative thread #${threadId} does not exist.`))
        }
        NarrativeThreadRepository.deletePlan(threadId!)
        return {
          content: [{
            type: 'text',
            text: text(
              `已删除叙事线索 #${threadId}「${existing.title}」，它的确认事件一并移除。`,
              `Deleted narrative thread #${threadId} "${existing.title}"; its confirmed events were removed too.`,
            ),
          }],
          details: { action, threadId },
        }
      }

      const draftId = params.draft_id
      const eventType = params.event_type
      const evidence = params.evidence?.trim() ?? ''
      if (!Number.isInteger(draftId) || (draftId ?? 0) < 1 || !eventType || !evidence) {
        throw new Error(text(
          '确认事件需要 thread_id、已定稿的 draft_id、event_type 与 evidence。',
          'Confirming an event requires thread_id, a finalized draft_id, event_type, and evidence.',
        ))
      }
      try {
        const event = NarrativeThreadRepository.confirmEvent({
          planId: threadId!,
          draftId: draftId!,
          type: eventType as NarrativeEventType,
          evidence,
          reason: params.reason?.trim() ?? '',
        })
        return {
          content: [{
            type: 'text',
            text: text(
              `已记录叙事线索 #${threadId} 的事件：第 ${event.chapterNumber} 章 ${event.chapterTitle}【${eventType}】「${event.evidence}」。`,
              `Recorded an event for narrative thread #${threadId}: Chapter ${event.chapterNumber} ${event.chapterTitle} [${eventType}] "${event.evidence}".`,
            ),
          }],
          details: { action, event },
        }
      } catch (error) {
        throw new Error(text(
          `无法确认线索事件：${error instanceof Error ? error.message : '未知错误'}`,
          'Could not confirm the thread event. The draft must be finalized and the evidence must quote its final text verbatim.',
        ))
      }
    },
  }
}
