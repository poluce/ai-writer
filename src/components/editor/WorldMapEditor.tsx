import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Loader2,
  Map,
  PenLine,
  RefreshCw,
  Save,
  X,
} from 'lucide-react'

import { useProjectStore } from '../../stores/project-store'
import { useLocaleStore } from '../../stores/locale-store'
import { useLLMStore } from '../../stores/llm-store'
import { useLayoutStore } from '../../stores/layout-store'
import { toast } from '../ui/Toast'
import { Button } from '../ui/Button'
import { captureProjectSession, isProjectSessionCurrent } from '../project-session-gate'
import { loadWorldMap, saveWorldMap } from '../../services/world-map-service'
import { GenerateWorldMapCommand } from '../../services/workflows/commands/generate-world-map.command'
import type { StepCallbacks, WorkflowContext } from '../../stores/workflow-store'
import type {
  WorldMapData,
  WorldMapFaction,
  WorldMapRegion,
} from '../../shared/world-map'
import { resolveWritingLanguage } from '../../shared/writing-language'
import WorldMapCanvas from './world-map/WorldMapCanvas'
import { factionTierColor } from './world-map/world-map-layout'

type PageStatus = 'loading' | 'empty' | 'ready' | 'generating' | 'preview' | 'error'

const EMPTY_CONTEXT = [
  { key: 'coreOutline', zh: '核心大纲', en: 'Core outline' },
  { key: 'worldSetting', zh: '世界观', en: 'Worldbuilding' },
  { key: 'goldenFinger', zh: '金手指', en: 'Golden finger' },
  { key: 'protagonistProfile', zh: '主角', en: 'Protagonist' },
] as const

function textValue(value: string | undefined | null): string {
  return value?.trim() ?? ''
}

function factionKindLabel(kind: WorldMapFaction['kind'], text: (zh: string, en: string) => string): string {
  if (kind === 'sect') return text('宗门', 'Sect')
  if (kind === 'dynasty') return text('王朝', 'Dynasty')
  return text('组织', 'Organization')
}

function relationSummary(data: WorldMapData, factionId: string, text: (zh: string, en: string) => string): string[] {
  return data.relations
    .filter(relation => relation.fromFactionId === factionId || relation.toFactionId === factionId)
    .map(relation => {
      const otherId = relation.fromFactionId === factionId ? relation.toFactionId : relation.fromFactionId
      const other = data.factions.find(faction => faction.id === otherId)
      const label = relation.kind === 'ally' ? text('同盟', 'Ally') : relation.kind === 'enemy' ? text('敌对', 'Enemy') : text('中立', 'Neutral')
      return `${label} ${other?.name ?? ''}`.trim()
    })
}

export default function WorldMapEditor({ projectKey }: { projectKey: string }) {
  const text = useLocaleStore(s => s.text)
  const locale = useLocaleStore(s => s.locale)
  const currentProject = useProjectStore(s => s.currentProject)
  const [status, setStatus] = useState<PageStatus>('loading')
  const [data, setData] = useState<WorldMapData | null>(null)
  const [preview, setPreview] = useState<WorldMapData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedFactionId, setSelectedFactionId] = useState<string | undefined>()
  const [generationLogs, setGenerationLogs] = useState<string[]>([])
  const [generationProgress, setGenerationProgress] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [editingFactionId, setEditingFactionId] = useState<string | null>(null)
  const [worldSettingsOpen, setWorldSettingsOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const mountedRef = useRef(true)
  const generationContextRef = useRef<WorkflowContext | null>(null)
  const generationCancelledRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const projectId = currentProject?.id
  const projectPath = currentProject?.path
  const projectSessionEpoch = useProjectStore(s => s.projectSessionEpoch)
  const activeSession = useMemo(() => {
    const session = captureProjectSession(currentProject)
    return session && session.projectPath === projectKey ? session : null
    // 依赖项目身份而不是每次渲染新建的 project 对象，避免加载 effect 自激。
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentProject fields are the identity inputs
  }, [projectId, projectPath, projectSessionEpoch, projectKey])
  const displayData = preview ?? data
  const effectiveSelectedFactionId = selectedFactionId && displayData?.factions.some(faction => faction.id === selectedFactionId)
    ? selectedFactionId
    : displayData?.factions[0]?.id
  const selectedFaction = displayData?.factions.find(faction => faction.id === effectiveSelectedFactionId)
  const selectedRegion = selectedFaction && displayData?.regions.find(region => region.id === selectedFaction.regionId)

  const selectFaction = useCallback((factionId: string) => {
    setSelectedFactionId(factionId)
  }, [])

  useEffect(() => {
    let disposed = false
    if (!activeSession) {
      queueMicrotask(() => { if (!disposed) setStatus('empty') })
      return () => { disposed = true }
    }
    void (async () => {
      try {
        const result = await loadWorldMap(activeSession)
        if (disposed || !isProjectSessionCurrent(activeSession)) return
        if (!result.success) {
          setError(result.error ?? text('世界地图读取失败', 'The world map could not be loaded'))
          setStatus('error')
          return
        }
        if (result.data) {
          setData(result.data)
          setSelectedFactionId(result.data.factions[0]?.id)
          setStatus('ready')
        } else {
          setStatus('empty')
        }
      } catch (loadError) {
        if (disposed) return
        setError(loadError instanceof Error ? loadError.message : String(loadError))
        setStatus('error')
      }
    })()
    return () => { disposed = true }
  }, [activeSession, text])

  const openSettings = () => useLayoutStore.getState().openSettings('llm')

  const generate = async () => {
    if (!activeSession) return
    const effectiveModelId = useLLMStore.getState().resolveTaskModelId('outline')
    if (!effectiveModelId) {
      toast.warning(text('请先在「设置 → AI 生成模型」中配置默认模型', 'Configure an AI model in Settings first.'))
      openSettings()
      return
    }
    if (generating) return

    setGenerating(true)
    setStatus('generating')
    setError(null)
    setPreview(null)
    setGenerationLogs([])
    setGenerationProgress(0)
    generationCancelledRef.current = false

    const context: WorkflowContext = {
      runId: `world-map-${Date.now()}`,
      projectPath: activeSession.projectPath,
      projectSession: activeSession,
      writingLanguage: resolveWritingLanguage(currentProject?.novelConfig?.writingLanguage),
      uiLocale: locale,
      data: {},
      cancelled: false,
      generationModelId: effectiveModelId,
    }
    generationContextRef.current = context
    const callbacks: StepCallbacks = {
      log: (message) => {
        setGenerationLogs(previous => [...previous.slice(-5), message])
      },
      setProgress: (progress) => {
        setGenerationProgress(progress)
      },
      appendText: () => {},
    }

    try {
      const command = new GenerateWorldMapCommand()
      const result = await command.execute({
        step: { id: 'generate-world-map', commandId: 'generate-world-map', name: '世界地图', params: {} },
        context,
        callbacks,
      })
      if (!mountedRef.current || generationCancelledRef.current) return
      if (!isProjectSessionCurrent(activeSession)) return
      setPreview(result)
      setSelectedFactionId(result.factions[0]?.id)
      setStatus('preview')
      toast.success(text('世界地图已生成，确认后再应用', 'World map generated. Review it before applying.'))
    } catch (generationError) {
      if (generationCancelledRef.current) return
      const message = generationError instanceof Error ? generationError.message : String(generationError)
      setError(message)
      setStatus(data ? 'ready' : 'empty')
      toast.error(text(`生成失败：${message}`, `Generation failed: ${message}`))
    } finally {
      if (mountedRef.current) setGenerating(false)
      generationContextRef.current = null
    }
  }

  const cancelGeneration = () => {
    generationCancelledRef.current = true
    if (generationContextRef.current) generationContextRef.current.cancelled = true
    setStatus(data ? 'ready' : 'empty')
    setGenerating(false)
    toast.info(text('已取消世界地图生成', 'World-map generation cancelled.'))
  }

  const applyPreview = async () => {
    if (!activeSession || !preview || saving) return
    setSaving(true)
    try {
      const saved = await saveWorldMap(activeSession, preview)
      if (!saved.success) {
        toast.error(text(`应用失败：${saved.error ?? '未知错误'}`, `Could not apply the map: ${saved.error ?? 'Unknown error'}`))
        return
      }
      if (!isProjectSessionCurrent(activeSession)) return
      setData(saved.data ?? preview)
      setPreview(null)
      setStatus('ready')
      toast.success(text('世界地图已应用', 'World map applied.'))
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }

  const cancelPreview = () => {
    setPreview(null)
    setStatus(data ? 'ready' : 'empty')
  }

  const persistEdit = async (updated: WorldMapData) => {
    if (!activeSession) return false
    setSaving(true)
    try {
      const saved = await saveWorldMap(activeSession, updated)
      if (!saved.success) {
        toast.error(text(`保存失败：${saved.error ?? '未知错误'}`, `Could not save: ${saved.error ?? 'Unknown error'}`))
        return false
      }
      if (!isProjectSessionCurrent(activeSession)) return false
      setData(saved.data ?? updated)
      return true
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }

  const handleEditSave = async (faction: WorldMapFaction) => {
    if (!data) return
    const updated: WorldMapData = {
      ...data,
      factions: data.factions.map(item => item.id === faction.id ? faction : item),
      updatedAt: new Date().toISOString(),
    }
    const saved = await persistEdit(updated)
    if (!saved) return
    setEditingFactionId(null)
    toast.success(text('势力设定已保存', 'Faction details saved.'))
  }

  const handleWorldSettingsSave = async (worldName: string, premise: string) => {
    if (!data) return
    const updated = { ...data, worldName, premise, updatedAt: new Date().toISOString() }
    const saved = await persistEdit(updated)
    if (saved) {
      setWorldSettingsOpen(false)
      toast.success(text('世界设定已保存', 'World details saved.'))
    }
  }

  const contextItems = useMemo(() => {
    const config = currentProject?.novelConfig
    return EMPTY_CONTEXT.map(item => ({
      ...item,
      filled: Boolean(textValue(config?.[item.key])),
    }))
  }, [currentProject?.novelConfig])

  const title = displayData?.worldName
    || (status === 'preview' ? text('世界地图预览', 'World map preview') : text('世界地图', 'World map'))
  const subtitle = displayData?.premise
    || text('从作品设定推演大陆、区域、势力与两套等级阶梯。', 'Derive continents, regions, factions, and two rank ladders from the project settings.')

  return (
    <div className="world-map-page">
      <header className="world-map-head">
        <div className="world-map-heading">
          <div className="world-map-eyebrow">
            <Map size={12} aria-hidden="true" />
            <span>{text('设定', 'Settings')}</span>
            <ChevronRight size={11} aria-hidden="true" />
            <span>{text('世界地图', 'World map')}</span>
          </div>
          <h1 className="world-map-title">{title}</h1>
          <p className="world-map-sub">{subtitle}</p>
        </div>
        <div className="world-map-head-right">
          {displayData && (
            <div className="world-map-meta">
              <span className={`world-map-ai-chip${status === 'preview' ? ' pending' : ''}`}>
                <span className="dot" />
                {status === 'preview' ? text('待应用', 'Ready to apply') : text('AI 生成', 'AI generated')}
              </span>
              <span>{displayData.regions.length} {text('域', 'regions')}</span>
              <span>·</span>
              <span>{displayData.factions.length} {text('宗', 'factions')}</span>
            </div>
          )}
          <div className="world-map-actions">
            {status === 'error' && (
              <Button type="button" variant="outline" onClick={() => void generate()}>
                <RefreshCw size={14} aria-hidden="true" />
                {text('重新生成', 'Regenerate')}
              </Button>
            )}
            {status === 'preview' && (
              <>
                <Button type="button" variant="ghost" onClick={cancelPreview} disabled={saving}>
                  {text('取消', 'Cancel')}
                </Button>
                <Button type="button" onClick={() => void applyPreview()} disabled={saving}>
                  {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                  {text('应用地图', 'Apply map')}
                </Button>
              </>
            )}
            {status === 'ready' && (
              <>
                <Button type="button" variant="ghost" onClick={() => void generate()} disabled={generating}>
                  <RefreshCw size={14} aria-hidden="true" />
                  {text('重新生成', 'Regenerate')}
                </Button>
                <Button
                  type="button"
                  variant={editMode ? 'outline' : 'default'}
                  onClick={() => {
                    setEditMode(value => !value)
                    setEditingFactionId(null)
                    setWorldSettingsOpen(false)
                  }}
                >
                  {editMode ? <Check size={14} /> : <PenLine size={14} />}
                  {editMode ? text('完成校对', 'Done editing') : text('校对世界', 'Proofread world')}
                </Button>
              </>
            )}
            {status === 'generating' && (
              <Button type="button" variant="outline" onClick={cancelGeneration}>
                <X size={14} aria-hidden="true" />
                {text('取消生成', 'Cancel generation')}
              </Button>
            )}
          </div>
        </div>
      </header>

      {status === 'loading' && (
        <div className="world-map-state">
          <Loader2 size={22} className="spin" />
          <p>{text('正在读取世界地图...', 'Loading the world map...')}</p>
        </div>
      )}

      {status === 'empty' && (
        <div className="world-map-empty-wrap">
          <div className="world-map-empty">
            <div className="world-map-empty-art" aria-hidden="true">
              <svg viewBox="0 0 420 220">
                <path d="M65 138c29-44 78-70 132-64 43 5 79 28 101 63 11 18 3 39-17 48-41 18-100 16-145-2-33-13-61-27-71-45Z" />
                <path d="M143 93c22-13 52-15 76-5 18 8 28 24 26 42" />
                <path d="M205 150c30-18 61-24 91-16" />
                <circle cx="153" cy="128" r="5" />
                <circle cx="269" cy="116" r="5" />
                <circle cx="226" cy="163" r="5" />
                <path d="M153 128 269 116M269 116 226 163" className="dash" />
              </svg>
            </div>
            <div className="world-map-empty-copy">
              <h2>{text('还没有世界地图', 'No world map yet')}</h2>
              <p>
                {text(
                  'AI 会读取作品设定，推演大陆、区域、势力与两套等级阶梯；生成后先预览，确认才写入项目。',
                  'AI reads the project settings, derives continents, regions, factions, and two rank ladders, then previews before anything is saved.',
                )}
              </p>
              <div className="world-map-context">
                {contextItems.map(item => (
                  <span key={item.key} className={item.filled ? 'filled' : ''}>
                    {item.filled ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                    {text(item.zh, item.en)}
                  </span>
                ))}
              </div>
              {!contextItems[0].filled || !contextItems[1].filled ? (
                <p className="world-map-empty-hint">
                  <AlertTriangle size={13} />
                  {text('建议先补齐核心大纲与世界观，生成的地图会更稳定。', 'Fill in the core outline and worldbuilding first for a steadier map.')}
                </p>
              ) : null}
              <Button type="button" onClick={() => void generate()}>
                <Map size={14} aria-hidden="true" />
                {text('生成世界', 'Generate world')}
              </Button>
              <p className="world-map-empty-note">{text('只生成建议，不会直接改动项目文件', 'Generates a proposal only; project files are not changed.')}</p>
            </div>
          </div>
        </div>
      )}

      {status === 'generating' && (
        <div className="world-map-state">
          <div className="world-map-generation-card">
            <div className="world-map-generation-head">
              <Loader2 size={20} className="spin" />
              <div>
                <h2>{text('正在生成世界地图', 'Generating world map')}</h2>
                <p>{text('模型正在通过世界地图工具构建区域、势力与等级阶梯。', 'The model is building regions, factions, and rank ladders through the world-map tool.')}</p>
              </div>
            </div>
            <div className="world-map-progress" aria-hidden="true">
              <span style={{ width: `${Math.max(6, generationProgress)}%` }} />
            </div>
            <ol className="world-map-steps">
              {[
                { threshold: 0, zh: '读取作品设定', en: 'Read project settings' },
                { threshold: 20, zh: '推演大陆与区域', en: 'Derive continents and regions' },
                { threshold: 50, zh: '安排势力与等级', en: 'Place factions and ranks' },
                { threshold: 76, zh: '校验关系与命名', en: 'Validate relations and names' },
                { threshold: 91, zh: '准备地图预览', en: 'Prepare map preview' },
              ].map(step => {
                const active = generationProgress >= step.threshold
                return (
                  <li key={step.zh} className={active ? 'active' : ''}>
                    {active ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                    <span>{text(step.zh, step.en)}</span>
                  </li>
                )
              })}
            </ol>
            <div className="world-map-logs">
              {generationLogs.slice(-3).map((log, index) => (
                <p key={`${log}-${index}`}>{log}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="world-map-state">
          <div className="world-map-error-card">
            <AlertTriangle size={20} />
            <div>
              <h2>{text('世界地图读取失败', 'The world map could not be loaded')}</h2>
              <p>{error}</p>
              <Button type="button" variant="outline" onClick={() => void generate()}>
                <RefreshCw size={14} />
                {text('重新生成', 'Regenerate')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {(status === 'ready' || status === 'preview') && displayData && (
        <div className="world-map-body">
          <main className="world-map-plate">
            <div className="world-map-plate-head">
              <span>
                {status === 'preview'
                  ? text('生成预览 · 尚未应用', 'Preview · not applied')
                  : text('总览 · 关系线', 'Overview · relations')}
              </span>
              <span className="world-map-plate-meta">
                {displayData.regions.length} {text('域', 'regions')}
                <span>·</span>
                {displayData.factions.length} {text('宗', 'factions')}
                <span>·</span>
                {displayData.tiers.length} {text('档势力', 'tiers')}
                <span>·</span>
                {displayData.realms.length} {text('阶境界', 'realms')}
                {editMode ? (
                  <button type="button" className="world-map-plate-link" onClick={() => setWorldSettingsOpen(true)}>
                    {text('编辑世界坐标', 'Edit world header')}
                  </button>
                ) : null}
              </span>
            </div>
            <div className="world-map-canvas-wrap">
              <WorldMapCanvas
                data={displayData}
                selectedFactionId={effectiveSelectedFactionId}
                onSelectFaction={selectFaction}
                className="world-map-canvas"
                text={text}
              />
            </div>
            <WorldMapDetail
              data={displayData}
              faction={selectedFaction}
              region={selectedRegion}
              text={text}
              editMode={editMode}
              onEdit={() => {
                if (!selectedFaction) return
                setEditingFactionId(selectedFaction.id)
              }}
            />
          </main>

          <aside className="world-map-rail">
            <WorldMapLadders
              data={displayData}
              selectedFactionId={effectiveSelectedFactionId}
              onSelectFaction={selectFaction}
              text={text}
            />
          </aside>
        </div>
      )}

      {editingFactionId && data && (() => {
        const faction = data.factions.find(item => item.id === editingFactionId)
        if (!faction) return null
        return (
          <FactionEditPanel
            key={`${faction.id}-${data.updatedAt}`}
            faction={faction}
            data={data}
            text={text}
            saving={saving}
            onClose={() => setEditingFactionId(null)}
            onSave={handleEditSave}
          />
        )
      })()}

      {worldSettingsOpen && data && (
        <WorldSettingsPanel
          key={data.updatedAt}
          data={data}
          text={text}
          saving={saving}
          onClose={() => setWorldSettingsOpen(false)}
          onSave={handleWorldSettingsSave}
        />
      )}
    </div>
  )
}

function WorldMapDetail({
  data,
  faction,
  region,
  text,
  editMode,
  onEdit,
}: {
  data: WorldMapData
  faction?: WorldMapFaction
  region?: WorldMapRegion
  text: (zh: string, en: string) => string
  editMode: boolean
  onEdit: () => void
}) {
  if (!faction) {
    return (
      <div className="world-map-detail world-map-detail-empty">
        <span>{text('点击地图上的势力印标查看档案', 'Select a faction seal on the map to inspect it.')}</span>
      </div>
    )
  }
  const tier = data.tiers.find(item => item.id === faction.tierId)
  const realm = data.realms.find(item => item.id === faction.realmId)
  const relations = relationSummary(data, faction.id, text)
  return (
    <div className="world-map-detail">
      <div
        className="world-map-faction-seal"
        style={{ color: factionTierColor(tier?.order, data.tiers.length) }}
        aria-hidden="true"
      >
        {faction.name.slice(0, 1)}
      </div>
      <div className="world-map-detail-main">
        <div className="world-map-detail-title">
          <h2>{faction.name}</h2>
          {tier && <span className="world-map-tier-badge">{tier.name}</span>}
          <span className="world-map-kind">{factionKindLabel(faction.kind, text)}</span>
        </div>
        <p>
          {region?.name ?? text('未知区域', 'Unknown region')}
          {region?.continent ? ` · ${region.continent}` : ''}
          {faction.leader ? ` · ${text('掌门', 'Leader')} ${faction.leader}` : ''}
          {realm ? ` · ${realm.name}` : ''}
        </p>
      </div>
      <div className="world-map-detail-facts">
        <span><b>{text('掌控', 'Controls')}</b>{faction.resource}</span>
        <span><b>{text('关系', 'Relations')}</b>{relations.length > 0 ? relations.join(' · ') : text('暂无', 'None')}</span>
      </div>
      <div className="world-map-detail-actions">
        {editMode ? (
          <Button type="button" variant="outline" onClick={onEdit}>
            <PenLine size={13} />
            {text('编辑势力', 'Edit faction')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function WorldMapLadders({
  data,
  selectedFactionId,
  onSelectFaction,
  text,
}: {
  data: WorldMapData
  selectedFactionId?: string
  onSelectFaction: (factionId: string) => void
  text: (zh: string, en: string) => string
}) {
  const tierOrder = [...data.tiers].sort((left, right) => left.order - right.order)
  const realmOrder = [...data.realms].sort((left, right) => left.order - right.order)
  return (
    <>
      <section className="world-map-ladder world-map-tier-ladder">
        <div className="world-map-ladder-head">
          <h2>{text('势力等级', 'Faction tiers')}</h2>
          <span>{data.factions.length} {text('宗', 'factions')}</span>
        </div>
        <div className="world-map-tier-list">
          {tierOrder.map(tier => {
            const factions = data.factions.filter(faction => faction.tierId === tier.id)
            return (
              <div className="world-map-tier-group" key={tier.id}>
                <div className="world-map-tier-label">
                  <span style={{ color: factionTierColor(tier.order, data.tiers.length) }} className="dot" />
                  {tier.name}
                </div>
                <div className="world-map-tier-factions">
                  {factions.length === 0 ? (
                    <span className="world-map-tier-empty">{text('暂无', 'None')}</span>
                  ) : factions.map(faction => {
                    const region = data.regions.find(item => item.id === faction.regionId)
                    return (
                      <button
                        type="button"
                        key={faction.id}
                        className={`world-map-faction-row${faction.id === selectedFactionId ? ' selected' : ''}`}
                        onClick={() => onSelectFaction(faction.id)}
                      >
                        <span
                          className="dot"
                          style={{ background: factionTierColor(tier.order, data.tiers.length) }}
                        />
                        <span className="name">{faction.name}</span>
                        <span className="region">{region?.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div className="world-map-ladder-source">
          {text('依据', 'Based on')} · {text('作品设定 · 世界观 · 主角 · 金手指', 'Project settings · worldbuilding · protagonist · golden finger')}
        </div>
      </section>

      {data.relations.length > 0 && (
        <section className="world-map-ladder world-map-relations-card">
          <div className="world-map-ladder-head">
            <h2>{text('核心关系', 'Core relations')}</h2>
            <span>{data.relations.length} {text('条', 'links')}</span>
          </div>
          <div className="world-map-relations">
            {data.relations.slice(0, 5).map(relation => {
              const from = data.factions.find(faction => faction.id === relation.fromFactionId)
              const to = data.factions.find(faction => faction.id === relation.toFactionId)
              if (!from || !to) return null
              return (
                <div className="world-map-relation-row" key={relation.id}>
                  <span className={`line ${relation.kind}`} />
                  <span>{from.name} ↔ {to.name}</span>
                  <span className="note">{relation.note || (relation.kind === 'ally' ? text('同盟', 'Ally') : relation.kind === 'enemy' ? text('敌对', 'Enemy') : text('中立', 'Neutral'))}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="world-map-ladder world-map-realm-ladder">
        <div className="world-map-ladder-head">
          <h2>{text('境界体系', 'Realm ladder')}</h2>
          <span>{realmOrder.length} {text('阶', 'realms')}</span>
        </div>
        <div className="world-map-realm-list">
          {realmOrder.map((realm) => {
            const holders = data.factions.filter(faction => faction.realmId === realm.id)
            const highest = realmOrder
              .filter(candidate => data.factions.some(faction => faction.realmId === candidate.id))
              .at(-1)?.id === realm.id
            return (
              <div className={`world-map-realm-row${highest ? ' highest' : ''}`} key={realm.id}>
                <span className="line" />
                <span className="dot" />
                <span className="name">{realm.name}</span>
                <span className="holders">{holders.length > 0 ? holders.map(faction => faction.name).join(' · ') : text('暂无', 'None')}</span>
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}

function FactionEditPanel({
  faction,
  data,
  text,
  saving,
  onClose,
  onSave,
}: {
  faction: WorldMapFaction
  data: WorldMapData
  text: (zh: string, en: string) => string
  saving: boolean
  onClose: () => void
  onSave: (faction: WorldMapFaction) => void | Promise<void>
}) {
  const [draft, setDraft] = useState<WorldMapFaction>(faction)
  return (
    <div className="world-map-edit-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <form
        className="world-map-edit-panel"
        onSubmit={(event) => {
          event.preventDefault()
          void onSave({
            ...draft,
            name: draft.name.trim(),
            resource: draft.resource.trim(),
            summary: draft.summary.trim(),
            leader: draft.leader?.trim() || undefined,
          })
        }}
      >
        <div className="world-map-edit-head">
          <div>
            <span className="world-map-edit-eyebrow">{text('校对 · 势力', 'Proofread · faction')}</span>
            <h2>{faction.name}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={text('关闭', 'Close')}>
            <X size={15} />
          </button>
        </div>
        <label>
          {text('名称', 'Name')}
          <input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} required />
        </label>
        <div className="world-map-edit-row">
          <label>
            {text('类型', 'Kind')}
            <select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as WorldMapFaction['kind'] })}>
              <option value="sect">{text('宗门', 'Sect')}</option>
              <option value="dynasty">{text('王朝', 'Dynasty')}</option>
              <option value="organization">{text('组织', 'Organization')}</option>
            </select>
          </label>
          <label>
            {text('所在地', 'Region')}
            <select value={draft.regionId} onChange={event => setDraft({ ...draft, regionId: event.target.value })}>
              {data.regions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
            </select>
          </label>
        </div>
        <div className="world-map-edit-row">
          <label>
            {text('势力等级', 'Tier')}
            <select value={draft.tierId} onChange={event => setDraft({ ...draft, tierId: event.target.value })}>
              {[...data.tiers].sort((left, right) => left.order - right.order).map(tier => (
                <option key={tier.id} value={tier.id}>{tier.name}</option>
              ))}
            </select>
          </label>
          <label>
            {text('首领境界', 'Leader realm')}
            <select value={draft.realmId ?? ''} onChange={event => setDraft({ ...draft, realmId: event.target.value || undefined })}>
              <option value="">{text('未填', 'None')}</option>
              {[...data.realms].sort((left, right) => left.order - right.order).map(realm => (
                <option key={realm.id} value={realm.id}>{realm.name}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {text('掌控资源', 'Resources')}
          <input value={draft.resource} onChange={event => setDraft({ ...draft, resource: event.target.value })} required />
        </label>
        <label>
          {text('掌门 / 首领', 'Leader')}
          <input value={draft.leader ?? ''} onChange={event => setDraft({ ...draft, leader: event.target.value })} />
        </label>
        <label>
          {text('一句话定位', 'One-line role')}
          <textarea rows={3} value={draft.summary} onChange={event => setDraft({ ...draft, summary: event.target.value })} required />
        </label>
        <div className="world-map-edit-actions">
          <Button type="button" variant="ghost" onClick={onClose}>{text('取消', 'Cancel')}</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
            {text('保存修改', 'Save changes')}
          </Button>
        </div>
      </form>
    </div>
  )
}

function WorldSettingsPanel({
  data,
  text,
  saving,
  onClose,
  onSave,
}: {
  data: WorldMapData
  text: (zh: string, en: string) => string
  saving: boolean
  onClose: () => void
  onSave: (worldName: string, premise: string) => void | Promise<void>
}) {
  const [worldName, setWorldName] = useState(data.worldName)
  const [premise, setPremise] = useState(data.premise)
  return (
    <div className="world-map-edit-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <form
        className="world-map-edit-panel"
        onSubmit={(event) => {
          event.preventDefault()
          void onSave(worldName.trim(), premise.trim())
        }}
      >
        <div className="world-map-edit-head">
          <div>
            <span className="world-map-edit-eyebrow">{text('校对 · 世界', 'Proofread · world')}</span>
            <h2>{text('世界坐标', 'World header')}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={text('关闭', 'Close')}>
            <X size={15} />
          </button>
        </div>
        <label>
          {text('世界名称', 'World name')}
          <input value={worldName} onChange={event => setWorldName(event.target.value)} required />
        </label>
        <label>
          {text('一句话前提', 'Premise')}
          <textarea rows={4} value={premise} onChange={event => setPremise(event.target.value)} required />
        </label>
        <div className="world-map-edit-actions">
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
            {text('保存世界坐标', 'Save world header')}
          </Button>
        </div>
      </form>
    </div>
  )
}
