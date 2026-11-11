import { workflowResourceKey, type WorkflowDefinition } from '../../stores/workflow-store'
import type { DraftMeta } from '../draft-index'
import { ipc } from '../ipc-client'

import type { DraftStatus } from '../../shared/draft-status'
import type { ProjectSessionContext } from '../../shared/ipc-channels'
import { sameProjectPathKey } from '../../shared/project-session-context'
import { FINALIZATION_SHARED_WRITE_RESOURCE_KINDS } from '../../shared/workflow-resource-claims'
import { localize } from '../../i18n/core'
import type { Locale } from '../../i18n/types'
import { useLocaleStore } from '../../stores/locale-store'

export type { DraftStatus, DraftMeta }

export interface ChapterInfo {
  projectPath: string
  chapterNumber: number
  title: string
  role: string
  purpose: string
  characters: string[]
  keyEvents: string
  suspenseHook?: string
  userGuidance?: string
  wordsTarget?: number
  knowledgeQueryHint?: string
}

export interface FrozenDraftSourceIdentity {
  readonly id: number
  readonly chapterNumber: number
  readonly version: number
  readonly status: DraftStatus
  readonly contentRevision: number
}

export interface FinalizeOnlyParams {
  projectPath: string
  chapterNumber: number
  chapterTitle: string
  draftPath: string
  draftContent: string
  snapshot?: import('../finalization-snapshot').FinalizationSnapshot
}

const CHAPTER_CONTEXT_READ_RESOURCE_KEYS = Object.freeze([
  workflowResourceKey('novel-config'),
  workflowResourceKey('architecture'),
  workflowResourceKey('blueprints'),
])

const FINALIZE_SHARED_WRITE_RESOURCE_KEYS = Object.freeze([
  ...FINALIZATION_SHARED_WRITE_RESOURCE_KINDS.map(kind => workflowResourceKey(kind)),
])

function finalizeWriteResourceKeys(chapterNumber: number): readonly string[] {
  return Object.freeze([
    workflowResourceKey('chapter', chapterNumber),
    ...FINALIZE_SHARED_WRITE_RESOURCE_KEYS,
  ])
}

function workflowProjectSession(
  projectPath: string,
  sourceProjectSession: ProjectSessionContext,
  uiLocale: Locale = chapterWorkflowLocale(),
): ProjectSessionContext {
  if (!sameProjectPathKey(sourceProjectSession.projectPath, projectPath)) {
    throw new Error(localize(
      uiLocale,
      '工作流项目会话与目标路径不匹配',
      'Workflow project session does not match the target path',
    ))
  }
  return Object.freeze({ ...sourceProjectSession })
}

function chapterWorkflowLocale(locale?: Locale): Locale {
  return locale ?? useLocaleStore.getState().locale
}

export async function parseDraftMeta(
  filePath: string,
  expectedProjectPath: string,
  projectSession: ProjectSessionContext,
): Promise<DraftMeta | null> {
  if (!sameProjectPathKey(projectSession.projectPath, expectedProjectPath)) {
    throw new Error('读取草稿元数据时项目会话与目标路径不匹配')
  }

  // 优先处理 vela://draft/{id} 纯数字 ID 格式（DB 化后的标准路径）
  const idMatch = filePath.match(/^vela:\/\/(?:draft|manuscript)\/(\d+)$/)
  if (idMatch) {
    const draftId = parseInt(idMatch[1])
    const dbMeta = await ipc.invokeWithProjectSession(
      projectSession,
      'db:draft-get-meta',
      draftId,
      expectedProjectPath,
    )
    if (!dbMeta) return null
    return {
      ...dbMeta,
      status: dbMeta.status as DraftStatus,
      source: dbMeta.source as 'write' | 'rewrite',
      fileName: `draft_v${dbMeta.version}.md`,
      filePath: `vela://draft/${dbMeta.id}`,
    } as unknown as DraftMeta
  }

  // 兼容旧格式 draft_v(\d+).md 和 vela://draft/ch{N}/v{V}
  const versionMatch = filePath.match(/v(\d+)(?:\.md)?$/)
  if (!versionMatch) return null
  const version = parseInt(versionMatch[1])

  const chMatch = filePath.match(/ch(\d+)/)
  if (!chMatch) return null
  const chapterNumber = parseInt(chMatch[1])

  const drafts = await ipc.invokeWithProjectSession(
    projectSession,
    'db:draft-list',
    chapterNumber,
    expectedProjectPath,
  )
  const d = drafts.find((draft) => draft.version === version)
  return d ? (d as unknown as DraftMeta) : null
}

export function createFinalizeWorkflow(
  params: FinalizeOnlyParams,
  sourceProjectSession: ProjectSessionContext,
): WorkflowDefinition {
  const uiLocale = chapterWorkflowLocale()
  const chapterInfo: ChapterInfo = {
    projectPath: params.projectPath,
    chapterNumber: params.chapterNumber,
    title: params.chapterTitle,
    role: '',
    purpose: '',
    characters: [],
    keyEvents: '',
  }
  return {
    type: 'chapter_finalize',
    projectPath: params.projectPath,
    projectSession: workflowProjectSession(params.projectPath, sourceProjectSession),
    uiLocale,
    resourceKeys: finalizeWriteResourceKeys(params.chapterNumber),
    readResourceKeys: CHAPTER_CONTEXT_READ_RESOURCE_KEYS,
    title: localize(uiLocale,
      `定稿 — 第${params.chapterNumber}章 ${params.chapterTitle}`,
      `Finalize — Chapter ${params.chapterNumber} ${params.chapterTitle}`,
    ),
    steps: [
      {
        name: localize(uiLocale, '定稿', 'Finalize chapter'),
        description: localize(
          uiLocale,
          '提交定稿到数据库并生成章节要点、连续性事实和角色状态',
          'Commit the finalized chapter and update chapter notes, continuity facts, and character states',
        ),
        executor: async (step, context, callbacks) => {
          const { FinalizeChapterCommand } = await import('./commands/finalize-chapter.command')
          const cmd = new FinalizeChapterCommand({
            draftPath: params.draftPath,
            draftContent: params.draftContent,
            chapterNumber: params.chapterNumber,
            chapterInfo,
            snapshot: params.snapshot,
          })
          return cmd.execute({ step, context, callbacks })
        },
      },
    ],
    // 定稿界面结算只由携带 immutable snapshot 的 FINALIZE_COMPLETE 完成；不要在
    // workflow onComplete 中重新读 DB 并打开/覆盖旧 tab。
    onComplete: {
      mode: 'silent',
      message: localize(
        uiLocale,
        `第${params.chapterNumber}章已定稿。`,
        `Chapter ${params.chapterNumber} finalized.`,
      ),
    },
  }
}

/**
 * 修复定稿后处理工作流 — 当定稿后的三路推演失败时可重跑
 * 从 manuscript/ 读取已定稿内容，重新执行 FinalizeChapterCommand 的后处理部分
 */
export function createRepairFinalizeWorkflow(
  chapterNumber: number,
  projectPath: string,
  sourceProjectSession: ProjectSessionContext,
  stepKey?: string,
): WorkflowDefinition {
  const uiLocale = chapterWorkflowLocale()
  const text = (zhCNText: string, enUSText: string) => localize(uiLocale, zhCNText, enUSText)
  return {
    type: 'chapter_finalize',
    projectPath,
    projectSession: workflowProjectSession(projectPath, sourceProjectSession, uiLocale),
    uiLocale,
    resourceKeys: finalizeWriteResourceKeys(chapterNumber),
    readResourceKeys: CHAPTER_CONTEXT_READ_RESOURCE_KEYS,
    title: text(
      `修复后处理 — 第${chapterNumber}章`,
      `Repair post-processing — Chapter ${chapterNumber}`,
    ),
    steps: [
      {
        name: text('重建后处理', 'Rebuild post-processing'),
        description: text(
          '从定稿正文重新生成章节要点、连续性事实和角色状态',
          'Regenerate chapter notes, continuity facts, and character state from the finalized manuscript',
        ),
        executor: async (_step, context, callbacks) => {
          const { useProjectStore } = await import('../../stores/project-store')
          const { ipc: ipcClient } = await import('../ipc-client')
          const { projectSessionContextFromProject, sameProjectSessionContext } = await import('../../shared/project-session-context')
          const { requireWorkflowProjectSession } = await import('./workflow-project-session')
          const projectSession = requireWorkflowProjectSession(context)
          const project = useProjectStore.getState().currentProject
          if (!project || !sameProjectSessionContext(projectSession, projectSessionContextFromProject(project))) {
            throw new Error(text(
              '当前项目已切换，修复已停止',
              'The project changed, so repair was stopped.',
            ))
          }

          const draftMeta = await ipcClient.invokeWithProjectSession(
            projectSession,
            'db:draft-get-finalized',
            chapterNumber,
            projectPath,
          )
          if (!draftMeta) throw new Error(text(
            `第 ${chapterNumber} 章的定稿记录未获取到`,
            `The finalized record for Chapter ${chapterNumber} could not be found.`,
          ))
          const full = await ipcClient.invokeWithProjectSession(projectSession, 'db:draft-get-full', draftMeta.id, projectPath)
          if (!full) throw new Error(text(
            `正文提取失败: ID=${draftMeta.id}`,
            `Could not read finalized manuscript content: ID=${draftMeta.id}`,
          ))
          const finalizedSource = await ipcClient.invokeWithProjectSession(
            projectSession,
            'db:continuity-read-source',
            draftMeta.id,
            projectPath,
          )
          if (
            finalizedSource.status !== 'valid'
            || finalizedSource.snapshot.content !== full.content
          ) throw new Error(text(
            '定稿正文来源收据已失效',
            'The finalized manuscript source receipt is stale.',
          ))

          let chapterTitle = text(`第${chapterNumber}章`, `Chapter ${chapterNumber}`)
          let chapterEntities: string[] = []
          try {
            const bp = await ipcClient.invokeWithProjectSession(projectSession, 'db:blueprint-get', chapterNumber, projectPath)
            if (bp?.title) chapterTitle = bp.title
            if (Array.isArray(bp?.characters)) chapterEntities = bp.characters
          } catch { /* 蓝图读取失败时使用默认标题 */ }

          const { RunFinalizePostProcessCommand } = await import('./commands/finalize-chapter.command')
          await new RunFinalizePostProcessCommand({
            project,
            chapterNumber,
            chapterTitle,
            draftContent: full.content,
            draftId: draftMeta.id,
            finalizedSource: finalizedSource.snapshot.source,
            sourceLabel: text(
              `第${chapterNumber}章定稿`,
              `Chapter ${chapterNumber} finalized manuscript`,
            ),
            onlyFailed: true,
            stepKey,
            chapterEntities,
          }).execute({ step: {}, context, callbacks })

          const { globalEventBus } = await import('../../shared/event-bus')
          globalEventBus.emit('REFRESH_RESOURCE', {
            resources: ['fileTree', 'characterCards', 'drafts'],
            projectPath,
            projectSession,
          })
        },
      },
    ],
    onComplete: {
      mode: 'open',
      message: text(
        `第${chapterNumber}章后处理修复完成`,
        `Chapter ${chapterNumber} post-processing repair completed`,
      ),
    },
  }
}
