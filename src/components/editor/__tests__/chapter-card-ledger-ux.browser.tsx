import '../../../index.css'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { ProjectData } from '../../../shared/ipc-channels'
import type { ChapterBlueprint } from '../../../services/blueprint-domain'
import { setActiveProjectSessionContext } from '../../../shared/project-session-context'
import { resetEditorSessionStores, useEditorStore } from '../../../stores/editor-store'
import { useCharacterStore } from '../../../stores/character-store'
import { useLayoutStore } from '../../../stores/layout-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import ChapterCardEditor from '../ChapterCardEditor'

const PROJECT_PATH = 'C:\\novels\\ledger-ux'
const originalEditorState = useEditorStore.getState()
const originalLayoutState = useLayoutStore.getState()
const originalProjectState = useProjectStore.getState()
const originalLocaleState = useLocaleStore.getState()
const originalCharacterState = useCharacterStore.getState()

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

function project(): ProjectData {
  return {
    id: 'ledger-ux',
    name: '危楼回魂',
    path: PROJECT_PATH,
    novelConfig: {
      writingLanguage: 'zh-CN',
      genre: '悬疑',
      subGenre: '',
      targetAudience: '全龄',
      totalChapters: 20,
      wordsPerChapter: 3000,
      plotStructure: 'three_act',
      narrativePOV: 'third_limited',
      coreOutline: '',
      worldSetting: '',
      goldenFinger: '',
      protagonistProfile: '',
      globalGuidance: '',
    },
    characterStates: '',
    createdAt: '',
    updatedAt: '',
  }
}

function sampleBlueprints(): ChapterBlueprint[] {
  return [
    {
      chapterNumber: 1,
      title: '心跳骤停与危楼回魂',
      role: '开端',
      purpose: '交代主角濒死入局，确立绝对冷静人设。',
      keyEvents: '1. 急救室心跳拉平瞬间被摄入深渊。\n2. 危楼4层醒来，看破赵莽破绽。',
      characters: ['陆沉', '赵莽'],
      suspenseHook: '门后传来骨骼摩擦的怪异爬行声。',
      userGuidance: '',
      notes: '',
      notesUpdatedAt: '',
    },
    {
      chapterNumber: 2,
      title: '别过来，我害怕',
      role: '高潮',
      purpose: '完成首次反杀立威。',
      keyEvents: '1. 诱导赵莽触发门后规则。\n2. 夺回沾血扳手。',
      characters: ['陆沉', '林萍'],
      suspenseHook: '门缝底下多了一双朝内的纸鞋。',
      userGuidance: '强化精密动作，全程保持低心率。',
      notes: '赵莽出局；与林萍建立同盟。',
      notesUpdatedAt: '2026-11-10T00:00:00.000Z',
    },
  ]
}

function installIpc(initialBlueprints: ChapterBlueprint[] = sampleBlueprints()) {
  const stored = new Map(initialBlueprints.map(bp => [bp.chapterNumber, bp]))
  const invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
    if (channel === 'db:blueprint-get-all') {
      return [...stored.values()].sort((a, b) => a.chapterNumber - b.chapterNumber)
    }
    if (channel === 'db:blueprint-upsert') {
      const bp = args[0] as ChapterBlueprint
      stored.set(bp.chapterNumber, bp)
      return { success: true }
    }
    if (channel === 'db:blueprint-upsert-many') {
      const list = args[0] as ChapterBlueprint[]
      for (const bp of list) stored.set(bp.chapterNumber, bp)
      return { success: true }
    }
    if (channel === 'db:blueprint-delete') {
      const num = args[0] as number
      stored.delete(num)
      return { success: true }
    }
    if (channel === 'db:blueprint-clear-all') {
      stored.clear()
      return { success: true }
    }
    if (channel === 'db:draft-authority-sequence') {
      return {
        status: 'empty',
        lastChapterNumber: 0,
        nextChapterNumber: 1,
        duplicateChapterNumbers: [],
        authorityFingerprint: 'a'.repeat(64),
      }
    }
    if (channel === 'fs:list-dir') return []
    throw new Error(`unexpected IPC ${channel}`)
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
  return { invoke, stored }
}

async function mountEditor(blueprints?: ChapterBlueprint[]) {
  const ipcMock = installIpc(blueprints)
  const proj = project()
  useLocaleStore.setState({ locale: 'zh-CN' })
  useProjectStore.setState({ currentProject: proj, fileTree: [], loading: false })
  setActiveProjectSessionContext({ projectId: proj.id, projectPath: proj.path })
  useCharacterStore.setState({
    characters: [{ name: '陆沉', role: 'protagonist' } as never, { name: '陈婆', role: 'supporting' } as never],
    loaded: true,
    dataProjectSession: { projectId: proj.id, projectPath: proj.path },
  })
  container = document.createElement('div')
  container.style.width = '1200px'
  container.style.height = '860px'
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<ChapterCardEditor projectKey={PROJECT_PATH} />)
  })
  await vi.waitFor(() => {
    expect(container?.textContent).toContain('心跳骤停与危楼回魂')
  })
  return ipcMock
}

beforeEach(() => {
  resetEditorSessionStores()
})

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  Reflect.deleteProperty(window, 'velaAPI')
  setActiveProjectSessionContext(null)
  useEditorStore.setState(originalEditorState)
  useLayoutStore.setState(originalLayoutState)
  useProjectStore.setState(originalProjectState)
  useLocaleStore.setState(originalLocaleState)
  useCharacterStore.setState(originalCharacterState)
})

describe('ChapterCardEditor continuous script ledger', () => {
  it('renders continuous reading prose without manual save buttons, readonly chapter number inputs, or empty notes boxes', async () => {
    await mountEditor()

    // 没有手动保存与刷新按钮常驻
    expect(page.getByRole('button', { name: '保存', exact: true }).query()).toBeNull()
    expect(page.getByRole('button', { name: '保存全部', exact: true }).query()).toBeNull()
    expect(container?.querySelector('input[type="number"]')).toBeNull()

    // 只有 1 个写作主按钮落在第 1 章旁
    const writeButtons = Array.from(container?.querySelectorAll('button') ?? [])
      .filter(btn => btn.textContent?.includes('写作第'))
    expect(writeButtons).toHaveLength(1)
    expect(writeButtons[0]?.textContent).toContain('写作第1章')

    // 未定稿且无要点的第 1 章不显示要点框，已记录要点的第 2 章展示要点，有微操的第 2 章展示微操
    expect(container?.textContent).toContain('定稿要点：赵莽出局；与林萍建立同盟。')
    expect(container?.textContent).toContain('作者微操')
    expect(container?.textContent).not.toContain('章节要点')
  })

  it('preserves non-standard AI roles like 开端 in inline edit and auto-saves changes', async () => {
    const { invoke, stored } = await mountEditor()

    // 点击第 1 章的编辑按钮
    const editButtons = Array.from(container?.querySelectorAll('button') ?? [])
      .filter(btn => btn.textContent?.trim() === '编辑')
    expect(editButtons.length).toBeGreaterThanOrEqual(2)
    await act(async () => editButtons[0].click())

    // 原有角色定位「开端」应保留而非静默跳成「建置」
    const roleSelect = container?.querySelector<HTMLSelectElement>('select[id="bp-role-1"]')
    expect(roleSelect?.value).toBe('开端')

    // 编辑主角目标并在点击「完成」后立即自动保存落盘
    const goalBox = page.getByRole('textbox', { name: '主角目标' })
    await act(async () => goalBox.fill('开篇即完成濒死反杀测试。'))

    // 添加已有角色库建议人物
    await act(async () => page.getByRole('button', { name: '添加角色' }).click())
    await act(async () => page.getByRole('button', { name: '+ 陈婆' }).click())

    await act(async () => page.getByRole('button', { name: '完成' }).click())

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'db:blueprint-upsert',
        expect.objectContaining({
          chapterNumber: 1,
          role: '开端',
          purpose: '开篇即完成濒死反杀测试。',
          characters: ['陆沉', '赵莽', '陈婆'],
        }),
        PROJECT_PATH,
        expect.objectContaining({ projectPath: PROJECT_PATH }),
      )
    })
    expect(stored.get(1)?.purpose).toBe('开篇即完成濒死反杀测试。')
    expect(container?.textContent).toContain('已自动保存')
  })

  it('filters chapters by role and search, and toggles compact outline density', async () => {
    await mountEditor()

    await act(async () => page.getByRole('button', { name: '高潮', exact: true }).click())
    expect(container?.textContent).toContain('别过来，我害怕')
    expect(container?.textContent).not.toContain('心跳骤停与危楼回魂')

    // 点击「下一待写 第 1 章」快捷重置筛选
    await act(async () => page.getByRole('button', { name: '下一待写 第 1 章' }).click())
    expect(container?.textContent).toContain('心跳骤停与危楼回魂')

    // 切换到紧凑提纲，再点击条目回到细纲编辑态
    await act(async () => page.getByRole('button', { name: '紧凑提纲' }).click())
    expect(container?.querySelectorAll('.chapter-ledger-compact')).toHaveLength(2)

    await act(async () => {
      container?.querySelectorAll<HTMLElement>('.chapter-ledger-compact')[1]?.click()
    })
    expect(container?.querySelector('input[id="bp-title-2"]')).not.toBeNull()
  })

  it('tucks reload, clear all, and delete chapter inside secondary more menus', async () => {
    await mountEditor()

    // 主工作区不直接露出「清空全部蓝图」和「删除此章」
    expect(container?.textContent).not.toContain('清空全部蓝图')
    expect(container?.textContent).not.toContain('删除此章')

    await act(async () => page.getByRole('button', { name: '蓝图更多操作' }).click())
    expect(container?.textContent).toContain('重新加载')
    expect(container?.textContent).toContain('清空全部蓝图')

    const chapterMoreButtons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button[aria-label="章节更多操作"]') ?? [])
    expect(chapterMoreButtons).toHaveLength(2)
    await act(async () => chapterMoreButtons[0].click())
    expect(container?.textContent).toContain('删除此章')
  })
})
