import type { AgentTool } from '@earendil-works/pi-agent-core'
import { Type } from '@earendil-works/pi-ai'

import { getCurrentProjectPath } from '../../database'
import { SummaryRepository } from '../../repositories/summary-repository'
import type { FinalizedContinuityProjection } from '../../../src/shared/finalized-continuity'
import {
  writingLanguageText,
  type WritingLanguage,
} from '../../../src/shared/writing-language'

const Schema = Type.Object({
  before_chapter: Type.Integer({
    minimum: 2,
    description: '章节号；只返回该章之前已定稿的连续性事实（当前章及之后属于计划，不是既成事实）。',
  }),
  limit: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: 20,
    description: '最多返回最近的多少章（默认 6 章）。',
  })),
})

/** 审稿助手核对连续性所需的最小事实面：已定稿章节要点 + 结构化事实。 */
export function createReadContinuityFactsTool(
  language: WritingLanguage,
): AgentTool<typeof Schema, { chapters: number; facts: number }> {
  const text = (zhCN: string, enUS: string) => writingLanguageText(language, zhCN, enUS)

  return {
    name: 'read_continuity_facts',
    label: 'Read Continuity Facts',
    description: language === 'en-US'
      ? 'Read finalized continuity facts before a chapter: chapter notes plus structured facts (character state, items, relationships, and continuity) generated when earlier chapters were finalized. This is the only source of events that have already happened; blueprints are plans, not history. Defaults to the latest 6 finalized chapters.'
      : '读取某一章之前已定稿的连续性事实：各章要点，以及定稿时抽取的结构化事实（角色状态、关键道具、人物关系、连续性事件）。这是"已经发生过的事实"的唯一来源；蓝图只是计划而不是历史。默认返回最近 6 章。',
    parameters: Schema,
    execute: async (_id, params) => {
      if (!getCurrentProjectPath()) {
        throw new Error(text('未打开小说项目', 'No novel project is currently open'))
      }

      const limit = params.limit ?? 6
      const projections = SummaryRepository.listFinalizedContinuityBefore(params.before_chapter)
      if (projections.length === 0) {
        return {
          content: [{
            type: 'text',
            text: text(
              `第 ${params.before_chapter} 章之前没有已定稿章节；本章之前尚无既成事实。`,
              `No finalized chapters exist before Chapter ${params.before_chapter}; there is no established history yet.`,
            ),
          }],
          details: { chapters: 0, facts: 0 },
        }
      }

      const shown = projections.slice(-limit)
      let factCount = 0
      const sections = shown.map((projection) => formatProjection(projection, text, () => {
        factCount += 1
      }))
      const omitted = projections.length - shown.length

      const header = text(
        `## 已定稿连续性事实（第 ${shown[0]?.chapterNumber ?? 1}–${shown[shown.length - 1]?.chapterNumber ?? params.before_chapter - 1} 章，共 ${projections.length} 章已定稿）`,
        `## Finalized continuity facts (Chapters ${shown[0]?.chapterNumber ?? 1}-${shown[shown.length - 1]?.chapterNumber ?? params.before_chapter - 1}; ${projections.length} finalized chapters)`,
      )
      const omittedNote = omitted > 0
        ? text(
          `\n（仅展示最近 ${shown.length} 章，另有 ${omitted} 章更早的定稿未列出）`,
          `\n(Only the latest ${shown.length} chapters are shown; ${omitted} earlier finalized chapters are omitted)`,
        )
        : ''

      return {
        content: [{
          type: 'text',
          text: `${header}\n\n${sections.join('\n\n')}${omittedNote}`,
        }],
        details: { chapters: shown.length, facts: factCount },
      }
    },
  }
}

function formatProjection(
  projection: FinalizedContinuityProjection,
  text: (zhCN: string, enUS: string) => string,
  onFact: () => void,
): string {
  const lines: string[] = [
    text(
      `### 第${projection.chapterNumber}章 ${projection.chapterTitle || ''}`.trim(),
      `### Chapter ${projection.chapterNumber} ${projection.chapterTitle || ''}`.trim(),
    ),
  ]
  if (projection.chapterNotes?.trim()) {
    lines.push(text('章节要点：', 'Chapter notes: ') + projection.chapterNotes.trim())
  }
  for (const fact of projection.facts ?? []) {
    onFact()
    lines.push(text(
      `- [${fact.category}] ${fact.statement}（来源：第${fact.sourceChapter}章；证据：${fact.evidence}）`,
      `- [${fact.category}] ${fact.statement} (source: Chapter ${fact.sourceChapter}; evidence: ${fact.evidence})`,
    ))
  }
  return lines.join('\n')
}
