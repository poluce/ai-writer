/**
 * 章节蓝图解析与提交 — 从 LLM 文本响应解码蓝图并提交数据库的叶子模块。
 *
 * 从 directory-workflow 拆出：directory 命令与工作流编排都会消费这些函数；
 * 独立成模块后命令只依赖本文件，不再形成 command <-> workflow 的运行时环。
 */

import type { ProjectSessionContext } from '../../shared/ipc-channels'
import { globalEventBus } from '../../shared/event-bus'
import {
  decodeBlueprintSemanticPayload,
  parseBlueprintSemanticResponseText,
  type BlueprintSemanticItem,
} from '../../shared/blueprint-semantic-contract'
import { structuredContractDiagnostic } from '../../shared/structured-contract-diagnostic'
import { ipc } from '../ipc-client'
import type { BlueprintData } from '../../shared/blueprint'
import type {
  BlueprintRangeCommitMode,
  BlueprintRangeCommitReceipt,
} from '../../shared/contracts/blueprint-commit'

/** 与 directory-workflow 的 ChapterBlueprint 同源的蓝图类型。 */
type ChapterBlueprint = BlueprintData

function extractJsonPayload(content: string): string | null {
  const trimmed = content.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed)
  const candidate = fenced ? fenced[1].trim() : trimmed
  try {
    JSON.parse(candidate)
    return candidate
  } catch {
    return null
  }
}

function persistedBlueprint(item: BlueprintSemanticItem): ChapterBlueprint {
  return {
    ...item,
    userGuidance: '',
    notes: '',
    notesUpdatedAt: '',
  }
}

function chapterRange(startNum: number, endNum: number): number[] {
  return Array.from({ length: endNum - startNum + 1 }, (_, index) => startNum + index)
}

export function parseTextBlueprints(content: string, startNum: number, endNum: number): ChapterBlueprint[] {
  try {
    const payload = extractJsonPayload(content)
    if (!payload) return []
    const parsed: unknown = JSON.parse(payload)
    const candidates = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'blueprints' in parsed
      ? (parsed as { blueprints: unknown }).blueprints
      : parsed
    if (!Array.isArray(candidates)) return []
    const expected = candidates.flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
      const raw = candidate as Record<string, unknown>
      const chapter = Number(raw.chapterNumber ?? raw.chapter_number)
      return Number.isSafeInteger(chapter) && chapter >= startNum && chapter <= endNum ? [chapter] : []
    })
    if (expected.length === 0 || new Set(expected).size !== expected.length) return []
    const filtered = candidates.filter((candidate) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false
      const raw = candidate as Record<string, unknown>
      return expected.includes(Number(raw.chapterNumber ?? raw.chapter_number))
    })
    return decodeBlueprintSemanticPayload(filtered, expected).map(persistedBlueprint)
  } catch {
    console.error('Failed to parse blueprint JSON', content)
  }

  return []
}

export function parseTextBlueprintsStrict(content: string, startNum: number, endNum: number): ChapterBlueprint[] {
  try {
    return parseBlueprintSemanticResponseText(
      content,
      chapterRange(startNum, endNum),
    ).map(persistedBlueprint)
  } catch (error) {
    if (structuredContractDiagnostic(error)) throw error
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`蓝图 JSON 解析失败：${detail}`)
  }
}

export async function commitDirectoryBlueprintRange(
  blueprints: ChapterBlueprint[],
  expectedProjectPath: string,
  range: { mode: BlueprintRangeCommitMode; startChapter: number; endChapter: number },
  operationId: string,
  projectSession: ProjectSessionContext,
): Promise<BlueprintRangeCommitReceipt> {
  const result = await ipc.invokeWithProjectSession(
    projectSession,
    'db:blueprint-commit-range',
    {
      mode: range.mode,
      operationId,
      startChapter: range.startChapter,
      endChapter: range.endChapter,
      blueprints,
    },
    expectedProjectPath,
  )
  if (!result.success || !result.receipt) {
    throw new Error(result.error || '提交章节蓝图失败')
  }
  globalEventBus.emit('REFRESH_RESOURCE', {
    resources: ['blueprints'],
    projectPath: expectedProjectPath,
    projectSession,
  })
  return result.receipt
}