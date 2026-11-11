import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BookOpen,
  Check,
  ListChecks,
  MoreHorizontal,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useProjectStore } from '../../stores/project-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useLayoutStore } from '../../stores/layout-store'
import { useCharacterStore } from '../../stores/character-store'
import { ipc } from '../../services/ipc-client'
import { clearProjectData } from '../../services/project-clear-service'
import type { ProjectSessionContext } from '../../shared/ipc-channels'
import {
  projectSessionContextFromProject,
  sameProjectPathKey,
  sameProjectSessionContext,
} from '../../shared/project-session-context'
import {
  loadDirectoryBlueprints,
  saveChapterBlueprint,
  saveAllBlueprints,
  type ChapterBlueprint,
  type DirectoryWorkflowParams,
} from '../../services/workflows/directory-workflow'
import { launchCreativeWorkflow } from '../../services/workflows/creative-workflow-launcher'
import { guardDirectoryGeneration } from '../../services/workflow-guards'
import DirectoryConfigDialog from '../dialogs/DirectoryConfigDialog'
import BatchChapterCreationDialog from '../dialogs/BatchChapterCreationDialog'
import { Button } from '../ui/Button'
import { MenuItem } from '../ui/MenuItem'
import { toast } from '../ui/Toast'
import { confirm } from '../ui/Confirm'
import { globalEventBus } from '../../shared/event-bus'
import { shouldRefreshBlueprints } from './blueprint-refresh'
import { useLocaleStore } from '../../stores/locale-store'
import { registerEditorExitSaveHandler } from '../../stores/editor-store'
import { composeEditorDraftTabWriter } from '../../stores/project-editor-draft-ledger'
import {
  captureBlueprintSnapshots,
  getChapterCardProjectDraft,
  persistChapterCardDraftLedger,
  refreshChapterCardDraftFromRemote,
  reconcileClearedBlueprintSnapshots,
  reconcileDeletedBlueprintSnapshots,
  reconcileSavedBlueprintSnapshots,
  updateEditableChapterBlueprintField,
  updateChapterCardProjectDraft,
  type DraftState,
  type EditableChapterBlueprintField,
} from '../../stores/chapter-card-draft-ledger'
import { LatestRequestGate } from './latest-request-gate'
import { readAuthoritativeNextChapter } from '../../services/authoritative-chapter-sequence'
import {
  ROLE_ORDER,
  createEmptyBlueprint,
  currentProjectSessionForPath,
  emitBlueprintResourceRefresh,
  errorMessage,
  isCurrentProjectSession,
  isLoadedCurrentSession,
  isRenderableProjectSession,
  matchingDataProjectSession,
  readDraftLedgerFromFixedTab,
  recoveryChapterFromSequenceError,
  roleLabel,
} from './chapter-card-shared'
import { ChapterCardForm } from './ChapterCardForm'

interface ChapterCardEditorProps {
  projectKey: string
  initialChapterNumber?: number
}

type AutoSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'
type LedgerDensity = 'read' | 'compact'

const AUTO_SAVE_DELAY_MS = 700
const FILTER_ALL = 'all'
const FILTER_GUIDANCE = 'guidance'

/** 章节蓝图编辑器 — 连续分章剧本手稿 */
export default function ChapterCardEditor({
  projectKey,
  initialChapterNumber,
}: ChapterCardEditorProps) {
  const text = useLocaleStore(s => s.text)
  const locale = useLocaleStore(s => s.locale)
  const currentProject = useProjectStore(s => s.currentProject)
  const characterCards = useCharacterStore(s => s.characters)
  const characterLoaded = useCharacterStore(s => s.loaded)
  const characterProjectSession = useCharacterStore(s => s.dataProjectSession)
  const addLog = useWorkflowStore.getState().addLog

  const [blueprints, setBlueprints] = useState<ChapterBlueprint[]>([])
  const [saving, setSaving] = useState(false)
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>('idle')
  const [loading, setLoading] = useState(true)
  const [dirtyChapterNumbers, setDirtyChapterNumbers] = useState<Set<number>>(() => new Set())
  const blueprintsRef = useRef<ChapterBlueprint[]>([])
  const dirtyChapterNumbersRef = useRef<Set<number>>(new Set())
  const [dataProjectSession, setDataProjectSession] = useState<ProjectSessionContext | null>(null)
  const dataProjectSessionRef = useRef<ProjectSessionContext | null>(null)
  const loadRequestGateRef = useRef(new LatestRequestGate())

  const [density, setDensity] = useState<LedgerDensity>('read')
  const [roleFilter, setRoleFilter] = useState<string>(FILTER_ALL)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingChapterNumber, setEditingChapterNumber] = useState<number | null>(null)
  const [activeTocChapter, setActiveTocChapter] = useState<number | null>(null)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)

  const pageRef = useRef<HTMLDivElement>(null)
  const headerMenuRef = useRef<HTMLDivElement>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveInFlightRef = useRef(false)
  const saveQueuedRef = useRef(false)
  const mountedRef = useRef(true)

  const currentProjectSession = projectSessionContextFromProject(currentProject)
  const renderedProjectId = currentProjectSession?.projectId ?? null
  const renderedProjectPath = currentProjectSession?.projectPath ?? null
  const projectMatches = sameProjectPathKey(currentProjectSession?.projectPath, projectKey)
  const projectDataReady = Boolean(
    projectMatches
    && sameProjectSessionContext(currentProjectSession, dataProjectSession),
  )

  const [nextWriteChapter, setNextWriteChapter] = useState<number | null>(null)
  const [authorityError, setAuthorityError] = useState<string | null>(null)
  const [legacyImportedTextRecoveryChapter, setLegacyImportedTextRecoveryChapter] = useState<number | null>(null)
  const [showBlueprintDialog, setShowBlueprintDialog] = useState(false)
  const [showBatchCreationDialog, setShowBatchCreationDialog] = useState(false)
  const [recoveringLegacyImportedText, setRecoveringLegacyImportedText] = useState(false)

  const characterSuggestions = useMemo(() => {
    if (!characterLoaded || !currentProjectSession) return []
    if (!sameProjectSessionContext(characterProjectSession, currentProjectSession)) return []
    return characterCards.map(card => card.name).filter(Boolean)
  }, [characterCards, characterLoaded, characterProjectSession, currentProjectSession])

  useEffect(() => {
    if (!headerMenuOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(event.target as Node)) {
        setHeaderMenuOpen(false)
      }
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setHeaderMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [headerMenuOpen])

  const scrollToChapter = useCallback((chapterNumber: number) => {
    setActiveTocChapter(chapterNumber)
    requestAnimationFrame(() => {
      document
        .getElementById(`chapter-ledger-entry-${chapterNumber}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  useEffect(() => {
    if (loading || initialChapterNumber === undefined) return
    const exists = blueprintsRef.current.some(
      blueprint => blueprint.chapterNumber === initialChapterNumber,
    )
    if (exists) {
      setRoleFilter(FILTER_ALL)
      setSearchQuery('')
      setDensity('read')
      scrollToChapter(initialChapterNumber)
    }
  }, [initialChapterNumber, loading, scrollToChapter])

  const applyVisibleDraftState = useCallback((nextBlueprints: ChapterBlueprint[], nextDirty: Set<number>): void => {
    blueprintsRef.current = nextBlueprints
    dirtyChapterNumbersRef.current = nextDirty
    setBlueprints(nextBlueprints)
    setDirtyChapterNumbers(nextDirty)
  }, [])

  const persistProjectDraftState = useCallback((
    projectKey: string,
    projectSession: ProjectSessionContext,
    nextBlueprints: ChapterBlueprint[],
    nextDirty: Set<number>,
  ): void => {
    if (!isLoadedCurrentSession(projectSession, dataProjectSessionRef.current)) return
    const ledger = updateChapterCardProjectDraft(
      readDraftLedgerFromFixedTab(),
      projectKey,
      nextBlueprints,
      nextDirty,
    )
    persistChapterCardDraftLedger(composeEditorDraftTabWriter(), ledger)
    applyVisibleDraftState(nextBlueprints, nextDirty)
  }, [applyVisibleDraftState])

  const currentWorkingState = useCallback((
    projectKey: string,
    projectSession: ProjectSessionContext,
  ): DraftState => {
    if (isLoadedCurrentSession(projectSession, dataProjectSessionRef.current)) {
      return {
        blueprints: blueprintsRef.current,
        dirtyChapterNumbers: dirtyChapterNumbersRef.current,
      }
    }
    const draft = getChapterCardProjectDraft(readDraftLedgerFromFixedTab(), projectKey)
    return {
      blueprints: draft?.blueprints ?? [],
      dirtyChapterNumbers: new Set(draft?.dirtyChapterNumbers ?? []),
    }
  }, [])

  const clearAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
  }, [])

  const persistDirtyBlueprints = useCallback(async (forceAll = false): Promise<void> => {
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true
      return
    }
    if (!projectMatches) return
    const projectSession = matchingDataProjectSession(projectKey, dataProjectSessionRef.current)
    if (!projectSession) return

    saveInFlightRef.current = true
    if (mountedRef.current) {
      setSaving(true)
      setAutoSaveState('saving')
    }
    try {
      do {
        saveQueuedRef.current = false
        const currentDirty = dirtyChapterNumbersRef.current
        const allBlueprints = blueprintsRef.current
        const dirtyList = forceAll
          ? allBlueprints
          : allBlueprints.filter(bp => currentDirty.has(bp.chapterNumber))
        if (dirtyList.length === 0) break

        let savedSnapshots: ReturnType<typeof captureBlueprintSnapshots>
        if (dirtyList.length === 1 && !forceAll) {
          const selected = dirtyList[0]
          savedSnapshots = captureBlueprintSnapshots([selected])
          await saveChapterBlueprint(selected, projectKey, projectSession)
        } else {
          const saveInput = forceAll ? allBlueprints : dirtyList
          savedSnapshots = captureBlueprintSnapshots(saveInput)
          await saveAllBlueprints(saveInput, projectKey, projectSession)
        }

        if (!isCurrentProjectSession(projectSession)) return
        const current = currentWorkingState(projectKey, projectSession)
        const nextDirty = reconcileSavedBlueprintSnapshots(
          current.blueprints,
          current.dirtyChapterNumbers,
          savedSnapshots,
        )
        persistProjectDraftState(projectKey, projectSession, current.blueprints, nextDirty)
        if (nextDirty.size > 0) {
          saveQueuedRef.current = true
        }
      } while (saveQueuedRef.current)

      if (mountedRef.current) setAutoSaveState('saved')
    } catch (err) {
      if (!isCurrentProjectSession(projectSession)) return
      const message = errorMessage(err)
      addLog('error', text(`自动保存蓝图失败：${message}`, 'Could not save chapter blueprints.'))
      if (mountedRef.current) setAutoSaveState('error')
    } finally {
      saveInFlightRef.current = false
      if (mountedRef.current) setSaving(false)
    }
  }, [addLog, currentWorkingState, persistProjectDraftState, projectKey, projectMatches, text])

  const persistRef = useRef(persistDirtyBlueprints)
  useEffect(() => {
    persistRef.current = persistDirtyBlueprints
  }, [persistDirtyBlueprints])

  const scheduleAutoSave = useCallback(() => {
    if (!mountedRef.current) return
    setAutoSaveState('pending')
    clearAutoSaveTimer()
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null
      void persistRef.current(false)
    }, AUTO_SAVE_DELAY_MS)
  }, [clearAutoSaveTimer])

  const markChapterDirty = useCallback((
    nextBlueprints: ChapterBlueprint[],
    chapterNumber: number,
  ): void => {
    if (!projectMatches) return
    const projectSession = matchingDataProjectSession(projectKey, dataProjectSessionRef.current)
    if (!projectSession) return
    const nextDirty = new Set(dirtyChapterNumbersRef.current)
    nextDirty.add(chapterNumber)
    persistProjectDraftState(projectKey, projectSession, nextBlueprints, nextDirty)
  }, [projectKey, projectMatches, persistProjectDraftState])

  const loadBlueprints = useCallback(async (): Promise<void> => {
    function clearLoadedState(): void {
      dataProjectSessionRef.current = null
      setDataProjectSession(null)
      setNextWriteChapter(null)
      setAuthorityError(null)
      setLegacyImportedTextRecoveryChapter(null)
      setSaving(false)
      setAutoSaveState('idle')
      clearAutoSaveTimer()
      applyVisibleDraftState([], new Set())
    }

    const projectSession = currentProjectSessionForPath(projectKey)
    if (!isRenderableProjectSession(
      projectSession,
      projectMatches,
      renderedProjectId,
      renderedProjectPath,
    )) {
      loadRequestGateRef.current.begin()
      clearLoadedState()
      setLoading(false)
      return
    }
    const activeSession: ProjectSessionContext = projectSession
    const requestId = loadRequestGateRef.current.begin()
    function isLatestProjectRequest(): boolean {
      return loadRequestGateRef.current.isLatest(requestId)
        && isCurrentProjectSession(activeSession)
    }
    setLoading(true)
    setLegacyImportedTextRecoveryChapter(null)
    if (!sameProjectSessionContext(dataProjectSessionRef.current, activeSession)) {
      clearLoadedState()
    }
    try {
      const restored = await refreshChapterCardDraftFromRemote({
        projectKey,
        loadRemote: () => loadDirectoryBlueprints(projectKey, activeSession),
        readLedger: readDraftLedgerFromFixedTab,
        isProjectCurrent: isLatestProjectRequest,
        commit: (state, restoredDraft) => {
          dataProjectSessionRef.current = activeSession
          setDataProjectSession(activeSession)
          if (restoredDraft) {
            persistProjectDraftState(
              projectKey,
              activeSession,
              state.blueprints,
              state.dirtyChapterNumbers,
            )
          } else {
            applyVisibleDraftState(state.blueprints, state.dirtyChapterNumbers)
          }
        },
      })
      if (!restored || !isLatestProjectRequest()) return
      if (restored.blueprints.length > 0) {
        setActiveTocChapter(prev => (
          prev !== null && restored.blueprints.some(bp => bp.chapterNumber === prev)
            ? prev
            : restored.blueprints[0].chapterNumber
        ))
        if (restored.dirtyChapterNumbers.size > 0) {
          setAutoSaveState('pending')
        }
      }
      try {
        const nextChapter = await readAuthoritativeNextChapter(activeSession, locale)
        if (!isLatestProjectRequest()) return
        setAuthorityError(null)
        setLegacyImportedTextRecoveryChapter(null)
        setNextWriteChapter(nextChapter)
      } catch (error) {
        if (!isLatestProjectRequest()) return
        setAuthorityError(errorMessage(error))
        setLegacyImportedTextRecoveryChapter(recoveryChapterFromSequenceError(error))
        setNextWriteChapter(null)
      }
    } catch (error) {
      if (isLatestProjectRequest()) {
        setAuthorityError(errorMessage(error))
        addLog('error', text('读取章节蓝图失败', 'Could not load chapter blueprints'))
      }
    } finally {
      if (isLatestProjectRequest()) setLoading(false)
    }
  }, [
    projectKey,
    projectMatches,
    renderedProjectId,
    renderedProjectPath,
    addLog,
    text,
    locale,
    applyVisibleDraftState,
    persistProjectDraftState,
    clearAutoSaveTimer,
  ])

  useEffect(() => {
    let mounted = true
    Promise.resolve().then(() => { if (mounted) loadBlueprints() })
    return () => { mounted = false }
  }, [loadBlueprints, projectKey])

  useEffect(() => {
    const unsubscribers = [
      globalEventBus.on('WORKFLOW_COMPLETE', (payload) => {
        if (
          payload.type === 'directory'
          && sameProjectSessionContext(
            payload.projectSession,
            currentProjectSessionForPath(projectKey),
          )
        ) {
          loadBlueprints()
        }
      }),
      globalEventBus.on('FINALIZE_COMPLETE', ({ projectPath, projectSession }) => {
        if (
          !sameProjectPathKey(projectPath, projectKey)
          || !sameProjectSessionContext(projectSession, currentProjectSessionForPath(projectKey))
        ) return
        loadBlueprints()
      }),
      globalEventBus.on('REFRESH_RESOURCE', (payload) => {
        if (
          sameProjectSessionContext(
            payload.projectSession,
            currentProjectSessionForPath(projectKey),
          )
          && shouldRefreshBlueprints(payload.resources)
        ) {
          loadBlueprints()
        }
      }),
    ]
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [loadBlueprints, projectKey])

  const exitSaveRef = useRef<() => Promise<void>>(async () => undefined)
  useEffect(() => {
    exitSaveRef.current = async () => {
      clearAutoSaveTimer()
      await persistRef.current(true)
    }
  })

  useEffect(() => {
    registerEditorExitSaveHandler({
      type: 'chapter-card',
      projectKey,
      save: () => exitSaveRef.current(),
    })
  }, [projectKey])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
        void persistRef.current(false)
      }
    }
  }, [])

  function updateField<K extends EditableChapterBlueprintField>(
    chapterNumber: number,
    key: K,
    value: ChapterBlueprint[K],
  ): void {
    const nextBlueprints = blueprintsRef.current.map(blueprint => (
      blueprint.chapterNumber === chapterNumber
        ? updateEditableChapterBlueprintField(blueprint, key, value)
        : blueprint
    ))
    markChapterDirty(nextBlueprints, chapterNumber)
    scheduleAutoSave()
  }

  function handleDoneEdit(): void {
    setEditingChapterNumber(null)
    if (autoSaveTimerRef.current) {
      clearAutoSaveTimer()
      void persistRef.current(false)
    }
  }

  function handleAddChapter(): void {
    if (
      !projectMatches
      || !matchingDataProjectSession(projectKey, dataProjectSessionRef.current)
    ) return
    if (nextWriteChapter === null) {
      toast.warning(authorityError || text(
        '当前无法确定权威下一章，请先修复定稿章节。',
        'The authoritative next chapter is unavailable. Repair finalized chapters first.',
      ))
      return
    }
    const currentBlueprints = blueprintsRef.current
    const authoritativeBlueprintExists = currentBlueprints.some(
      blueprint => blueprint.chapterNumber === nextWriteChapter,
    )
    let chapterNumber = nextWriteChapter
    if (authoritativeBlueprintExists) {
      chapterNumber = Math.max(
        nextWriteChapter,
        ...currentBlueprints.map(blueprint => blueprint.chapterNumber),
      ) + 1
    }
    const newBlueprint = createEmptyBlueprint(chapterNumber)
    markChapterDirty([...currentBlueprints, newBlueprint], newBlueprint.chapterNumber)
    setRoleFilter(FILTER_ALL)
    setSearchQuery('')
    setDensity('read')
    setEditingChapterNumber(newBlueprint.chapterNumber)
    scrollToChapter(newBlueprint.chapterNumber)
    if (authoritativeBlueprintExists) {
      toast.info(text(
        `第 ${nextWriteChapter} 章蓝图已存在，已新增第 ${chapterNumber} 章；写作入口仍为第 ${nextWriteChapter} 章。`,
        `The Chapter ${nextWriteChapter} blueprint already exists. Added Chapter ${chapterNumber}; the writing entry remains Chapter ${nextWriteChapter}.`,
      ))
    }
  }

  async function handleDeleteChapter(selected: ChapterBlueprint): Promise<void> {
    if (!projectMatches) return
    const projectSession = matchingDataProjectSession(projectKey, dataProjectSessionRef.current)
    if (!projectSession) return
    const deletedSnapshots = captureBlueprintSnapshots([selected])
    const ok = await confirm(text(
      `确认删除第 ${selected.chapterNumber} 章蓝图？\n此操作不可撤销。`,
      `Delete the blueprint for Chapter ${selected.chapterNumber}?\nThis cannot be undone.`,
    ), {
      title: text('删除章节蓝图', 'Delete chapter blueprint'),
      confirmText: text('删除', 'Delete'),
      danger: true,
    })
    if (!ok || !isCurrentProjectSession(projectSession)) return
    const result = await ipc.invokeWithProjectSession(
      projectSession,
      'db:blueprint-delete',
      selected.chapterNumber,
      projectKey,
    )
    if (!isCurrentProjectSession(projectSession)) return
    if (!result.success) {
      toast.error(text(`删除失败\n\n${result.error ?? '未知错误'}`, 'Could not delete the chapter blueprint.'))
      return
    }
    const current = currentWorkingState(projectKey, projectSession)
    const next = reconcileDeletedBlueprintSnapshots(
      current.blueprints,
      current.dirtyChapterNumbers,
      deletedSnapshots,
    )
    persistProjectDraftState(projectKey, projectSession, next.blueprints, next.dirtyChapterNumbers)
    if (next.dirtyChapterNumbers.size === 0) {
      clearAutoSaveTimer()
      setAutoSaveState('idle')
    }
    if (isCurrentProjectSession(projectSession)) {
      if (editingChapterNumber === selected.chapterNumber) setEditingChapterNumber(null)
      if (activeTocChapter === selected.chapterNumber) {
        setActiveTocChapter(next.blueprints[0]?.chapterNumber ?? null)
      }
    }
    emitBlueprintResourceRefresh(projectKey, projectSession)
    toast.success(text(`已删除第 ${selected.chapterNumber} 章蓝图`, `Deleted the blueprint for Chapter ${selected.chapterNumber}`))
  }

  async function handleClearAllBlueprints(): Promise<void> {
    if (!projectMatches || blueprints.length === 0) return
    const projectSession = matchingDataProjectSession(projectKey, dataProjectSessionRef.current)
    if (!projectSession) return
    const clearedSnapshots = captureBlueprintSnapshots(blueprintsRef.current)
    const ok = await confirm(text(
      `确认清空全部 ${blueprints.length} 章蓝图？\n此操作不可撤销，但不会删除草稿或正文章节。`,
      `Clear all ${blueprints.length} chapter blueprints?\nThis cannot be undone, but drafts and manuscript chapters will remain.`,
    ), {
      title: text('清空全部蓝图', 'Clear all blueprints'),
      confirmText: text('清空全部', 'Clear all'),
      danger: true,
    })
    if (!ok || !isCurrentProjectSession(projectSession)) return

    const result = await ipc.invokeWithProjectSession(
      projectSession,
      'db:blueprint-clear-all',
      projectKey,
    )
    if (!isCurrentProjectSession(projectSession)) return
    if (!result.success) {
      toast.error(text(`清空失败\n\n${result.error ?? '未知错误'}`, 'Could not clear the chapter blueprints.'))
      return
    }
    const current = currentWorkingState(projectKey, projectSession)
    const next = reconcileClearedBlueprintSnapshots(current.blueprints, clearedSnapshots)
    persistProjectDraftState(projectKey, projectSession, next.blueprints, next.dirtyChapterNumbers)
    if (next.dirtyChapterNumbers.size === 0) {
      clearAutoSaveTimer()
      setAutoSaveState('idle')
    }
    if (isCurrentProjectSession(projectSession)) {
      setEditingChapterNumber(null)
      setActiveTocChapter(null)
    }
    emitBlueprintResourceRefresh(projectKey, projectSession)
    toast.success(text('已清空全部蓝图', 'All chapter blueprints cleared'))
  }

  async function handleBatchGenerate(params: DirectoryWorkflowParams): Promise<void> {
    const projectSession = currentProjectSessionForPath(projectKey)
    if (!projectMatches || !projectSession) {
      throw new Error(text('项目会话已切换，未启动章节蓝图生成', 'The project changed, so blueprint generation was not started.'))
    }

    const guard = await guardDirectoryGeneration(projectKey, projectSession)
    if (!isCurrentProjectSession(projectSession)) return
    if (!guard.ok) {
      addLog('error', text(`前置条件未满足：${guard.message}`, 'A required precondition is not met.'))
      throw new Error(guard.message || text('章节蓝图生成前置条件未满足', 'Blueprint prerequisites are not met.'))
    }
    if (guard.message) {
      const yes = await confirm(text(
        `${guard.message}\n\n是否仍要继续生成？`,
        'A precondition warning was reported. Continue generating anyway?',
      ), {
        title: text('前置条件警告', 'Precondition warning'),
        confirmText: text('继续生成', 'Continue'),
      })
      if (!yes) throw new Error(text('已取消启动章节蓝图生成', 'Blueprint generation was cancelled.'))
    }

    if (!isCurrentProjectSession(projectSession)) {
      addLog('error', text('项目已切换，未启动章节蓝图生成', 'The project changed, so chapter blueprint generation was not started.'))
      throw new Error(text('项目已切换，未启动章节蓝图生成', 'The project changed, so chapter blueprint generation was not started.'))
    }
    await launchCreativeWorkflow({ workflow: 'generate_blueprint', params }, projectSession)
    addLog('info', text('已启动章节蓝图生成', 'Chapter blueprint generation started'))
  }

  function handleWriteChapter(bp: ChapterBlueprint): void {
    if (!matchingDataProjectSession(projectKey, dataProjectSessionRef.current)) return
    useLayoutStore.getState().openChapterCreation({
      chapterNumber: bp.chapterNumber,
      title: bp.title,
      role: bp.role,
      purpose: bp.purpose,
      keyEvents: bp.keyEvents,
      characters: bp.characters.join('、'),
      userGuidance: bp.userGuidance || '',
    })
  }

  /**
   * 旧版“小说拆解与仿写”曾把参考原文误写为草稿和定稿；此处只给用户一个
   * 明确确认后的恢复入口，不尝试自动判定或删除任何项目内容。
   */
  async function handleClearLegacyImportedText(): Promise<void> {
    if (!projectMatches) return
    const projectSession = matchingDataProjectSession(projectKey, dataProjectSessionRef.current)
    if (!projectSession) return

    const ok = await confirm(text(
      '仅当当前草稿和正文来自旧版“小说拆解与仿写”导入时，才继续清除。\n\n此操作会永久清除草稿、定稿、审稿和摘要等正文产物；会保留角色、故事架构、章节蓝图与知识库。若只是尚未生成下一章蓝图，请取消并先补充蓝图。',
      'Continue only if the current drafts and manuscript text came from a legacy “Novel analysis and imitation” import.\n\nThis permanently clears drafts, final manuscript text, reviews, and summaries. Characters, story architecture, chapter blueprints, and the knowledge base are kept. If the next blueprint is simply missing, cancel and add that blueprint first.',
    ), {
      title: text('清除误导入正文', 'Clear incorrectly imported text'),
      confirmText: text('清除误导入正文', 'Clear incorrectly imported text'),
      danger: true,
    })
    if (!ok || !isCurrentProjectSession(projectSession)) return

    setRecoveringLegacyImportedText(true)
    try {
      await clearProjectData({ generatedText: true }, projectSession)
      if (!isCurrentProjectSession(projectSession)) return
      await loadBlueprints()
      if (!isCurrentProjectSession(projectSession)) return
      toast.success(text(
        '已清除误导入的正文产物；现在可从第 1 章开始写作。',
        'Incorrectly imported text was cleared. You can now start writing from Chapter 1.',
      ))
    } catch (error) {
      if (!isCurrentProjectSession(projectSession)) return
      const message = errorMessage(error)
      toast.error(text(
        `清除误导入正文失败\n\n${message}`,
        `Could not clear incorrectly imported text.\n\n${message}`,
      ))
    } finally {
      if (isCurrentProjectSession(projectSession)) setRecoveringLegacyImportedText(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2" style={{ color: 'var(--color-text-muted)' }}>
        <RefreshCw size={16} className="animate-spin" /> {text('加载章节蓝图...', 'Loading chapter blueprints...')}
      </div>
    )
  }

  if (!projectMatches) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40">
        <BookOpen size={36} />
        <span className="text-sm">{text('此标签属于另一个项目，请切回原项目后继续。', 'This tab belongs to another project. Switch back to continue.')}</span>
      </div>
    )
  }

  const visibleBlueprints = projectDataReady ? blueprints : []
  const nextWritableBlueprint = nextWriteChapter === null
    ? null
    : visibleBlueprints.find(blueprint => blueprint.chapterNumber === nextWriteChapter)
  const canRecoverLegacyImportedText = projectDataReady
    && legacyImportedTextRecoveryChapter !== null

  const availableRoles = (() => {
    const present = new Set(visibleBlueprints.map(bp => bp.role).filter(Boolean))
    const ordered = ROLE_ORDER.filter(role => present.has(role))
    for (const role of present) {
      if (!ordered.includes(role)) ordered.push(role)
    }
    return ordered
  })()

  const hasAnyGuidance = visibleBlueprints.some(bp => Boolean(bp.userGuidance.trim()))
  const trimmedSearch = searchQuery.trim().toLowerCase()
  const filteredBlueprints = visibleBlueprints.filter(bp => {
    if (roleFilter === FILTER_GUIDANCE && !bp.userGuidance.trim()) return false
    if (roleFilter !== FILTER_ALL && roleFilter !== FILTER_GUIDANCE && bp.role !== roleFilter) return false
    if (!trimmedSearch) return true
    return (
      String(bp.chapterNumber).includes(trimmedSearch)
      || bp.title.toLowerCase().includes(trimmedSearch)
      || bp.purpose.toLowerCase().includes(trimmedSearch)
      || bp.keyEvents.toLowerCase().includes(trimmedSearch)
      || bp.suspenseHook.toLowerCase().includes(trimmedSearch)
      || bp.characters.some(c => c.toLowerCase().includes(trimmedSearch))
    )
  })

  const handlePageScroll = () => {
    const container = pageRef.current
    if (!container || filteredBlueprints.length === 0) return
    const threshold = container.getBoundingClientRect().top + 110
    let next = filteredBlueprints[0].chapterNumber
    for (const bp of filteredBlueprints) {
      const element = document.getElementById(`chapter-ledger-entry-${bp.chapterNumber}`)
      if (element && element.getBoundingClientRect().top <= threshold) {
        next = bp.chapterNumber
      }
    }
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 24) {
      next = filteredBlueprints[filteredBlueprints.length - 1].chapterNumber
    }
    setActiveTocChapter(prev => (prev === next ? prev : next))
  }

  const resolvedAutoSaveState: AutoSaveState =
    dirtyChapterNumbers.size > 0 && autoSaveState === 'idle'
      ? 'pending'
      : autoSaveState

  const saveLabel: Record<AutoSaveState, string> = {
    idle: text('已自动保存', 'Saved automatically'),
    saved: text('已自动保存', 'Saved automatically'),
    pending: text('待保存', 'Unsaved'),
    saving: text('保存中…', 'Saving…'),
    error: text('保存失败', 'Save failed'),
  }

  const jumpToWritableChapter = () => {
    if (!nextWritableBlueprint) return
    setRoleFilter(FILTER_ALL)
    setSearchQuery('')
    setDensity('read')
    scrollToChapter(nextWritableBlueprint.chapterNumber)
  }

  return (
    <div className="chapter-ledger-page" ref={pageRef} onScroll={handlePageScroll}>
      <div className="chapter-ledger-sheet">
        <div className="chapter-ledger-head">
          <div className="chapter-ledger-title-row">
            <div>
              <h1 className="chapter-ledger-title">{text('章节蓝图', 'Chapter blueprints')}</h1>
              <p className="chapter-ledger-sub">
                <span>
                  {visibleBlueprints.length > 0
                    ? text(`共 ${visibleBlueprints.length} 章`, `${visibleBlueprints.length} chapters`)
                    : text('尚未规划章节', 'No chapters yet')}
                </span>
                {projectDataReady && nextWritableBlueprint && (
                  <>
                    <span className="chapter-ledger-sep">·</span>
                    <button
                      type="button"
                      className="chapter-ledger-next-link"
                      onClick={jumpToWritableChapter}
                    >
                      {text(
                        `下一待写 第 ${nextWritableBlueprint.chapterNumber} 章`,
                        `Next to write: Chapter ${nextWritableBlueprint.chapterNumber}`,
                      )}
                    </button>
                  </>
                )}
                {visibleBlueprints.length > 0 && (
                  <>
                    <span className="chapter-ledger-sep">·</span>
                    <span
                      className={`chapter-ledger-save ${resolvedAutoSaveState}`}
                      aria-live="polite"
                    >
                      {resolvedAutoSaveState === 'saved' || resolvedAutoSaveState === 'idle'
                        ? <Check size={11} />
                        : null}
                      {saveLabel[resolvedAutoSaveState]}
                    </span>
                  </>
                )}
              </p>
            </div>

            <div className="chapter-ledger-head-actions">
              <Button
                variant="ai"
                size="default"
                onClick={() => setShowBlueprintDialog(true)}
                disabled={!projectDataReady || Boolean(authorityError)}
                title={text('AI 生成章节蓝图', 'Generate chapter blueprints with AI')}
              >
                <Sparkles size={12} />
                {text('AI 生成蓝图', 'AI generate blueprints')}
              </Button>

              {projectDataReady && nextWritableBlueprint && (
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => setShowBatchCreationDialog(true)}
                  title={text(
                    '按连续章节蓝图启动受控批量创作任务（最高10章）',
                    'Start a controlled batch writing task from consecutive chapter blueprints (maximum 10 chapters).',
                  )}
                >
                  <ListChecks size={12} />
                  {text('批量创作', 'Batch write')}
                </Button>
              )}

              <Button
                variant="ghost"
                size="default"
                onClick={handleAddChapter}
                disabled={!projectDataReady || nextWriteChapter === null || Boolean(authorityError)}
                title={text('新建章节', 'New chapter')}
              >
                <Plus size={13} />
                {text('新建章', 'New chapter')}
              </Button>

              <div className="relative" ref={headerMenuRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setHeaderMenuOpen(open => !open)}
                  aria-expanded={headerMenuOpen}
                  aria-label={text('蓝图更多操作', 'More blueprint actions')}
                  title={text('更多操作', 'More actions')}
                >
                  <MoreHorizontal size={15} />
                </Button>
                {headerMenuOpen && (
                  <div className="chapter-ledger-popover" role="menu">
                    <MenuItem
                      label={text('重新加载', 'Reload')}
                      icon={<RefreshCw size={13} />}
                      disabled={loading}
                      onClick={() => {
                        setHeaderMenuOpen(false)
                        void loadBlueprints()
                      }}
                    />
                    <div
                      className="my-1"
                      style={{ height: 1, backgroundColor: 'var(--color-border)' }}
                    />
                    <MenuItem
                      label={text('清空全部蓝图', 'Clear all blueprints')}
                      icon={<Trash2 size={13} />}
                      danger
                      disabled={saving || visibleBlueprints.length === 0 || !projectDataReady}
                      onClick={() => {
                        setHeaderMenuOpen(false)
                        void handleClearAllBlueprints()
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {visibleBlueprints.length > 0 && (
            <div className="chapter-ledger-toolbar">
              <div className="chapter-ledger-filters">
                <button
                  type="button"
                  className={`chapter-ledger-chip${roleFilter === FILTER_ALL ? ' active' : ''}`}
                  onClick={() => setRoleFilter(FILTER_ALL)}
                >
                  {text('全部', 'All')}
                </button>
                {availableRoles.map(role => (
                  <button
                    key={role}
                    type="button"
                    className={`chapter-ledger-chip${roleFilter === role ? ' active' : ''}`}
                    onClick={() => setRoleFilter(role)}
                  >
                    {roleLabel(role, text)}
                  </button>
                ))}
                {(hasAnyGuidance || roleFilter === FILTER_GUIDANCE) && (
                  <button
                    type="button"
                    className={`chapter-ledger-chip${roleFilter === FILTER_GUIDANCE ? ' active' : ''}`}
                    onClick={() => setRoleFilter(FILTER_GUIDANCE)}
                  >
                    {text('有微操', 'Guidance')}
                  </button>
                )}
              </div>

              <div className="chapter-ledger-toolbar-right">
                <div className="chapter-ledger-search">
                  <Search size={12} className="chapter-ledger-search-icon" />
                  <input
                    type="text"
                    className="chapter-ledger-search-input"
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder={text('筛查章名或角色', 'Filter title or cast')}
                    aria-label={text('筛查章节蓝图', 'Filter chapter blueprints')}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="chapter-ledger-search-clear"
                      onClick={() => setSearchQuery('')}
                      aria-label={text('清除搜索', 'Clear filter')}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>

                <div className="chapter-ledger-seg" role="group" aria-label={text('视图密度', 'View density')}>
                  <button
                    type="button"
                    className={`chapter-ledger-seg-btn${density === 'read' ? ' active' : ''}`}
                    onClick={() => setDensity('read')}
                  >
                    {text('细纲阅读', 'Detail')}
                  </button>
                  <button
                    type="button"
                    className={`chapter-ledger-seg-btn${density === 'compact' ? ' active' : ''}`}
                    onClick={() => {
                      setEditingChapterNumber(null)
                      setDensity('compact')
                    }}
                  >
                    {text('紧凑提纲', 'Outline')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {canRecoverLegacyImportedText && (
          <div className="chapter-ledger-banner">
            <div className="flex min-w-0 items-start gap-2" style={{ color: 'var(--color-text-secondary)' }}>
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-warning)' }} />
              <p className="max-w-3xl leading-5">
                {text(
                  `检测到后续正文但第 ${legacyImportedTextRecoveryChapter} 章尚未写作，可能是旧版“小说拆解与仿写”误导入的参考原文。系统不会自动清除任何内容；确认“清除误导入正文”后会保留角色、故事架构、章节蓝图与知识库，并可从第 ${legacyImportedTextRecoveryChapter} 章开始写作。`,
                  `Later manuscript text exists while Chapter ${legacyImportedTextRecoveryChapter} has not been written. This may be reference text incorrectly imported by a legacy “Novel analysis and imitation” workflow. Nothing is cleared automatically; after you confirm “Clear incorrectly imported text”, characters, story architecture, chapter blueprints, and the knowledge base are kept, and you can start writing from Chapter ${legacyImportedTextRecoveryChapter}.`,
                )}
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearLegacyImportedText}
              disabled={recoveringLegacyImportedText}
            >
              <Trash2 size={12} />
              {recoveringLegacyImportedText
                ? text('清除中...', 'Clearing...')
                : text('清除误导入正文', 'Clear incorrectly imported text')}
            </Button>
          </div>
        )}

        {projectDataReady && authorityError && !canRecoverLegacyImportedText && (
          <div
            className="chapter-ledger-banner"
            style={{ color: 'var(--color-warning-text)' }}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-warning)' }} />
              <p className="leading-5">{authorityError}</p>
            </div>
          </div>
        )}

        <DirectoryConfigDialog
          isOpen={showBlueprintDialog}
          onClose={() => setShowBlueprintDialog(false)}
          existingCount={visibleBlueprints.length}
          onConfirm={handleBatchGenerate}
        />
        <BatchChapterCreationDialog
          isOpen={showBatchCreationDialog}
          startChapterNumber={nextWritableBlueprint?.chapterNumber ?? null}
          onClose={() => setShowBatchCreationDialog(false)}
        />

        {visibleBlueprints.length === 0 ? (
          <div className="chapter-ledger-empty-sheet">
            <BookOpen size={30} style={{ opacity: 0.45 }} />
            <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {text('暂无蓝图', 'No blueprints yet')}
            </div>
            <p className="max-w-md text-xs leading-relaxed">
              {text(
                '可用「AI 生成蓝图」按故事架构批量拆解细纲，或点击右上角手动新建一章。',
                'Use AI generate blueprints to outline from your story architecture, or create a chapter manually.',
              )}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="ai"
                size="default"
                onClick={() => setShowBlueprintDialog(true)}
                disabled={!projectDataReady || Boolean(authorityError)}
              >
                <Sparkles size={12} />
                {text('AI 生成蓝图', 'AI generate blueprints')}
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={handleAddChapter}
                disabled={!projectDataReady || nextWriteChapter === null || Boolean(authorityError)}
              >
                <Plus size={12} />
                {text('手动新建', 'Create manually')}
              </Button>
            </div>
          </div>
        ) : filteredBlueprints.length === 0 ? (
          <div className="chapter-ledger-empty-sheet">
            <Search size={26} style={{ opacity: 0.4 }} />
            <p className="text-xs">
              {text('没有符合当前筛选条件的章节蓝图。', 'No chapter blueprints match the current filter.')}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRoleFilter(FILTER_ALL)
                setSearchQuery('')
              }}
            >
              {text('重置筛选', 'Reset filters')}
            </Button>
          </div>
        ) : (
          <div className="chapter-ledger-body">
            <nav
              className="chapter-ledger-toc"
              aria-label={text('章节目录', 'Chapter index')}
            >
              <div className="chapter-ledger-toc-head">
                <span>{text('目录', 'Index')}</span>
                <span className="chapter-ledger-toc-count">
                  {text(`${filteredBlueprints.length} 章`, `${filteredBlueprints.length}`)}
                </span>
              </div>
              {filteredBlueprints.map(bp => {
                const isActive = activeTocChapter === bp.chapterNumber
                  || (activeTocChapter === null && bp.chapterNumber === filteredBlueprints[0].chapterNumber)
                return (
                  <button
                    key={bp.chapterNumber}
                    type="button"
                    className={`chapter-ledger-toc-item${isActive ? ' active' : ''}`}
                    onClick={() => {
                      if (density === 'compact') {
                        setDensity('read')
                        setEditingChapterNumber(null)
                      }
                      scrollToChapter(bp.chapterNumber)
                    }}
                  >
                    <span className="chapter-ledger-toc-num">
                      {String(bp.chapterNumber).padStart(2, '0')}
                    </span>
                    <span className="chapter-ledger-toc-title">
                      {bp.title || text('未命名', 'Untitled')}
                    </span>
                    {bp.userGuidance.trim() && (
                      <span
                        className="chapter-ledger-toc-dot"
                        title={text('已有作者微操指导', 'Author guidance is available')}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                )
              })}
            </nav>

            <div className="chapter-ledger-stream">
              {filteredBlueprints.map(bp => {
                const isNextWritable = Boolean(
                  projectDataReady
                  && nextWritableBlueprint
                  && bp.chapterNumber === nextWritableBlueprint.chapterNumber,
                )
                const entryMode = editingChapterNumber === bp.chapterNumber
                  ? 'edit'
                  : density

                return (
                  <ChapterCardForm
                    key={bp.chapterNumber}
                    blueprint={bp}
                    mode={entryMode}
                    isNextWritable={isNextWritable}
                    characterSuggestions={characterSuggestions}
                    writeButton={
                      projectDataReady && nextWritableBlueprint && (
                        bp.chapterNumber === nextWritableBlueprint.chapterNumber ? (
                          <Button
                            variant="ai"
                            size="sm"
                            onClick={() => handleWriteChapter(nextWritableBlueprint)}
                            title={text('以当前蓝图信息生成草稿', 'Create a draft from this blueprint')}
                          >
                            <PenLine size={12} />
                            {text(
                              `写作第${nextWritableBlueprint.chapterNumber}章`,
                              `Write Chapter ${nextWritableBlueprint.chapterNumber}`,
                            )}
                          </Button>
                        ) : null
                      )
                    }
                    onStartEdit={() => {
                      setDensity('read')
                      setEditingChapterNumber(bp.chapterNumber)
                      setActiveTocChapter(bp.chapterNumber)
                    }}
                    onDoneEdit={handleDoneEdit}
                    onUpdateField={updateField}
                    onDeleteChapter={selected => void handleDeleteChapter(selected)}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
