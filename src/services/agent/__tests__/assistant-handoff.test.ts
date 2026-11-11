import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setActiveProjectSessionContext } from '../../../shared/project-session-context'
import { useAgentStore } from '../../../stores/agent-store'
import { resetEditorSessionStores, useEditorStore } from '../../../stores/editor-store'
import { useLayoutStore } from '../../../stores/layout-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import { ipc } from '../../ipc-client'
import {
  handoffConfirmedReviewToWriter,
  handoffToArchitect,
  handoffToBlueprint,
  openChapterWritingWorkspace,
} from '../assistant-handoff'

const PROJECT_PATH = 'C:\\novels\\handoff-test'
const PROJECT_SESSION = Object.freeze({
  projectId: 'handoff-test-id',
  projectPath: PROJECT_PATH,
})

const originalAgentState = useAgentStore.getState()
const originalEditorState = useEditorStore.getState()
const originalLayoutState = useLayoutStore.getState()
const originalLocaleState = useLocaleStore.getState()
const originalProjectState = useProjectStore.getState()

let sendMessage: ReturnType<typeof vi.fn>

beforeEach(() => {
  sendMessage = vi.fn(async () => {})
  useLocaleStore.setState({ locale: 'zh-CN', initialized: true })
  useLayoutStore.setState({ aiPanelOpen: false, rightView: 'agent' })
  useAgentStore.setState({ sendMessage: sendMessage as never, composerDrafts: {} })
  useProjectStore.setState({
    currentProject: {
      id: PROJECT_SESSION.projectId,
      name: 'Handoff Test',
      path: PROJECT_PATH,
      novelConfig: {},
    } as never,
  })
  setActiveProjectSessionContext(PROJECT_SESSION)
  resetEditorSessionStores()
})

afterEach(() => {
  vi.restoreAllMocks()
  setActiveProjectSessionContext(null)
  useAgentStore.setState(originalAgentState)
  useEditorStore.setState(originalEditorState)
  useLayoutStore.setState(originalLayoutState)
  useLocaleStore.setState(originalLocaleState)
  useProjectStore.setState(originalProjectState)
})

describe('assistant handoff', () => {
  it('opens architect assistant with localized section context', () => {
    handoffToArchitect({ section: 'worldbuilding', regenerate: false })
    expect(useLayoutStore.getState()).toMatchObject({ aiPanelOpen: true, rightView: 'architect' })
    expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('环境与世界观'), 'architect')

    useLocaleStore.setState({ locale: 'en-US' })
    handoffToArchitect({ section: 'characters', regenerate: true })
    expect(sendMessage).toHaveBeenLastCalledWith(expect.stringContaining('manage_characters'), 'architect')
  })

  it('opens blueprint assistant with current blueprint count and next chapter number', () => {
    handoffToBlueprint({ existingCount: 4, nextChapterNumber: 5, totalChapters: 80 })
    expect(useLayoutStore.getState()).toMatchObject({ aiPanelOpen: true, rightView: 'blueprint' })
    expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('已有 4 章蓝图'), 'blueprint')
    expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('第 5 章'), 'blueprint')
  })

  it('hands off confirmed review checklist brief to the writer assistant', () => {
    handoffConfirmedReviewToWriter({
      chapterNumber: 3,
      chapterTitle: '夜半来客',
      draftId: 12,
      reviewSourceId: 48,
      confirmedBrief: '1. 修复人物立场冲突',
    })
    expect(useLayoutStore.getState()).toMatchObject({ aiPanelOpen: true, rightView: 'writer' })
    expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('draft_id: 12'), 'writer')
    expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('1. 修复人物立场冲突'), 'writer')
  })

  it('creates an empty v1 draft when none exists, opens the chapter tab, and prefills writer composerDraft without auto-sending', async () => {
    const invokeSpy = vi.spyOn(ipc, 'invokeWithProjectSession').mockImplementation((async (_session: unknown, channel: string) => {
      if (channel === 'db:draft-get-latest') return null
      if (channel === 'db:draft-create') return { success: true, id: 77 }
      if (channel === 'db:draft-get-meta') {
        return {
          id: 77,
          chapterNumber: 1,
          chapterTitle: '初章风雪',
          version: 1,
          status: 'draft',
          source: 'write',
          wordCount: 0,
        }
      }
      if (channel === 'db:draft-list') return []
      if (channel === 'db:draft-get-full') return { id: 77, content: '' }
      throw new Error(`unexpected channel: ${channel}`)
    }) as never)

    await openChapterWritingWorkspace({
      chapterNumber: 1,
      title: '初章风雪',
      role: '开端',
      purpose: '建立主角处境',
      keyEvents: '风雪夜接到密令',
      characters: ['林舟', '苏雨'],
      userGuidance: '控制节奏',
    }, PROJECT_SESSION)

    expect(invokeSpy).toHaveBeenCalledWith(
      PROJECT_SESSION,
      'db:draft-create',
      expect.objectContaining({ chapterNumber: 1, version: 1, source: 'write', content: '' }),
      PROJECT_PATH,
    )
    expect(useEditorStore.getState().tabs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filePath: 'vela://draft/77',
        type: 'chapter',
        chapterNumber: 1,
        draftId: 77,
        projectKey: PROJECT_PATH,
      }),
    ]))
    expect(useLayoutStore.getState()).toMatchObject({ aiPanelOpen: true, rightView: 'writer' })
    expect(sendMessage).not.toHaveBeenCalled()
    expect(useAgentStore.getState().composerDrafts.writer).toContain('初章风雪')
    expect(useAgentStore.getState().composerDrafts.writer).toContain('林舟、苏雨')
    expect(useAgentStore.getState().composerDrafts.writer).toContain('控制节奏')
  })

  it('reuses an existing draft and ignores stale project sessions', async () => {
    const invokeSpy = vi.spyOn(ipc, 'invokeWithProjectSession').mockImplementation((async (_session: unknown, channel: string) => {
      if (channel === 'db:draft-get-latest') {
        return {
          id: 88,
          chapterNumber: 2,
          chapterTitle: '旧草稿',
          version: 2,
          status: 'draft',
          source: 'write',
          wordCount: 500,
        }
      }
      if (channel === 'db:draft-get-full') return { id: 88, content: '已有正文' }
      throw new Error(`unexpected channel: ${channel}`)
    }) as never)

    await openChapterWritingWorkspace({
      chapterNumber: 2,
      title: '第二章',
      role: '发展',
      purpose: '推进',
      keyEvents: '事件',
      characters: [],
    }, PROJECT_SESSION)

    expect(invokeSpy).not.toHaveBeenCalledWith(PROJECT_SESSION, 'db:draft-create', expect.anything(), expect.anything())
    expect(useEditorStore.getState().tabs[0]).toMatchObject({ filePath: 'vela://draft/88', content: '已有正文' })

    // 切换项目会话后不应打开旧项目的草稿或预填写作助手
    useAgentStore.setState({ composerDrafts: {} })
    await openChapterWritingWorkspace({
      chapterNumber: 3,
      title: '第三章',
      role: '冲突',
      purpose: '冲突',
      keyEvents: '冲突',
      characters: [],
    }, { projectId: 'other-project', projectPath: PROJECT_PATH })
    expect(useAgentStore.getState().composerDrafts.writer).toBeUndefined()
  })
})
