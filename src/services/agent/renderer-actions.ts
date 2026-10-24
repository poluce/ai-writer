import type { RendererAction, RendererActionResult } from '../../shared/agent-events'
import type { DraftStatus } from '../../shared/draft-status'
import type { DraftMeta } from '../../shared/contracts/draft'
import { globalEventBus } from '../../shared/event-bus'
import { logFailure } from '../../shared/fail-log'
import { projectSessionContextFromProject } from '../../shared/project-session-context'
import { openBuiltinEditor } from '../editor-file-openers'
import { useEditorStore } from '../../stores/editor-store'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'

/**
 * 主进程工具要求渲染层做的编排（开编辑器、刷新项目、改草稿）。
 * 不放进 agent-store：那是会话状态，不是跨店用例。
 */
export async function handleRendererAction(action: RendererAction): Promise<RendererActionResult | void> {
  switch (action.type) {
    case 'open_editor': {
      if (action.target === 'draft') {
        const project = useProjectStore.getState().currentProject
        if (!project) return
        const projectSession = projectSessionContextFromProject(project)
        if (!projectSession) return
        const { ipc } = await import('../ipc-client')
        const draftMeta: DraftMeta | null = action.draftId
          ? await ipc.invokeWithProjectSession(projectSession, 'db:draft-get-meta', action.draftId, project.path)
          : await ipc.invokeWithProjectSession(projectSession, 'db:draft-get-latest', action.chapterNumber, project.path)
        if (!draftMeta) return
        const full = await ipc.invokeWithProjectSession(projectSession, 'db:draft-get-full', draftMeta.id, project.path)
        const content = full?.content ?? ''
        const filePath = `vela://draft/${draftMeta.id}`
        const uiText = useLocaleStore.getState().text
        useEditorStore.getState().openFile({
          id: filePath,
          name: draftMeta.chapterTitle || uiText(`第${draftMeta.chapterNumber}章`, `Chapter ${draftMeta.chapterNumber}`),
          type: 'chapter',
          filePath,
          content,
          savedContent: content,
          draftId: draftMeta.id,
          chapterNumber: draftMeta.chapterNumber,
          draftStatus: draftMeta.status as DraftStatus,
          projectKey: project.path,
        })
        return
      }
      if (action.target === 'builtin') {
        const uiText = useLocaleStore.getState().text
        const builtin = {
          config: null,
          blueprints: ['chapter-card-editor', uiText('章节蓝图', 'Chapter blueprints'), 'chapter-card'],
          characters: ['character-editor', uiText('角色管理', 'Characters'), 'character'],
          architecture: ['world-building-editor', uiText('故事架构', 'Story architecture'), 'world-building'],
          synopsis: ['synopsis-editor', uiText('情节大纲', 'Plot outline'), 'synopsis'],
        } as const
        const entry = builtin[action.editor]
        if (entry === null) {
          useEditorStore.getState().openFile({
            id: 'config',
            name: uiText('小说配置', 'Novel configuration'),
            type: 'config',
            projectKey: useProjectStore.getState().currentProject?.path ?? '',
          })
          return
        }
        openBuiltinEditor(entry[0], entry[1], entry[2])
        return
      }
      useEditorStore.getState().openFile({
        id: `agent-${Date.now()}`,
        name: action.fileName,
        type: 'outline',
        filePath: action.filePath,
        content: action.content,
        savedContent: action.content,
        projectKey: useProjectStore.getState().currentProject?.path ?? '',
      })
      return
    }
    case 'replace_draft_excerpt': {
      const { applyDraftExcerptReplace } = await import('./apply-draft-excerpt')
      try {
        return await applyDraftExcerptReplace({
          chapterNumber: action.chapterNumber,
          oldText: action.oldText,
          newText: action.newText,
          replacements: action.replacements,
          draftId: action.draftId,
        })
      } catch (error) {
        logFailure('Agent', 'replace_draft_excerpt failed', error, {
          chapterNumber: action.chapterNumber,
        })
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }
    case 'refresh_project_config': {
      const project = useProjectStore.getState().currentProject
      if (!project) return
      void useProjectStore.getState().reloadNovelConfig().catch((error) => {
        logFailure('Agent', 'reloadNovelConfig failed', error)
      })
      void useProjectStore.getState().refreshFileTree(project.path).catch((error) => {
        logFailure('Agent', `${action.type} refresh failed`, error)
      })
      return
    }
    case 'refresh_blueprint': {
      const project = useProjectStore.getState().currentProject
      if (!project) return
      const projectSession = projectSessionContextFromProject(project)
      if (!projectSession) return
      void useProjectStore.getState().refreshFileTree(project.path).catch((error) => {
        logFailure('Agent', `${action.type} refresh failed`, error)
      })
      globalEventBus.emit('REFRESH_RESOURCE', {
        resources: ['blueprints', 'fileTree'],
        projectPath: project.path,
        projectSession,
      })
      return
    }
    case 'refresh_architecture': {
      const project = useProjectStore.getState().currentProject
      if (!project) return
      const projectSession = projectSessionContextFromProject(project)
      if (!projectSession) return
      const files = action.section === 'premise'
        ? ['premise.md']
        : action.section === 'worldbuilding'
          ? ['worldbuilding.md']
          : action.section === 'synopsis'
            ? ['synopsis.md']
            : action.section === 'characters'
              ? ['characters.md']
              : ['premise.md', 'worldbuilding.md', 'synopsis.md', 'characters.md']
      for (const fileName of files) {
        globalEventBus.emit('ARCH_FILE_UPDATED', {
          fileName,
          projectPath: project.path,
          projectSession,
          runId: `agent-${Date.now()}`,
        })
      }
      return
    }
    case 'refresh_character_roster': {
      const project = useProjectStore.getState().currentProject
      if (!project) return
      const projectSession = projectSessionContextFromProject(project)
      if (!projectSession) return
      const { useCharacterStore } = await import('../../stores/character-store')
      void useCharacterStore.getState().load(project.path, projectSession)
      globalEventBus.emit('ARCH_FILE_UPDATED', {
        fileName: 'characters.md',
        projectPath: project.path,
        projectSession,
        runId: `agent-${Date.now()}`,
      })
      return
    }
    case 'sync_draft_content': {
      const project = useProjectStore.getState().currentProject
      if (!project) return
      const projectSession = projectSessionContextFromProject(project)
      if (!projectSession) return

      const { useDraftStore } = await import('../../stores/draft-store')
      void useDraftStore.getState().loadChapterDrafts(action.chapterNumber, project.path, projectSession)
      void useProjectStore.getState().refreshFileTree(project.path)

      const { useEditorStore } = await import('../../stores/editor-store')
      const tabs = useEditorStore.getState().tabs
      const matchingTab = tabs.find(t =>
        t.projectKey === project.path &&
        t.type === 'chapter' &&
        (t.draftId === action.draftId || (!action.isNewVersion && t.chapterNumber === action.chapterNumber))
      )
      if (matchingTab && action.content) {
        useEditorStore.getState().syncTabContent(matchingTab.id, action.content)
        useEditorStore.getState().markTabSaved(matchingTab.id, action.content)
      }
      return
    }
    case 'open_review_report': {
      const project = useProjectStore.getState().currentProject
      if (!project) return
      const uiText = useLocaleStore.getState().text
      useEditorStore.getState().openFile({
        id: `review-${action.draftPath}-${action.reviewIndex}`,
        name: uiText(
          `审稿报告：第${action.chapterNumber}章`,
          `Review report: Chapter ${action.chapterNumber}`,
        ),
        type: 'review-report',
        content: action.content,
        filePath: action.draftPath,
        reportPath: action.reportPath,
        reviewReport: action.content,
        chapterNumber: action.chapterNumber,
        chapterDir: action.chapterDir,
        reviewId: action.reviewId,
        projectKey: project.path,
      })
      return
    }
  }
}
