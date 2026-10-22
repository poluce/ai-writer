/**
 * 章节卡片/蓝图编辑器共享纯逻辑 — 角色常量、项目会话校验、序列错误恢复与空蓝图工厂。
 * 从 ChapterCardEditor 拆出，使主组件聚焦于列表管理与蓝图状态流转。
 */

import { useProjectStore } from '../../stores/project-store'
import { useEditorDraftLedgerStore } from '../../stores/editor-draft-ledger-store'
import {
  CHAPTER_CARD_TAB_ID,
  parseChapterCardDraftLedger,
  type ChapterCardDraftLedger,
} from '../../stores/chapter-card-draft-ledger'
import {
  projectSessionContextFromProject,
  sameProjectPathKey,
  sameProjectSessionContext,
} from '../../shared/project-session-context'
import type { ProjectSessionContext } from '../../shared/ipc-channels'
import { AuthoritativeChapterSequenceError } from '../../services/authoritative-chapter-sequence'
import type { ChapterBlueprint } from '../../services/workflows/directory-workflow'
import { globalEventBus } from '../../shared/event-bus'

export const ROLES = ['建置', '铺垫', '发展', '冲突', '高潮', '转折', '收尾']

export const ROLE_EN: Record<string, string> = {
  建置: 'Setup',
  铺垫: 'Foreshadowing',
  发展: 'Development',
  冲突: 'Conflict',
  高潮: 'Climax',
  转折: 'Turning point',
  收尾: 'Resolution',
}

export const ROLE_COLORS: Record<string, string> = {
  高潮: 'bg-red-500/20 text-[var(--color-error-text)]',
  冲突: 'bg-orange-500/20 text-[var(--color-warning-text)]',
  转折: 'bg-purple-500/20 text-[var(--color-category-review-text)]',
  建置: 'bg-blue-500/20 text-[var(--color-category-progress-text)]',
  收尾: 'bg-green-500/20 text-[var(--color-success-text)]',
}

export function roleLabel(
  role: string,
  text: (zhCNText: string, enUSText: string) => string,
): string {
  return text(role, ROLE_EN[role] || role)
}

export function readDraftLedgerFromFixedTab(): ChapterCardDraftLedger {
  return parseChapterCardDraftLedger(
    useEditorDraftLedgerStore.getState().draftLedgers[CHAPTER_CARD_TAB_ID],
  )
}

export function currentProjectSessionForPath(projectKey: string): ProjectSessionContext | null {
  const projectSession = projectSessionContextFromProject(
    useProjectStore.getState().currentProject,
  )
  if (!projectSession || !sameProjectPathKey(projectSession.projectPath, projectKey)) {
    return null
  }
  return projectSession
}

export function isCurrentProjectSession(projectSession: ProjectSessionContext): boolean {
  return sameProjectSessionContext(
    projectSession,
    projectSessionContextFromProject(useProjectStore.getState().currentProject),
  )
}

export function matchingDataProjectSession(
  projectKey: string,
  dataProjectSession: ProjectSessionContext | null,
): ProjectSessionContext | null {
  const projectSession = currentProjectSessionForPath(projectKey)
  if (!projectSession || !sameProjectSessionContext(dataProjectSession, projectSession)) {
    return null
  }
  return projectSession
}

export function isLoadedCurrentSession(
  projectSession: ProjectSessionContext,
  dataProjectSession: ProjectSessionContext | null,
): boolean {
  return isCurrentProjectSession(projectSession)
    && sameProjectSessionContext(dataProjectSession, projectSession)
}

export function isRenderableProjectSession(
  projectSession: ProjectSessionContext | null,
  projectMatches: boolean,
  renderedProjectId: string | null,
  renderedProjectPath: string | null,
): projectSession is ProjectSessionContext {
  return projectMatches
    && projectSession !== null
    && projectSession.projectId === renderedProjectId
    && sameProjectPathKey(projectSession.projectPath, renderedProjectPath)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function recoveryChapterFromSequenceError(error: unknown): number | null {
  if (!(error instanceof AuthoritativeChapterSequenceError)) return null
  const gap = error.sequence.firstGapChapterNumber
  if (gap === undefined || error.sequence.lastChapterNumber <= gap) return null
  return gap
}

export function createEmptyBlueprint(chapterNumber: number): ChapterBlueprint {
  return {
    chapterNumber,
    title: '',
    role: '发展',
    purpose: '',
    keyEvents: '',
    characters: [],
    suspenseHook: '',
    userGuidance: '',
    notes: '',
    notesUpdatedAt: '',
  }
}

export function emitBlueprintResourceRefresh(
  projectKey: string,
  projectSession: ProjectSessionContext,
): void {
  globalEventBus.emit('REFRESH_RESOURCE', {
    resources: ['blueprints', 'fileTree'],
    projectPath: projectKey,
    projectSession,
  })
}
