import { useState, useEffect, useCallback, useRef } from 'react'
import { Sparkles, CheckCircle2, Circle, RefreshCw, FileText, BookOpen, AlertTriangle, FolderTree } from 'lucide-react'
import { useProjectStore } from '../../stores/project-store'
import { useLocaleStore } from '../../stores/locale-store'

import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { ipc } from '../../services/ipc-client'

import { handoffToArchitect } from '../../services/agent/assistant-handoff'
import { globalEventBus } from '../../shared/event-bus'
import {
  createProjectArchTabId,
  shouldSyncProjectArchTab,
} from './arch-file-refresh-policy'
import { LatestRequestGate } from './latest-request-gate'
import {
  canExplicitlyRepairCharacterRoster,
  getCharacterRosterRepairPresentation,
} from './character-roster-repair-state'
import { useCharacterRosterRepair } from './use-character-roster-repair'
import {
  captureProjectSession,
  isProjectSessionCurrent,
  isProjectSessionPath,
} from '../project-session-gate'
import type { ProjectSessionContext } from '../../shared/ipc-channels'
import { sameProjectSessionContext } from '../../shared/project-session-context'
import { SettingDocument, SettingSection, DocumentBody } from './SettingSections'

/** 故事架构只包含前提 / 人物 / 环境；情节是同级的独立页面。 */
type ArchStepKey = 'premise' | 'characters' | 'worldbuilding'

const ARCH_FILES: Array<{
  key: ArchStepKey
  fileName: string
  labelZh: string
  labelEn: string
  iconName: string
  descZh: string
  descEn: string
}> = [
    { key: 'premise', fileName: 'premise.md', labelZh: '前提概要', labelEn: 'Story premise', iconName: 'target', descZh: '故事钩子 · 核心冲突链 · 主角优势 · 悬念骨架', descEn: 'Story hook · core conflict · protagonist edge · suspense structure' },
    { key: 'worldbuilding', fileName: 'worldbuilding.md', labelZh: '环境', labelEn: 'Setting', iconName: 'globe', descZh: '核心规则 · 社会结构 · 深层危机', descEn: 'Core rules · social structure · underlying crisis' },
    { key: 'characters', fileName: 'characters.md', labelZh: '人物', labelEn: 'Characters', iconName: 'users', descZh: '角色弧光 · 关系网络 · 矛盾交织', descEn: 'Character arcs · relationships · interlocking tensions' },
  ]

/** 可单块 AI 生成、按顺序解锁的三个步骤。 */
const GENERATABLE_STEPS: ArchStepKey[] = ['premise', 'worldbuilding', 'characters']

/** 故事架构编辑器 — 三块与小说配置同款设置文档 + 单块 AI 生成（情节大纲已拆为独立页面） */
export default function WorldBuildingEditor({ projectKey }: { projectKey: string }) {
  // 精确订阅，避免 novelConfig 等变化导致不必要的 loadStatus 重建
  const currentProject = useProjectStore(s => s.currentProject)
  const text = useLocaleStore(s => s.text)
  const projectMatches = currentProject?.path === projectKey
  const [archStatus, setArchStatus] = useState<Record<string, boolean>>({})
  const [wordCounts, setWordCounts] = useState<Record<string, number>>({})
  const [archTexts, setArchTexts] = useState<Record<string, string>>({})
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const archStatusRequestGate = useRef(new LatestRequestGate())
  const saveTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const {
    snapshot: rosterSnapshot,
    repairError: rosterRepairError,
    isRepairing: extracting,
    refresh: loadCharacterRosterStatus,
    migrate: handleRepairCharacterRoster,
  } = useCharacterRosterRepair({ projectKey, enabled: projectMatches })

  /** 加载各架构文件状态（通过 Service 层获取，不直接调 IPC） */
  const loadStatus = useCallback(async () => {
    await Promise.resolve()
    const projectSession = captureProjectSession(currentProject)
    if (!projectMatches || !projectSession || !isProjectSessionPath(projectSession, projectKey)) {
      archStatusRequestGate.current.begin()
      setArchStatus({})
      setWordCounts({})
      setArchTexts({})
      setLoading(false)
      return
    }
    const projectPath = projectSession.projectPath
    const requestId = archStatusRequestGate.current.begin()
    setLoading(true)
    const core = await ipc.invokeWithProjectSession(
      projectSession,
      'db:project-core-get',
      projectPath,
    )
    const status: Record<string, boolean> = {
      premise: (core?.premise?.length ?? 0) > 50,
      characters: rosterSnapshot?.status === 'ready',
      worldbuilding: (core?.worldbuilding?.length ?? 0) > 50,
    }
    const counts: Record<string, number> = {
      premise: status.premise ? (core?.premise?.length ?? 0) : 0,
      characters: status.characters ? (rosterSnapshot?.renderedMarkdown.length ?? 0) : 0,
      worldbuilding: status.worldbuilding ? (core?.worldbuilding?.length ?? 0) : 0,
    }
    if (
      !archStatusRequestGate.current.isLatest(requestId)
      || !isProjectSessionCurrent(projectSession)
    ) return
    setArchStatus(status)
    setWordCounts(counts)
    setArchTexts({
      premise: core?.premise ?? '',
      worldbuilding: core?.worldbuilding ?? '',
      characters: rosterSnapshot?.renderedMarkdown ?? '',
    })
    setLoading(false)
    // 只依赖 path 字符串，避免 novelConfig 等变化导致 loadStatus 重建
  }, [currentProject, projectKey, projectMatches, rosterSnapshot])

  useEffect(() => {
    const timer = setTimeout(() => { void loadStatus() }, 0)
    return () => clearTimeout(timer)
  }, [loadStatus])

  // 监听 EventBus 事件，刷新后处理状态面板
  useEffect(() => {
    const eventMatchesProjectRun = (payload: {
      projectSession: ProjectSessionContext
      runId: string
    }) =>
      (() => {
        const projectSession = captureProjectSession(currentProject)
        return !!projectSession
          && isProjectSessionCurrent(projectSession)
          && sameProjectSessionContext(projectSession, payload.projectSession)
      })()
      && payload.runId.length > 0
    // 每步架构文件写完后实时刷新状态
    const unsub3 = globalEventBus.on('ARCH_FILE_UPDATED', (payload) => {
      if (!eventMatchesProjectRun(payload)) return
      loadStatus()
      loadCharacterRosterStatus()
    })
    return () => { unsub3() }
  }, [currentProject, loadCharacterRosterStatus, loadStatus, projectKey])

  /** 打开单个架构文件（arch-file 类型；若 tab 已存在则刷新磁盘内容） */
  const openArchFile = async (f: typeof ARCH_FILES[number]) => {
    const projectSession = captureProjectSession(currentProject)
    if (!projectMatches || !projectSession || !isProjectSessionPath(projectSession, projectKey)) return
    const filePath = `vela://core/${f.key}`
    const tabId = createProjectArchTabId(projectKey, filePath)
    let content = ''
    try {
      if (f.key === 'characters') {
        const roster = await loadCharacterRosterStatus()
        if (!roster) return
        content = roster.status === 'ready'
          ? roster.renderedMarkdown
          : roster.legacyMarkdown ?? ''
      } else {
        const core = (await ipc.invokeWithProjectSession(
          projectSession,
          'db:project-core-get',
          projectSession.projectPath,
        )) as Record<string, unknown> | null
        content = (core?.[f.key] as string) || ''
      }
    } catch {
      return
    }
    if (!isProjectSessionCurrent(projectSession)) return

    const { useEditorStore } = await import('../../stores/editor-store')
    if (!isProjectSessionCurrent(projectSession)) return
    const store = useEditorStore.getState()
    const existingTab = store.tabs.find(t => t.id === tabId)
    if (existingTab) {
      store.setActiveTab(tabId)
      if (shouldSyncProjectArchTab(existingTab, projectKey)) {
        store.syncTabContent(tabId, content)
        store.markTabSaved(tabId, content)
      }
    } else {
      store.openFile({
        id: tabId,
        name: text(f.labelZh, f.labelEn),
        type: 'arch-file',
        filePath,
        content,
        savedContent: content,
        projectKey,
      })
    }
  }

  /** 单块 AI 辅助构思：切入架构助手并携带当前板块上下文 */
  const handleGenerateBlock = (key: ArchStepKey) => {
    const projectSession = captureProjectSession(currentProject)
    if (!projectMatches || !projectSession || !isProjectSessionPath(projectSession, projectKey)) return
    if (!isProjectSessionCurrent(projectSession)) return
    handoffToArchitect({
      section: key,
      regenerate: Boolean(archStatus[key]),
    })
  }

  /** 内联编辑保存（防抖写回 project_core） */
  const handleArchTextChange = (key: 'premise' | 'worldbuilding', value: string) => {
    setArchTexts(current => ({ ...current, [key]: value }))
    const projectSession = captureProjectSession(currentProject)
    if (!projectSession || !isProjectSessionPath(projectSession, projectKey)) return
    const existing = saveTimerRef.current.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      saveTimerRef.current.delete(key)
      if (!captureProjectSession(useProjectStore.getState().currentProject)) return
      void ipc.invokeWithProjectSession(
        projectSession,
        'db:project-core-update',
        { [key]: value },
        projectSession.projectPath,
      ).then(() => {
        if (isProjectSessionCurrent(projectSession)) loadStatus()
      }).catch(() => {})
    }, 600)
    saveTimerRef.current.set(key, timer)
  }

  /** 打开架构助手进行整体构思或完善 */
  const openArchitectAssistant = () => {
    const projectSession = captureProjectSession(currentProject)
    if (!projectMatches || !projectSession || !isProjectSessionPath(projectSession, projectKey)) return
    if (!isProjectSessionCurrent(projectSession)) return
    handoffToArchitect({
      section: 'all',
      regenerate: generatedCount > 0,
    })
  }

  if (!projectMatches) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-[var(--color-bg)]">
        <div
          className="flex items-center justify-between gap-2 px-3 h-9 flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-editor-bg)',
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-medium truncate text-[var(--color-text-secondary)]">
              {text('故事架构', 'Story architecture')}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto relative">
          <EmptyState icon={<BookOpen size={36} />} message={text('请先打开项目', 'Open a project to continue')} opacity={0.4} />
        </div>
      </div>
    )
  }

  const generatedCount = ARCH_FILES.filter(f => archStatus[f.key]).length
  const rosterPresentation = getCharacterRosterRepairPresentation(
    rosterSnapshot,
    text,
    rosterRepairError,
  )
  const canRepairRoster = canExplicitlyRepairCharacterRoster(rosterPresentation)

  const sectionProps = (key: 'premise' | 'characters' | 'worldbuilding') => ({
    collapseKey: key,
    title: text(
      ARCH_FILES.find(f => f.key === key)!.labelZh,
      ARCH_FILES.find(f => f.key === key)!.labelEn,
    ),
    desc: text(
      ARCH_FILES.find(f => f.key === key)!.descZh,
      ARCH_FILES.find(f => f.key === key)!.descEn,
    ),
    generated: archStatus[key] ?? false,
    generating: false,
    disabled: loading || !projectMatches,
    wordCount: wordCounts[key] ?? 0,
  })

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 顶部工具栏 */}
      <div
        className="flex items-center justify-between gap-2 px-3 h-10 flex-shrink-0 border-b"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-sidebar)' }}
      >
        <div className="flex items-center gap-1.5">
          <FolderTree size={14} style={{ color: 'var(--color-text-muted)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {text('故事架构', 'Story architecture')}
          </span>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {generatedCount}/{ARCH_FILES.length} {text('已生成', 'generated')}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={loadStatus}
            title={text('刷新状态', 'Refresh status')}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button
            variant="ai"
            size="sm"
            onClick={openArchitectAssistant}
            disabled={loading || !projectMatches}
            title={text('交给架构助手共同构思与完善故事架构', 'Collaborate with the Architect assistant on story architecture')}
          >
            <Sparkles size={12} />
            {text('架构助手构思', 'Plan with architect')}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-8 py-6">
          {/* 前三块：与小说配置同款设置文档 + 单块助手协作 */}
          <SettingDocument>
            {GENERATABLE_STEPS.map(key => {
              const s = sectionProps(key)
              const rosterNeedsAttention = key === 'characters' && rosterPresentation
                && rosterPresentation.kind !== 'ready'
                && rosterPresentation.kind !== 'empty'
              return (
                <SettingSection
                  key={key}
                  title={s.title}
                  collapsed={Boolean(collapsedSections[s.collapseKey])}
                  onToggle={() => setCollapsedSections(current => ({ ...current, [s.collapseKey]: !current[s.collapseKey] }))}
                  generating={false}
                  generateDisabled={s.disabled}
                  onGenerate={s.disabled ? undefined : () => handleGenerateBlock(key)}
                >
                  <div className="flex items-center justify-between gap-3 pt-1 pb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      {s.generated
                        ? <CheckCircle2 size={15} style={{ flexShrink: 0, color: 'var(--color-success)' }} />
                        : <Circle size={15} style={{ flexShrink: 0, color: 'var(--color-text-muted)' }} />}
                      <span className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{s.desc}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {key === 'characters' && rosterPresentation && (
                        <span
                          role="status"
                          className="text-[0.7rem] px-1.5 py-0.5 rounded font-medium"
                          style={{
                            backgroundColor: rosterNeedsAttention
                              ? 'rgba(245, 158, 11, 0.12)'
                              : 'rgba(34, 197, 94, 0.1)',
                            color: rosterNeedsAttention
                              ? 'var(--color-warning-text)'
                              : 'var(--color-success-text)',
                          }}
                        >
                          {rosterPresentation.label}
                        </span>
                      )}
                      {s.wordCount > 0 && (
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {s.wordCount.toLocaleString()} {text('字符', 'characters')}
                        </span>
                      )}
                      <button
                        type="button"
                        className="p-0.5 rounded"
                        title={text('打开完整视图', 'Open full view')}
                        onClick={() => openArchFile(ARCH_FILES.find(f => f.key === key)!)}
                      >
                        <FileText size={13} style={{ color: 'var(--color-text-muted)' }} />
                      </button>
                    </div>
                  </div>
                  <DocumentBody
                    value={archTexts[key] ?? ''}
                    readOnly={key === 'characters' || !projectMatches}
                    placeholder={s.generated
                      ? text('（内容已生成，可直接编辑）', '(Generated — edit directly)')
                      : text(
                        key === 'worldbuilding'
                          ? '点击右上角「架构助手构思」或右侧「AI 生成」一起梳理世界观'
                          : key === 'characters'
                            ? '点击「架构助手构思」创建角色档案'
                            : '点击右上角「架构助手构思」或直接编写前提概要',
                        key === 'worldbuilding'
                          ? 'Click “Plan with architect” above or “Generate” to collaborate on worldbuilding'
                          : key === 'characters'
                            ? 'Click “Plan with architect” to create character profiles'
                            : 'Click “Plan with architect” above or start drafting the premise here',
                      )}
                    onChange={key === 'characters'
                      ? () => {}
                      : (value) => handleArchTextChange(key, value)}
                  />
                  {key === 'characters' && !loading && canRepairRoster && rosterPresentation?.actionLabel && (
                    <div className="pt-1.5">
                      <Button
                        size="sm"
                        disabled={extracting}
                        className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm hover:from-amber-600 hover:to-orange-600 border-none hover:shadow hover:-translate-y-[0.5px] transition-all"
                        onClick={() => void handleRepairCharacterRoster()}
                        title={rosterPresentation.actionTitle}
                      >
                        {extracting
                          ? <RefreshCw size={12} className="animate-spin opacity-90" />
                          : <AlertTriangle size={12} className="opacity-90" />}
                        {extracting ? text('处理中...', 'Working...') : rosterPresentation.actionLabel}
                      </Button>
                    </div>
                  )}
                </SettingSection>
              )
            })}
          </SettingDocument>

        </div>
      </div>
    </div>
  )
}
