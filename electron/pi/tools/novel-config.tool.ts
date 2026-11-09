import type { AgentTool } from '@earendil-works/pi-agent-core'
import { Type, StringEnum } from '@earendil-works/pi-ai'

import { ProjectCoreRepository } from '../../repositories/project-core-repository'
import type { RendererActionSink } from '../renderer-action'
import {
  buildNovelConfigProposal,
  type ProposalText,
} from '../../../src/shared/domain-proposals'
import type { NovelConfig } from '../../../src/shared/ipc-channels'
import { isGoldenFingerEnabled } from '../../../src/shared/novel-config-generation'
import {
  writingLanguageText,
  type WritingLanguage,
} from '../../../src/shared/writing-language'

const Action = StringEnum(['read', 'update'] as const, {
  description: 'Operation mode: "read" to inspect existing settings (default), "update" to fill or modify settings',
})

const Field = StringEnum([
  'all',
  'basic_info',
  'coreOutline',
  'worldSetting',
  'goldenFinger',
  'protagonistProfile',
  'globalGuidance',
  'writingStyle',
  'referenceWorks',
] as const, {
  description: 'Configuration field name: "all" (default), "basic_info", "coreOutline", "worldSetting", "goldenFinger", "protagonistProfile", "globalGuidance", "writingStyle", or "referenceWorks"',
})

const PlotStructureEnum = StringEnum([
  'three_act',
  'heros_journey',
  'save_the_cat',
  'kishotenketsu',
  'multi_thread',
  'freeform',
] as const, { description: 'Story structure framework: "three_act", "heros_journey", "save_the_cat", "kishotenketsu", "multi_thread", or "freeform"' })

const NarrativePovEnum = StringEnum([
  'third_limited',
  'first_person',
  'third_omniscient',
  'multi_pov',
] as const, { description: 'Narrative point of view: "third_limited", "first_person", "third_omniscient", or "multi_pov"' })

const Schema = Type.Object({
  action: Type.Optional(Action),
  field: Type.Optional(Field),
  coreOutline: Type.Optional(Type.String({ description: 'Full-text core outline: central conflict, main plot chain, and beginning-to-climax overview' })),
  worldSetting: Type.Optional(Type.String({ description: 'World setting details: era, world rules, hierarchy, and core resources' })),
  goldenFinger: Type.Optional(Type.String({ description: 'Protagonist special advantage / cheat / unique mechanism, usage constraints, and progression path' })),
  needsGoldenFinger: Type.Optional(Type.Boolean({ description: 'Whether the project needs a special advantage at all; false hides the golden-finger section and keeps it out of generation context' })),
  protagonistProfile: Type.Optional(Type.String({ description: 'Protagonist character card: identity, personality, core motivations, weaknesses, and character arc' })),
  genre: Type.Optional(Type.String({ description: 'Primary novel genre (e.g. Fantasy, Sci-Fi, Urban, Mystery, Historical, Cultivation)' })),
  subGenre: Type.Optional(Type.String({ description: 'Subgenre or tropes (e.g. Rebirth, Cyberpunk, Xianxia, System)' })),
  targetAudience: Type.Optional(Type.String({ description: 'Target audience (e.g. male-oriented, female-oriented, general)' })),
  totalChapters: Type.Optional(Type.Integer({ minimum: 1, description: 'Planned total chapter count (positive integer, e.g. 100)' })),
  wordsPerChapter: Type.Optional(Type.Integer({ minimum: 100, description: 'Target word count per chapter (positive integer, default ~3000)' })),
  plotStructure: Type.Optional(PlotStructureEnum),
  narrativePOV: Type.Optional(NarrativePovEnum),
  globalGuidance: Type.Optional(Type.String({ description: 'Long-term stable writing rules, cross-chapter prohibitions, and author guidance' })),
  writingStyle: Type.Optional(Type.String({ description: 'Stylistic instructions: pacing, dialogue tone, and descriptive density' })),
  referenceWorks: Type.Optional(Type.String({ description: 'Titles of mentor works or stylistic references' })),
  content: Type.Optional(Type.String({ description: 'Prose content when updating a single designated field via the "field" parameter' })),
  old_text: Type.Optional(Type.String({ description: 'Targeted snippet replacement: exact original excerpt to replace (for modifying just one paragraph in a long outline/setting without rewriting everything)' })),
  new_text: Type.Optional(Type.String({ description: 'Targeted snippet replacement: replacement excerpt' })),
  changes: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: 'Dictionary of field updates (or pass top-level fields directly)' })),
})

const FIELD_ALIASES: Record<string, string> = {
  all: 'all',
  '全部': 'all',
  basic_info: 'basic_info',
  '基本信息': 'basic_info',
  coreOutline: 'coreOutline',
  core_outline: 'coreOutline',
  '核心大纲': 'coreOutline',
  worldSetting: 'worldSetting',
  world_setting: 'worldSetting',
  '世界观设定': 'worldSetting',
  '世界观': 'worldSetting',
  goldenFinger: 'goldenFinger',
  golden_finger: 'goldenFinger',
  '金手指': 'goldenFinger',
  '核心卖点': 'goldenFinger',
  protagonistProfile: 'protagonistProfile',
  protagonist_profile: 'protagonistProfile',
  '主角人设': 'protagonistProfile',
  '主角设定': 'protagonistProfile',
  globalGuidance: 'globalGuidance',
  global_guidance: 'globalGuidance',
  '创作指导': 'globalGuidance',
  '全局指导': 'globalGuidance',
  writingStyle: 'writingStyle',
  writing_style: 'writingStyle',
  '文风': 'writingStyle',
  '文风配置': 'writingStyle',
  referenceWorks: 'referenceWorks',
  reference_works: 'referenceWorks',
  '参考作品': 'referenceWorks',
}

const FIELD_DISPLAY_NAMES: Record<string, [string, string]> = {
  coreOutline: ['核心大纲', 'Core Outline'],
  worldSetting: ['世界观设定', 'World Setting'],
  goldenFinger: ['金手指 / 核心卖点', 'Golden Finger / Core Advantage'],
  protagonistProfile: ['主角人设', 'Protagonist Profile'],
  globalGuidance: ['全局创作指导', 'Global Guidance'],
  writingStyle: ['文风配置', 'Writing Style'],
  referenceWorks: ['参考作品', 'Reference Works'],
  needsGoldenFinger: ['金手指开关', 'Golden Finger Toggle'],
  genre: ['类型', 'Genre'],
  subGenre: ['细分类型', 'Subgenre'],
  targetAudience: ['目标受众', 'Target Audience'],
  totalChapters: ['总章数', 'Total Chapters'],
  wordsPerChapter: ['每章字数', 'Words Per Chapter'],
  plotStructure: ['故事结构', 'Story Structure'],
  narrativePOV: ['叙事视角', 'Narrative POV'],
  writingLanguage: ['写作语言', 'Writing Language'],
}

/** 判定某次 novel_config 调用是否为写入操作（单一真实事实源）。 */
export function isNovelConfigWrite(params: Record<string, unknown>): boolean {
  const rawAction = String(params.action ?? '').toLowerCase().trim()
  const isExplicitUpdate = rawAction === 'update' || rawAction === '修改' || rawAction === '更新' || rawAction === '填充'
  const isExplicitRead = rawAction === 'read' || rawAction === '读取' || rawAction === '查看'

  const hasUpdatePayload = Boolean(
    params.changes
    || params.coreOutline
    || params.worldSetting
    || params.goldenFinger
    || params.needsGoldenFinger !== undefined
    || params.protagonistProfile
    || params.genre
    || params.subGenre
    || params.targetAudience
    || params.totalChapters
    || params.wordsPerChapter
    || params.plotStructure
    || params.narrativePOV
    || params.globalGuidance
    || params.writingStyle
    || params.referenceWorks
    || (params.field && params.content)
    || (params.old_text && params.new_text),
  )

  return isExplicitUpdate || (!isExplicitRead && hasUpdatePayload)
}

export function createNovelConfigTool(
  language: WritingLanguage,
  rendererAction: RendererActionSink,
): AgentTool<typeof Schema, { action: string; fields?: number }> {
  const text = (zhCN: string, enUS: string) => writingLanguageText(language, zhCN, enUS)
  const description = language === 'en-US'
    ? 'Read or update novel configuration fields: basic info (genre, chapters, POV), core outline, world setting, golden finger (set needsGoldenFinger: false when the story has no special advantage), protagonist profile, guidance, style. Discuss the content with the author first, then call this tool to fill it in directly. Read existing fields with action: "read" before modifying them; use old_text/new_text to patch one section of a long document without rewriting the whole text.'
    : '读取或修改当前项目的小说配置。支持按字段单独或批量读写：基本信息（类型、章节规模、叙事视角等）、核心大纲、世界观设定、金手指/核心卖点（整篇不需要时可传 needsGoldenFinger: false 关闭）、主角人设、创作指导、文风配置等。在对话中与作者探讨确定后，可直接调用此工具将生成的设定填入小说配置中。修改已有设定前先用 action: "read" 读取现状；长文只需改一段时用 old_text/new_text 局部替换，不要整篇重写。'

  return {
    name: 'novel_config',
    label: 'Novel Config',
    description,
    parameters: Schema,
    isWriteOperation: isNovelConfigWrite,
    execute: async (_id, params) => {
      const core = ProjectCoreRepository.get()
      if (!core) {
        throw new Error(text('项目未打开或未初始化', 'Project is not open or not initialized'))
      }

      const isUpdate = isNovelConfigWrite(params as Record<string, unknown>)

      const goldenFingerDisabledError = () => new Error(text(
        '该项目并不涉及金手指，已关闭，不能写入内容；如需写入请先联系通知作者，需要把开关设为「需要」。',
        'This project does not involve a golden finger, so the field is disabled and content cannot be written. To write it, notify the author and set the switch to "Needed".',
      ))

      const writesGoldenFingerText = (): boolean => {
        if (typeof params.goldenFinger === 'string' && params.goldenFinger.trim().length > 0) return true
        if (FIELD_ALIASES[params.field ?? ''] === 'goldenFinger'
          && typeof params.content === 'string'
          && params.content.trim().length > 0) return true
        const changes = params.changes
        if (changes && typeof changes === 'object' && !Array.isArray(changes)) {
          for (const [key, value] of Object.entries(changes)) {
            if (FIELD_ALIASES[key] === 'goldenFinger' && typeof value === 'string' && value.trim().length > 0) {
              return true
            }
          }
        }
        return false
      }

      if (!isUpdate) {
        // ========== 读取逻辑 ==========
        const targetFieldKey = FIELD_ALIASES[params.field ?? 'all'] ?? 'all'
        const parts: string[] = []

        const formatBasicInfo = () => {
          return [
            `### ${text('基本信息', 'Basic Information')}`,
            `- ${text('书名/项目名', 'Project Name')}: ${core.projectName || '—'}`,
            `- ${text('类型', 'Genre')}: ${core.genre || '—'}${core.subGenre ? ` (${core.subGenre})` : ''}`,
            `- ${text('目标读者', 'Target Audience')}: ${core.targetAudience || '—'}`,
            `- ${text('计划总章数', 'Total Chapters')}: ${core.totalChapters || '—'}`,
            `- ${text('每章目标字数', 'Words Per Chapter')}: ${core.wordsPerChapter || '—'}`,
            `- ${text('故事结构', 'Story Structure')}: ${core.plotStructure || '—'}`,
            `- ${text('叙事视角', 'Narrative POV')}: ${core.narrativePov || '—'}`,
            `- ${text('写作语言', 'Writing Language')}: ${core.writingLanguage || '—'}`,
            `- ${text('金手指', 'Golden Finger')}: ${isGoldenFingerEnabled(core) ? text('需要', 'Needed') : text('不需要', 'Not needed')}`,
          ].join('\n')
        }

        if (targetFieldKey === 'all' || targetFieldKey === 'basic_info') {
          parts.push(formatBasicInfo())
        }

        const documentFields: Array<[keyof typeof core, string, string]> = [
          ['coreOutline', '核心大纲', 'Core Outline'],
          ['worldSetting', '世界观设定', 'World Setting'],
          ['goldenFinger', '金手指 / 核心卖点', 'Golden Finger / Advantage'],
          ['protagonistProfile', '主角人设', 'Protagonist Profile'],
          ['globalGuidance', '全局创作指导', 'Global Guidance'],
          ['writingStyle', '文风配置', 'Writing Style'],
          ['referenceWorks', '参考作品', 'Reference Works'],
        ]

        for (const [key, zh, en] of documentFields) {
          if (targetFieldKey === 'all' || targetFieldKey === key) {
            if (key === 'goldenFinger' && !isGoldenFingerEnabled(core)) {
              parts.push(`### ${text(zh, en)}\n${text('（已设为不需要，历史文本未启用）', '(Marked as not needed; historical text is inactive)')}`)
              continue
            }
            const val = String(core[key] ?? '').trim()
            parts.push(`### ${text(zh, en)}\n${val ? val : text('（暂无设定）', '(Empty)')}`)
          }
        }

        return {
          content: [{
            type: 'text',
            text: parts.join('\n\n'),
          }],
          details: { action: 'read' },
        }
      }

      // ========== 局部片段精准替换逻辑 ==========
      if (params.old_text && params.new_text) {
        const targetFieldKey = FIELD_ALIASES[params.field ?? 'coreOutline'] ?? (params.field ?? 'coreOutline')
        if (targetFieldKey === 'goldenFinger' && !isGoldenFingerEnabled(core)) {
          throw goldenFingerDisabledError()
        }
        const currentVal = String((core as unknown as Record<string, unknown>)[targetFieldKey] ?? '')
        if (!currentVal.includes(params.old_text)) {
          const entry = FIELD_DISPLAY_NAMES[targetFieldKey]
          const fieldLabel = entry ? text(entry[0], entry[1]) : targetFieldKey
          throw new Error(text(
            `在小说配置【${fieldLabel}】中未找到指定的待替换原文片段。请先通过 read 读取该字段核对当前原文。`,
            `The specified excerpt was not found in novel configuration [${fieldLabel}]. Please read the field first to verify current text.`,
          ))
        }

        const updatedVal = currentVal.replace(params.old_text, params.new_text)
        const isPOV = targetFieldKey === 'narrativePOV' || targetFieldKey === 'narrativePov'
        ProjectCoreRepository.update({
          ...(isPOV ? { narrativePov: updatedVal } : { [targetFieldKey]: updatedVal }),
        } as Parameters<typeof ProjectCoreRepository.update>[0])

        rendererAction({ type: 'refresh_project_config' })

        const entry = FIELD_DISPLAY_NAMES[targetFieldKey]
        const fieldLabel = entry ? text(entry[0], entry[1]) : targetFieldKey
        return {
          content: [{
            type: 'text',
            text: text(
              `已在小说配置【${fieldLabel}】中精准替换指定段落（原文 ${params.old_text.length} 字 → 新文 ${params.new_text.length} 字，其余全文完整保留未动）。`,
              `Successfully replaced targeted paragraph in novel configuration [${fieldLabel}] (${params.old_text.length} -> ${params.new_text.length} chars, rest of content preserved verbatim).`,
            ),
          }],
          details: { action: 'update', fields: 1 },
        }
      }

      // ========== 整体字段写入 / 填充逻辑 ==========
      if (!isGoldenFingerEnabled(core) && writesGoldenFingerText()) {
        throw goldenFingerDisabledError()
      }
      const current = {
        ...(core ?? {}),
        narrativePOV: core?.narrativePov,
      } as unknown as NovelConfig

      const proposal = buildNovelConfigProposal(
        params as Record<string, unknown>,
        current,
        text as ProposalText,
      )
      if (!proposal.valid) throw new Error(proposal.error)
      const changes = proposal.changes as Record<string, unknown>

      const { narrativePOV, ...rest } = changes
      ProjectCoreRepository.update({
        ...rest,
        ...(narrativePOV !== undefined ? { narrativePov: narrativePOV as string } : {}),
      } as Parameters<typeof ProjectCoreRepository.update>[0])

      rendererAction({ type: 'refresh_project_config' })

      const updatedNames = Object.keys(changes).map(k => {
        const entry = FIELD_DISPLAY_NAMES[k]
        return entry ? text(entry[0], entry[1]) : k
      })

      return {
        content: [{
          type: 'text',
          text: text(
            `已成功更新小说配置（${updatedNames.join('、')}）`,
            `Successfully updated novel configuration (${updatedNames.join(', ')})`,
          ),
        }],
        details: { action: 'update', fields: Object.keys(changes).length },
      }
    },
  }
}
