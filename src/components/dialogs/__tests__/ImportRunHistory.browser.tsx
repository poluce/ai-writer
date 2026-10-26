import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectData } from '../../../shared/ipc-channels'
import type { ImportRunSnapshot } from '../../../shared/import-run'
import { setActiveProjectSessionContext } from '../../../shared/project-session-context'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import ImportRunHistory from '../ImportRunHistory'

const PROJECT_PATH = 'C:\\novels\\import-history'
const PROJECT_SESSION = { projectId: 'import-history', projectPath: PROJECT_PATH }

const project: ProjectData = {
  id: PROJECT_SESSION.projectId,
  name: 'Import history',
  path: PROJECT_PATH,
  novelConfig: {
    genre: '', subGenre: '', targetAudience: '', totalChapters: 4, wordsPerChapter: 2500,
    plotStructure: 'three_act', narrativePOV: 'third_limited', coreOutline: 'Configured',
    worldSetting: '', goldenFinger: '', protagonistProfile: '', globalGuidance: '',
  },
  characterStates: '',
  createdAt: '',
  updatedAt: '',
}

function run(id: string, overrides: Partial<ImportRunSnapshot> = {}): ImportRunSnapshot {
  return {
    id,
    purpose: 'reference',
    rootRunId: id,
    effectNamespace: 'test',
    sourceDisplay: [{ displayName: `${id}.txt`, mediaType: 'text/plain', size: 42 }],
    locale: 'zh-CN',
    stage: 'completed',
    status: 'completed',
    completedBatches: {},
    lastError: '',
    resumable: false,
    cancelRequested: false,
    totalChapters: 12,
    totalContentSize: 1000,
    manifestChapterCount: 12,
    manifestContentSize: 1000,
    manifestWordCount: 900,
    completedChapters: 12,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    ...overrides,
  }
}

const originalLocaleState = useLocaleStore.getState()
const originalProjectState = useProjectStore.getState()
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | undefined
let root: Root | undefined
let invoke: ReturnType<typeof vi.fn>
let recentRuns: ImportRunSnapshot[]

function confirmButton(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    .find(button => button.textContent?.trim() === label)
}

beforeEach(() => {
  recentRuns = [run('run-done'), run('run-cancelled', { status: 'cancelled', stage: 'knowledge' })]
  useLocaleStore.setState({ locale: 'zh-CN', initialized: true })
  useProjectStore.setState({ currentProject: project, fileTree: [], loading: false })
  setActiveProjectSessionContext(PROJECT_SESSION)
  invoke = vi.fn(async (channel: string) => {
    if (channel === 'db:import-run-list-recent') return recentRuns
    if (channel === 'db:import-run-delete') {
      recentRuns = recentRuns.filter(item => item.id !== 'run-done')
      return { success: true }
    }
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
  useLocaleStore.setState(originalLocaleState)
  useProjectStore.setState(originalProjectState)
  vi.restoreAllMocks()
})

async function renderHistory(): Promise<void> {
  await act(async () => {
    root?.render(<ImportRunHistory purpose="reference" />)
  })
}

describe('ImportRunHistory', () => {
  it('loads recent import runs on demand and deletes a record after confirmation', async () => {
    await renderHistory()
    const toggle = container?.querySelector<HTMLButtonElement>('[data-testid="import-run-history-toggle"]')
    expect(toggle).toBeTruthy()
    expect(container?.textContent).not.toContain('run-done')

    await act(async () => toggle!.click())
    await vi.waitFor(() => {
      expect(container?.textContent).toContain('run-done.txt')
      expect(container?.textContent).toContain('已完成')
      expect(container?.textContent).toContain('12/12')
    })

    const deleteButton = container?.querySelector<HTMLButtonElement>('[data-testid="import-run-history-delete-run-done"]')
    expect(deleteButton).toBeTruthy()
    await act(async () => deleteButton!.click())

    await vi.waitFor(() => {
      expect(confirmButton('删除')).toBeTruthy()
    })
    await act(async () => {
      confirmButton('删除')!.click()
      await new Promise(resolve => setTimeout(resolve, 20))
    })

    await vi.waitFor(() => {
      expect(invoke.mock.calls.some(([channel, id]) => (
        channel === 'db:import-run-delete' && id === 'run-done'
      ))).toBe(true)
    })
    await vi.waitFor(() => {
      expect(container?.textContent).not.toContain('run-done.txt')
    })
    expect(container?.textContent).toContain('run-cancelled.txt')
  })

  it('does not allow deleting a running import record', async () => {
    recentRuns = [run('run-running', { status: 'running', stage: 'knowledge', completedChapters: 3 })]
    await renderHistory()
    const toggle = container?.querySelector<HTMLButtonElement>('[data-testid="import-run-history-toggle"]')
    await act(async () => toggle!.click())
    await vi.waitFor(() => {
      expect(container?.textContent).toContain('run-running.txt')
    })
    const deleteButton = container?.querySelector<HTMLButtonElement>('[data-testid="import-run-history-delete-run-running"]')
    expect(deleteButton?.disabled).toBe(true)
  })
})
