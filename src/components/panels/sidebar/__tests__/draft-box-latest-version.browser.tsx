import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectData } from '../../../../shared/ipc-channels'
import { setActiveProjectSessionContext } from '../../../../shared/project-session-context'
import { useEditorStore } from '../../../../stores/editor-store'
import { useLocaleStore } from '../../../../stores/locale-store'
import { useProjectStore } from '../../../../stores/project-store'
import type { DraftMeta } from '../../../../stores/draft-store'
import DraftBoxGroup from '../DraftBoxGroup'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PROJECT_PATH = 'C:\\novels\\draft-latest-version'
const PROJECT_SESSION = { projectId: 'draft-latest-version', projectPath: PROJECT_PATH }

const project: ProjectData = {
  id: PROJECT_SESSION.projectId,
  name: 'Draft latest version',
  path: PROJECT_PATH,
  novelConfig: {
    genre: '', subGenre: '', targetAudience: '', totalChapters: 3, wordsPerChapter: 2500,
    plotStructure: 'three_act', narrativePOV: 'third_limited', coreOutline: '',
    worldSetting: '', goldenFinger: '', protagonistProfile: '', globalGuidance: '',
  },
  characterStates: '',
  createdAt: '',
  updatedAt: '',
}

function draft(version: number): DraftMeta {
  return {
    id: version,
    chapterNumber: 1,
    version,
    status: 'draft',
    source: 'write',
    wordCount: 12,
    createdAt: '2026-10-27T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
    fileName: `draft_v${version}.md`,
    filePath: `vela://draft/${version}`,
  }
}

let root: Root | undefined
let container: HTMLDivElement | undefined
const originalProjectState = useProjectStore.getState()
const originalEditorState = useEditorStore.getState()
const originalLocaleState = useLocaleStore.getState()

beforeEach(() => {
  useLocaleStore.setState({ locale: 'zh-CN', initialized: true })
  useProjectStore.setState({ currentProject: project, projectSessionEpoch: 1, fileTree: [], loading: false })
  useEditorStore.setState({ tabs: [], activeTabId: null })
  setActiveProjectSessionContext(PROJECT_SESSION)

  const invoke = vi.fn(async (channel: string) => {
    if (channel === 'db:blueprint-get') return { chapterNumber: 1, title: '最后的离线极客' }
    if (channel === 'db:review-list') return []
    throw new Error(`Unexpected IPC channel: ${channel}`)
  })
  Object.defineProperty(window, 'velaAPI', {
    configurable: true,
    value: {
      invoke,
      on: vi.fn(() => () => {}),
      once: vi.fn(),
      send: vi.fn(),
      setZoomLevel: vi.fn(),
      setZoomFactor: vi.fn(),
      getZoomLevel: vi.fn(() => 0),
    },
  })

  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  Reflect.deleteProperty(window, 'velaAPI')
  setActiveProjectSessionContext(null)
  useProjectStore.setState(originalProjectState)
  useEditorStore.setState(originalEditorState)
  useLocaleStore.setState(originalLocaleState)
})

describe('draft box version rows', () => {
  it('shows only the latest draft version for a chapter', async () => {
    await act(async () => {
      root?.render(<DraftBoxGroup draftsByChapter={{ 1: [draft(1), draft(2), draft(3)] }} />)
    })

    await vi.waitFor(() => {
      expect(container?.textContent).toContain('草稿_v3')
    })
    expect(container?.textContent).not.toContain('草稿_v2')
    expect(container?.textContent).not.toContain('草稿_v1')
    expect(container?.textContent).not.toContain('3 稿')
  })
})
