import type { RendererAction, RendererActionResult } from '../../shared/agent-events'
import type { DraftStatus } from '../../shared/draft-status'
import type { DraftMeta } from '../../shared/contracts/draft'
import { globalEventBus } from '../../shared/event-bus'
import { logFailure } from '../../shared/fail-log'
import { projectSessionContextFromProject } from '../../shared/project-session-context'
import { openBuiltinEditor } from '../editor-file-openers'
import { useEditorStore } from '../../stores/editor-store'
import { useLocaleStore } from '../../stores/locale-store'
import { openReviewReportTab } from '../editor/open-review-report'
import { useProjectStore } from '../../stores/project-store'
import { countDraftUnits } from '../../shared/draft-units'

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
    case 'save_draft_for_ai': {
      const project = useProjectStore.getState().currentProject
      const uiText = useLocaleStore.getState().text
      if (!project) {
        return { ok: false, error: uiText('未打开小说项目', 'No novel project is currently open') }
      }
      const projectSession = projectSessionContextFromProject(project)
      if (!projectSession) {
        return { ok: false, error: uiText('项目会话已失效，请重新打开项目', 'The project session has expired; reopen the project') }
      }

      const editor = useEditorStore.getState()
      const activeTab = editor.tabs.find(tab => tab.id === editor.activeTabId)
      const candidate = action.chapterNumber === undefined
        ? (activeTab?.projectKey === project.path && activeTab.type === 'chapter' ? activeTab : undefined)
        : editor.tabs.find(tab => (
          tab.projectKey === project.path
          && tab.type === 'chapter'
          && tab.chapterNumber === action.chapterNumber
        ))

      if (!candidate) {
        return {
          ok: true,
          summary: uiText(
            '当前没有打开的章节草稿；审稿将读取数据库中的最新版本。',
            'No chapter draft is open; the review reads the latest version from the database.',
          ),
        }
      }
      if (candidate.draftStatus === 'finalized' || candidate.draftStatus === 'archived') {
        return {
          ok: true,
          summary: uiText('该章草稿已定稿或归档，无需保存。', 'This draft is finalized or archived; no save is needed.'),
        }
      }
      if (!candidate.draftId) {
        return {
          ok: false,
          error: uiText(
            '当前草稿缺少数据库身份，无法保存；请重新打开该章草稿后再审稿。',
            'The draft has no database identity; reopen it before reviewing.',
          ),
        }
      }
      if (!candidate.dirty) {
        return {
          ok: true,
          summary: uiText('当前草稿没有未保存修改。', 'The current draft has no unsaved changes.'),
        }
      }

      const content = candidate.content ?? ''
      const snapshot = {
        content,
        contentRevision: candidate.contentRevision ?? 0,
      }
      const { ipc } = await import('../ipc-client')
      const result = await ipc.invokeWithProjectSession(
        projectSession,
        'db:draft-update-content',
        candidate.draftId,
        content,
        countDraftUnits(content),
        project.path,
      )
      if (!result.success) {
        return {
          ok: false,
          error: result.error || uiText('草稿保存失败', 'Could not save the draft'),
        }
      }
      const latest = useEditorStore.getState().tabs.find(tab => tab.id === candidate.id)
      if (
        !latest
        || latest.content !== snapshot.content
        || (latest.contentRevision ?? 0) !== snapshot.contentRevision
      ) {
        return {
          ok: false,
          error: uiText(
            '保存期间正文又发生变化，本次审稿未启动；请保存后重新发起审稿。',
            'The draft changed while it was being saved, so the review was not started. Save and start again.',
          ),
        }
      }
      useEditorStore.getState().settleTabSave(candidate.id, snapshot)
      return {
        ok: true,
        summary: uiText(
          `已保存第 ${candidate.chapterNumber ?? '?'} 章草稿，审稿将读取这次保存后的正文。`,
          `Saved the chapter ${candidate.chapterNumber ?? '?'} draft; the review will read this saved body.`,
        ),
      }
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
    case 'close_editor_tab': {
      const project = useProjectStore.getState().currentProject
      if (!project) return
      const editor = useEditorStore.getState()
      const matchingTabs = editor.tabs.filter(tab =>
        tab.projectKey === project.path
        && tab.type === 'review-report'
        && (action.reviewId !== undefined
          ? tab.reviewId === action.reviewId
          : action.chapterNumber !== undefined && tab.chapterNumber === action.chapterNumber),
      )
      for (const tab of matchingTabs) editor.closeTab(tab.id)
      return
    }
    case 'refresh_reviews': {
      const project = useProjectStore.getState().currentProject
      if (!project) return
      const projectSession = projectSessionContextFromProject(project)
      if (!projectSession) return
      globalEventBus.emit('REFRESH_RESOURCE', {
        resources: ['reviews'],
        projectPath: project.path,
        projectSession,
      })
      return
    }
    case 'open_review_report': {
      const project = useProjectStore.getState().currentProject
      if (!project) return
      const projectSession = projectSessionContextFromProject(project)
      if (!projectSession) return
      openReviewReportTab({
        review: {
          id: action.reviewId,
          reviewIndex: action.reviewIndex,
          content: action.content,
        },
        chapterNumber: action.chapterNumber,
        draftFilePath: action.draftPath,
        chapterDir: action.chapterDir,
        projectKey: project.path,
      })
      // 侧栏目录树按草稿挂载审查报告节点；新报告写入后需要重新拉取 reviews。
      globalEventBus.emit('REFRESH_RESOURCE', {
        resources: ['reviews', 'fileTree'],
        projectPath: project.path,
        projectSession,
      })
      return
    }
  }
}
