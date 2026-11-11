import type { DraftStatus } from '../../shared/draft-status'
import type { DraftMeta } from '../../shared/contracts/draft'
import type { ProjectSessionContext } from '../../shared/ipc-channels'
import {
  projectSessionContextFromProject,
  sameProjectPathKey,
  sameProjectSessionContext,
} from '../../shared/project-session-context'
import { useAgentStore } from '../../stores/agent-store'
import { useDraftStore } from '../../stores/draft-store'
import { useEditorStore } from '../../stores/editor-store'
import { useLayoutStore } from '../../stores/layout-store'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'
import { ipc } from '../ipc-client'
import { requireIpcSuccess } from '../ipc-result'

export type ArchitectureHandoffSection = 'all' | 'premise' | 'worldbuilding' | 'characters' | 'synopsis'

export interface ArchitectHandoffOptions {
  section: ArchitectureHandoffSection
  regenerate?: boolean
}

export interface BlueprintHandoffOptions {
  existingCount: number
  nextChapterNumber: number
  totalChapters?: number
}

export interface ReviewRevisionHandoffOptions {
  chapterNumber: number
  chapterTitle: string
  draftId: number
  reviewSourceId: number
  confirmedBrief: string
}

export interface ChapterWritingContext {
  chapterNumber: number
  title: string
  role: string
  purpose: string
  keyEvents: string
  characters: readonly string[]
  userGuidance?: string
}

function isSessionActive(projectSession: ProjectSessionContext): boolean {
  const currentSession = projectSessionContextFromProject(useProjectStore.getState().currentProject)
  return Boolean(currentSession && sameProjectSessionContext(currentSession, projectSession))
}

/**
 * 将「故事架构 / 情节大纲」页面的构思请求带入右侧架构助手。
 */
export function handoffToArchitect(options: ArchitectHandoffOptions): void {
  const text = useLocaleStore.getState().text
  const sectionLabelZh: Record<ArchitectureHandoffSection, string> = {
    all: '故事架构（前提概要、世界观与核心人物）',
    premise: '前提概要',
    worldbuilding: '环境与世界观',
    characters: '核心人物与关系网',
    synopsis: '分卷情节大纲',
  }
  const sectionLabelEn: Record<ArchitectureHandoffSection, string> = {
    all: 'story architecture (premise, worldbuilding, and core cast)',
    premise: 'story premise',
    worldbuilding: 'worldbuilding and setting',
    characters: 'core characters and relationship map',
    synopsis: 'plot outline',
  }

  const label = text(sectionLabelZh[options.section], sectionLabelEn[options.section])
  const prompt = options.section === 'characters'
    ? options.regenerate
      ? text(
        `请先读取项目设定、前提概要、世界观和现有角色档案，和我一起梳理并优化「${label}」，确认后再通过 manage_characters 更新角色。`,
        `Read the project settings, premise, worldbuilding, and current characters first, then review and refine the ${label} with me before applying updates via manage_characters.`,
      )
      : text(
        `请先读取项目设定、前提概要与世界观，结合故事核心冲突和我一起构建「${label}」，讨论定稿后通过 manage_characters 创建角色档案。`,
        `Read the project settings, premise, and worldbuilding first, then help me design the ${label} and create the records via manage_characters once confirmed.`,
      )
    : options.regenerate
      ? text(
        `请先用 read_architecture 读取当前项目「${label}」以及作品设定，指出可优化处并与我逐段推敲；确认方向后用 story_architecture（优先局部修改）更新。`,
        `Read the current ${label} with read_architecture and check the project settings first. Suggest improvements, iterate with me, and update the confirmed parts using story_architecture.`,
      )
      : text(
        `请先读取作品设定与现有故事架构上下文，和我一起构建「${label}」；先提出核心方案供我讨论，我确认后再用 story_architecture 写入。`,
        `Read the project settings and existing architecture context first, then propose an initial structure for ${label} so we can refine and write it via story_architecture once confirmed.`,
      )

  useLayoutStore.getState().openRightPanel('architect')
  void useAgentStore.getState().sendMessage(prompt, 'architect')
}

/**
 * 将「章节蓝图」页面的规划请求带入右侧蓝图助手。
 */
export function handoffToBlueprint(options: BlueprintHandoffOptions): void {
  const text = useLocaleStore.getState().text
  const totalHintZh = options.totalChapters && options.totalChapters > 0
    ? `（全书共规划 ${options.totalChapters} 章）`
    : ''
  const totalHintEn = options.totalChapters && options.totalChapters > 0
    ? ` (planned scale: ${options.totalChapters} chapters)`
    : ''

  const prompt = options.existingCount > 0
    ? text(
      `目前已有 ${options.existingCount} 章蓝图${totalHintZh}。请先读取故事架构、人物与最近已有蓝图，和我一起规划从第 ${options.nextChapterNumber} 章起的后续几章细纲，确认后通过 propose_chapter_blueprint 提交。`,
      `There are currently ${options.existingCount} chapter blueprints${totalHintEn}. Read the story architecture, cast, and recent blueprints first, then collaborate with me to plan the upcoming chapters starting at Chapter ${options.nextChapterNumber} and submit them via propose_chapter_blueprint once confirmed.`,
    )
    : text(
      `当前还没有章节蓝图${totalHintZh}。请先读取故事架构（前提、世界观、情节大纲）和角色列表，和我先讨论开篇前几章（从第 ${options.nextChapterNumber} 章起）的节奏与冲突，确认后再通过 propose_chapter_blueprint 创建蓝图。`,
      `No chapter blueprints exist yet${totalHintEn}. Read the story architecture and cast first, discuss the pacing and conflict of the opening chapters (starting from Chapter ${options.nextChapterNumber}) with me, and create them via propose_chapter_blueprint once confirmed.`,
    )

  useLayoutStore.getState().openRightPanel('blueprint')
  void useAgentStore.getState().sendMessage(prompt, 'blueprint')
}

/**
 * 将人工确认后的审稿清单带入右侧写作助手，由写作助手逐项精准修稿。
 */
export function handoffConfirmedReviewToWriter(options: ReviewRevisionHandoffOptions): void {
  const text = useLocaleStore.getState().text
  const prompt = text(
    [
      `请基于我已确认的第 ${options.chapterNumber} 章《${options.chapterTitle}》审稿修稿清单（review_id: ${options.reviewSourceId}，草稿 draft_id: ${options.draftId}）协助修改草稿。`,
      '请先用 manage_drafts 读取当前最新草稿，再逐条对照下方确认清单，优先使用 replace_excerpt 做最小精确修改，避免无故重写无关段落。',
      '',
      options.confirmedBrief,
    ].join('\n'),
    [
      `Please help revise Chapter ${options.chapterNumber} "${options.chapterTitle}" (draft_id: ${options.draftId}) using my confirmed review checklist (review_id: ${options.reviewSourceId}).`,
      'Read the latest draft via manage_drafts first, then address each confirmed finding below with targeted replace_excerpt edits while preserving unaffected prose.',
      '',
      options.confirmedBrief,
    ].join('\n'),
  )

  useLayoutStore.getState().openRightPanel('writer')
  void useAgentStore.getState().sendMessage(prompt, 'writer')
}

/**
 * 打开（若不存在则先创建空白初稿）指定章节的草稿编辑器，
 * 并在右侧写作助手输入框预填本章蓝图上下文，方便作者手写或直接回车协作。
 */
export async function openChapterWritingWorkspace(
  chapter: ChapterWritingContext,
  projectSession: ProjectSessionContext,
): Promise<void> {
  if (!isSessionActive(projectSession)) return
  const text = useLocaleStore.getState().text
  const projectPath = projectSession.projectPath

  let draftMeta: DraftMeta | null = await ipc.invokeWithProjectSession(
    projectSession,
    'db:draft-get-latest',
    chapter.chapterNumber,
    projectPath,
  )
  if (!isSessionActive(projectSession)) return

  if (!draftMeta) {
    const createResult = requireIpcSuccess(
      await ipc.invokeWithProjectSession(
        projectSession,
        'db:draft-create',
        {
          chapterNumber: chapter.chapterNumber,
          version: 1,
          source: 'write',
          content: '',
          wordCount: 0,
        },
        projectPath,
      ),
      text('创建章节草稿', 'Create chapter draft'),
    )
    if (!isSessionActive(projectSession)) return

    if (typeof createResult.id === 'number') {
      draftMeta = await ipc.invokeWithProjectSession(
        projectSession,
        'db:draft-get-meta',
        createResult.id,
        projectPath,
      )
    }
    if (!draftMeta) {
      draftMeta = await ipc.invokeWithProjectSession(
        projectSession,
        'db:draft-get-latest',
        chapter.chapterNumber,
        projectPath,
      )
    }
    if (!isSessionActive(projectSession)) return
    void useDraftStore.getState().loadChapterDrafts(chapter.chapterNumber, projectPath, projectSession)
  }

  if (!draftMeta) {
    throw new Error(text(
      `无法打开或创建第 ${chapter.chapterNumber} 章草稿。`,
      `Could not open or create a draft for Chapter ${chapter.chapterNumber}.`,
    ))
  }

  const full = await ipc.invokeWithProjectSession(
    projectSession,
    'db:draft-get-full',
    draftMeta.id,
    projectPath,
  )
  if (!isSessionActive(projectSession)) return
  if (!sameProjectPathKey(useProjectStore.getState().currentProject?.path, projectPath)) return

  const content = full?.content ?? ''
  const filePath = `vela://draft/${draftMeta.id}`
  useEditorStore.getState().openFile({
    id: filePath,
    name: draftMeta.chapterTitle || chapter.title || text(`第${draftMeta.chapterNumber}章`, `Chapter ${draftMeta.chapterNumber}`),
    type: 'chapter',
    filePath,
    content,
    savedContent: content,
    draftId: draftMeta.id,
    chapterNumber: draftMeta.chapterNumber,
    draftStatus: draftMeta.status as DraftStatus,
    projectKey: projectPath,
  })

  const cast = chapter.characters.filter(Boolean).join(text('、', ', '))
  const guidance = chapter.userGuidance?.trim()
  const prefill = text(
    [
      `我正在写作第 ${chapter.chapterNumber} 章《${chapter.title || `第${chapter.chapterNumber}章`}》（draft_id: ${draftMeta.id}）。`,
      chapter.role ? `定位：${chapter.role}` : '',
      chapter.purpose ? `核心目标：${chapter.purpose}` : '',
      chapter.keyEvents ? `关键事件：${chapter.keyEvents}` : '',
      cast ? `出场角色：${cast}` : '',
      guidance ? `作者指导：${guidance}` : '',
      '请先读取本章蓝图、前序章节定稿摘要与当前草稿，帮我梳理开篇切入点并协助逐段创作。',
    ].filter(Boolean).join('\n'),
    [
      `I am writing Chapter ${chapter.chapterNumber} "${chapter.title || `Chapter ${chapter.chapterNumber}`}" (draft_id: ${draftMeta.id}).`,
      chapter.role ? `Role: ${chapter.role}` : '',
      chapter.purpose ? `Goal: ${chapter.purpose}` : '',
      chapter.keyEvents ? `Key events: ${chapter.keyEvents}` : '',
      cast ? `Cast: ${cast}` : '',
      guidance ? `Author guidance: ${guidance}` : '',
      'Read this chapter blueprint, prior finalized context, and the current draft first, then help me plan the opening beat and co-write section by section.',
    ].filter(Boolean).join('\n'),
  )

  useLayoutStore.getState().openRightPanel('writer')
  useAgentStore.getState().setComposerDraft('writer', prefill)
}
