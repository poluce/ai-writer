import type { AgentTool } from '@earendil-works/pi-agent-core'
import { StringEnum, Type } from '@earendil-works/pi-ai'

import { getCurrentProjectPath, getProjectDb } from '../../database'
import { NarrativeThreadRepository } from '../../repositories/narrative-thread-repository'
import type { NarrativeThreadStatus, NarrativeThreadView } from '../../../src/shared/narrative-thread'
import {
  writingLanguageText,
  type WritingLanguage,
} from '../../../src/shared/writing-language'

const THREAD_FILTERS = ['all', 'active', 'resolved', 'abandoned'] as const
type ThreadFilter = (typeof THREAD_FILTERS)[number]

const Schema = Type.Object({
  status: Type.Optional(StringEnum(THREAD_FILTERS, {
    description: 'Filter: "all" (default), "active" (planned or in progress), "resolved", or "abandoned".',
  })),
  include_events: Type.Optional(Type.Boolean({
    description: 'Whether to include confirmed per-chapter events (default true).',
  })),
  limit: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: 100,
    description: 'Maximum number of threads to return (default 50).',
  })),
})

function statusLabel(status: NarrativeThreadStatus, isEn: boolean): string {
  switch (status) {
    case 'planned': return isEn ? 'Planned' : '已计划'
    case 'planted': return isEn ? 'Planted' : '已埋设'
    case 'progressing': return isEn ? 'In progress' : '推进中'
    case 'resolved': return isEn ? 'Resolved' : '已回收'
    case 'abandoned': return isEn ? 'Abandoned' : '已放弃'
    default: return status
  }
}

function eventTypeLabel(type: string, isEn: boolean): string {
  switch (type) {
    case 'planted': return isEn ? 'planted' : '埋设'
    case 'progressing': return isEn ? 'progressing' : '推进'
    case 'resolved': return isEn ? 'resolved' : '回收'
    case 'abandoned': return isEn ? 'abandoned' : '放弃'
    default: return type
  }
}

function matchesFilter(thread: NarrativeThreadView, filter: ThreadFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'active') return thread.status !== 'resolved' && thread.status !== 'abandoned'
  return thread.status === filter
}

/** 读作者规划的叙事线索（伏笔/支线）及定稿时确认的埋设、推进、回收事件。 */
export function createReadNarrativeThreadsTool(
  language: WritingLanguage,
): AgentTool<typeof Schema, { threads: number; events: number }> {
  const isEn = language === 'en-US'
  const text = (zhCN: string, enUS: string) => writingLanguageText(language, zhCN, enUS)
  const description = isEn
    ? 'Read the author\'s narrative threads (foreshadowing and subplots): planned intent, target chapter range, current status, and confirmed chapter events. Use before planning or reviewing chapters so planted, progressing, dangling, and resolved threads stay consistent.'
    : '读取作者规划的叙事线索（伏笔/支线）：计划意图、目标章节范围、当前状态，以及已定稿章节里确认的埋设、推进、回收、放弃事件。规划章节或审稿前用它核对伏笔是否已埋、是否该推进、是否逾期未回收，避免剧情线断裂。'

  return {
    name: 'read_narrative_threads',
    label: 'Read Narrative Threads',
    description,
    parameters: Schema,
    execute: async (_id, params) => {
      if (!getCurrentProjectPath() || !getProjectDb()) {
        throw new Error(text('未打开小说项目', 'No novel project is currently open'))
      }

      const filter: ThreadFilter = params.status ?? 'all'
      const includeEvents = params.include_events ?? true
      const limit = params.limit ?? 50
      const allThreads = NarrativeThreadRepository.list()
      const threads = allThreads.filter(thread => matchesFilter(thread, filter))
      const shown = threads.slice(0, limit)

      if (shown.length === 0) {
        return {
          content: [{
            type: 'text',
            text: text(
              '当前项目还没有叙事线索记录。可以在「叙事线」面板里添加伏笔/支线计划，定稿后再确认埋设与回收事件。',
              'This project has no narrative threads yet. Add foreshadowing or subplot plans in the Narrative Threads panel, then confirm planting and resolution events after chapters are finalized.',
            ),
          }],
          details: { threads: 0, events: 0 },
        }
      }

      const activeCount = allThreads.filter(thread => matchesFilter(thread, 'active')).length
      const overdueCount = allThreads.filter(thread => thread.overdue).length
      const lines: string[] = [
        text(
          `## 叙事线索（共 ${allThreads.length} 条；进行中 ${activeCount} 条；逾期 ${overdueCount} 条）`,
          `## Narrative threads (${allThreads.length} total; ${activeCount} active; ${overdueCount} overdue)`,
        ),
      ]
      let eventCount = 0

      shown.forEach((thread, index) => {
        lines.push('')
        lines.push(text(
          `### ${index + 1}. ${thread.title} [${thread.type}] · ${statusLabel(thread.status, isEn)}`,
          `### ${index + 1}. ${thread.title} [${thread.type}] · ${statusLabel(thread.status, isEn)}`,
        ))
        lines.push(text(
          `目标章节：第 ${thread.targetStartChapter}–${thread.targetEndChapter} 章`,
          `Target chapters: ${thread.targetStartChapter}-${thread.targetEndChapter}`,
        ))
        lines.push(text(`作者意图：${thread.authorIntent}`, `Author intent: ${thread.authorIntent}`))
        if (thread.overdue) {
          lines.push(text('状态：已超过目标结束章节但尚未回收，需要确认后续安排。', 'Status: past its target end chapter and not resolved; decide how to continue it.'))
        } else if (thread.dormantChapters > 0) {
          lines.push(text(`已连续 ${thread.dormantChapters} 章未推进。`, `No progress for ${thread.dormantChapters} chapter(s).`))
        }
        if (includeEvents) {
          if (thread.events.length === 0) {
            lines.push(text('已确认事件：暂无（尚未在定稿章节中埋设或推进）。', 'Confirmed events: none yet.'))
          } else {
            lines.push(text('已确认事件：', 'Confirmed events:'))
            for (const event of thread.events) {
              eventCount += 1
              lines.push(text(
                `- 第 ${event.chapterNumber} 章【${eventTypeLabel(event.type, isEn)}】「${event.evidence}」— ${event.reason}`,
                `- Chapter ${event.chapterNumber} [${eventTypeLabel(event.type, isEn)}] "${event.evidence}" — ${event.reason}`,
              ))
            }
          }
        }
      })

      if (threads.length > shown.length) {
        lines.push('')
        lines.push(text(
          `（共 ${threads.length} 条符合筛选，仅展示前 ${shown.length} 条）`,
          `(${threads.length} threads match the filter; showing the first ${shown.length})`,
        ))
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        details: { threads: shown.length, events: eventCount },
      }
    },
  }
}
