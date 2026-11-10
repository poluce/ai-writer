import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  Info,
  Loader2,
  PenLine,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useProjectStore } from '../../stores/project-store'
import { registerEditorExitSaveHandler } from '../../stores/editor-store'
import { useLLMStore } from '../../stores/llm-store'
import { useWorkflowStore, type WorkflowContext } from '../../stores/workflow-store'
import type { NovelConfig } from '../../shared/ipc-channels'
import {
  DEFAULT_NARRATIVE_THREAD_DORMANT_THRESHOLD,
  MAX_NARRATIVE_THREAD_DORMANT_THRESHOLD,
  MIN_NARRATIVE_THREAD_DORMANT_THRESHOLD,
  resolveNarrativeThreadDormantThreshold,
} from '../../shared/narrative-thread'
import {
  resolveWritingLanguage,
  type WritingLanguage,
} from '../../shared/writing-language'
import {
  generationFieldLabels,
  isGenerationFieldEnabled,
  isGoldenFingerEnabled,
  NOVEL_CONFIG_GENERATION_CHAIN,
  previousGenerationSteps,
  type GeneratableField,
} from '../../shared/novel-config-generation'
import { localizeNovelConfigFacts } from '../../shared/novel-config-localization'
import { Button } from '../ui/Button'
import { confirm } from '../ui/Confirm'
import { Input } from '../ui/Input'
import { NativeSelect } from '../ui/NativeSelect'
import { toast } from '../ui/Toast'
import { useLocaleStore } from '../../stores/locale-store'
import { useLayoutStore } from '../../stores/layout-store'
import {
  captureProjectSession,
  isProjectSessionCurrent,
  isProjectSessionPath,
} from '../project-session-gate'
import { AUDIENCE_EN, GENRE_EN } from './novel-config-labels'

type Translate = (zhCNText: string, enUSText: string) => string
type ProseFieldKey = GeneratableField | 'referenceWorks'
type AutoSaveState = 'idle' | 'saved' | 'pending' | 'saving' | 'error'

const GENRES = ['玄幻', '仙侠', '都市', '科幻', '历史', '军事', '游戏', '末世', '悬疑', '灵异', '言情', '古言', '现言', '奇幻', '武侠', '轻小说', '同人', '职场']
const AUTO_SAVE_DELAY_MS = 700

const FIELD_IDS: Record<ProseFieldKey, string> = {
  coreOutline: 'novel-settings-core',
  worldSetting: 'novel-settings-world',
  goldenFinger: 'novel-settings-golden',
  protagonistProfile: 'novel-settings-protagonist',
  globalGuidance: 'novel-settings-global',
  writingStyle: 'novel-settings-style',
  referenceWorks: 'novel-settings-reference',
}

const EMPTY_COPY: Record<ProseFieldKey, readonly [string, string, string, string]> = {
  coreOutline: [
    '还没有核心大纲。',
    '用一两句话写清楚：主角想要什么、什么挡着他、失败会失去什么。也可以让 AI 从作品坐标开始。',
    'No core outline yet.',
    'Write what the protagonist wants, what blocks them, and what failure costs. You can also start from the project coordinates.',
  ],
  worldSetting: [
    '这个世界还没有规则。',
    '时代、地点、力量的运行方式、仙门与凡人的关系，都还没有落笔。',
    'This world has no rules yet.',
    'The era, places, how power works, and the relationship between sects and ordinary people are still unwritten.',
  ],
  goldenFinger: [
    '还没有核心卖点。',
    '说明来源、机制、限制与代价，让它在世界规则里制造冲突，而不是万能答案。',
    'No core story engine yet.',
    'Define its origin, mechanism, limits, and cost so it creates conflict inside the world instead of solving everything.',
  ],
  protagonistProfile: [
    '主角还是一张白纸。',
    '性格、背景、目标、弱点，以及成长弧的起点和方向。',
    'The protagonist is still a blank page.',
    'Personality, backstory, goal, weakness, and the starting point of their arc.',
  ],
  globalGuidance: [
    '还没有跨章规则。',
    '写几条长期有效的写作纪律，例如每章必须留下什么、什么代价不能省。',
    'No cross-chapter rules yet.',
    'Add a few stable rules, such as what every chapter must leave behind or which costs cannot be skipped.',
  ],
  writingStyle: [
    '还没有文风配置。',
    '节奏、场景切换、描写密度、对话和用词，都可以在这里约束。',
    'No writing-style guide yet.',
    'Constrain pacing, scene transitions, descriptive density, dialogue, and diction here.',
  ],
  referenceWorks: [
    '还没有参考作品。',
    '用于约束文风与结构，不会直接喂给写作模型。',
    'No reference works yet.',
    'Used to constrain style and structure; they are not fed directly to the writing model.',
  ],
}

const FIELD_META: Record<ProseFieldKey, {
  title: readonly [string, string]
  meta: readonly [string, string]
}> = {
  coreOutline: { title: ['核心大纲', 'Core outline'], meta: ['核心大纲', 'Core outline'] },
  worldSetting: { title: ['世界观 / 初始设定', 'World / initial setting'], meta: ['世界观', 'World'] },
  goldenFinger: { title: ['金手指 / 核心卖点', 'Protagonist advantage / core hook'], meta: ['金手指', 'Advantage'] },
  protagonistProfile: { title: ['主角人设', 'Protagonist profile'], meta: ['主角人设', 'Protagonist'] },
  globalGuidance: { title: ['全局写作要求', 'Global writing guidance'], meta: ['全局写作要求', 'Global guidance'] },
  writingStyle: { title: ['文风配置', 'Writing style'], meta: ['文风配置', 'Writing style'] },
  referenceWorks: { title: ['参考作品', 'Reference works'], meta: ['参考作品', 'Reference works'] },
}

/** 小说配置编辑器 — 一份可读、可生成的作品设定文档 */
export default function NovelConfigEditor({ projectKey }: { projectKey: string }) {
  const currentProject = useProjectStore(s => s.currentProject)
  const projectSession = captureProjectSession(currentProject)
  const sessionKey = projectSession && isProjectSessionPath(projectSession, projectKey)
    ? `${projectSession.projectId}:${projectSession.projectPath}`
    : `inactive:${projectKey}`

  return <NovelConfigEditorSession key={sessionKey} projectKey={projectKey} />
}

function NovelConfigEditorSession({ projectKey }: { projectKey: string }) {
  const currentProject = useProjectStore(s => s.currentProject)
  const updateNovelConfig = useProjectStore(s => s.updateNovelConfig)
  const saveProject = useProjectStore(s => s.saveProject)
  const addLog = useWorkflowStore.getState().addLog
  const text = useLocaleStore(s => s.text)
  const locale = useLocaleStore(s => s.locale)

  const [generatingField, setGeneratingField] = useState<GeneratableField | null>(null)
  const [editingField, setEditingField] = useState<ProseFieldKey | null>(null)
  const [coordinatesOpen, setCoordinatesOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('novel-settings-core')
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>('idle')
  const pageRef = useRef<HTMLDivElement>(null)

  const projectMatches = currentProject?.path === projectKey
  const config = projectMatches ? currentProject.novelConfig : null

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveInFlightRef = useRef(false)
  const saveQueuedRef = useRef(false)
  const mountedRef = useRef(true)
  const exitSaveRef = useRef<() => Promise<void>>(async () => undefined)

  const persistConfig = useCallback(async () => {
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true
      return
    }

    saveInFlightRef.current = true
    if (mountedRef.current) setAutoSaveState('saving')
    try {
      do {
        saveQueuedRef.current = false
        const project = useProjectStore.getState().currentProject
        const projectSession = captureProjectSession(project)
        if (!project || project.path !== projectKey || !projectSession || !isProjectSessionPath(projectSession, projectKey)) {
          return
        }
        const saved = await saveProject(projectSession)
        if (!isProjectSessionCurrent(projectSession)) return
        if (!saved) throw new Error(text('项目配置未能写入磁盘', 'The project configuration could not be written to disk.'))
      } while (saveQueuedRef.current)
      if (mountedRef.current) setAutoSaveState('saved')
    } catch (error) {
      console.error('[NovelConfigEditor] 自动保存失败:', error)
      addLog('error', text(`保存失败：${error}`, `Save failed: ${error}`))
      if (mountedRef.current) setAutoSaveState('error')
    } finally {
      saveInFlightRef.current = false
    }
  }, [addLog, projectKey, saveProject, text])

  const persistRef = useRef(persistConfig)
  useEffect(() => {
    persistRef.current = persistConfig
  }, [persistConfig])

  const scheduleAutoSave = useCallback(() => {
    if (!mountedRef.current) return
    setAutoSaveState('pending')
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null
      void persistRef.current()
    }, AUTO_SAVE_DELAY_MS)
  }, [])

  useEffect(() => {
    registerEditorExitSaveHandler({
      type: 'config',
      projectKey,
      save: () => exitSaveRef.current(),
    })
  }, [projectKey])

  useEffect(() => {
    exitSaveRef.current = async () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
      await persistRef.current()
    }
  })

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
        void persistRef.current()
      }
    }
  }, [])

  const update = <K extends keyof NovelConfig>(key: K, value: NovelConfig[K]) => {
    if (!config) return
    const projectSession = captureProjectSession(currentProject)
    if (!projectSession || !isProjectSessionPath(projectSession, projectKey)) return
    updateNovelConfig({ [key]: value }, projectSession)
    scheduleAutoSave()
  }

  const goldenFingerEnabled = config ? isGoldenFingerEnabled(config) : true
  const dormantThreshold = resolveNarrativeThreadDormantThreshold(
    config?.narrativeThreadDormantChapterThreshold,
  )

  const localizedFacts = useMemo(
    () => config
      ? localizeNovelConfigFacts(config, locale as WritingLanguage)
      : { genre: '', targetAudience: '', plotStructure: '', narrativePOV: '' },
    [config, locale],
  )

  const trackedFields = useMemo(() => {
    if (!config) return []
    const fields: Array<{ key: ProseFieldKey; label: readonly [string, string]; filled: boolean }> = [
      { key: 'coreOutline', label: FIELD_META.coreOutline.meta, filled: Boolean(config.coreOutline?.trim()) },
      { key: 'worldSetting', label: FIELD_META.worldSetting.meta, filled: Boolean(config.worldSetting?.trim()) },
      ...(goldenFingerEnabled
        ? [{ key: 'goldenFinger' as const, label: FIELD_META.goldenFinger.meta, filled: Boolean(config.goldenFinger?.trim()) }]
        : []),
      { key: 'protagonistProfile', label: FIELD_META.protagonistProfile.meta, filled: Boolean(config.protagonistProfile?.trim()) },
      { key: 'globalGuidance', label: FIELD_META.globalGuidance.meta, filled: Boolean(config.globalGuidance?.trim()) },
      { key: 'writingStyle', label: FIELD_META.writingStyle.meta, filled: Boolean(config.writingStyle?.trim()) },
      { key: 'referenceWorks', label: FIELD_META.referenceWorks.meta, filled: Boolean(config.referenceWorks?.trim()) },
    ]
    return fields
  }, [config, goldenFingerEnabled])

  const filledCount = trackedFields.filter(field => field.filled).length
  const missingFields = trackedFields.filter(field => !field.filled)
  const completionPercent = trackedFields.length > 0 ? Math.round((filledCount / trackedFields.length) * 100) : 0

  const contextFor = (field: GeneratableField): string => {
    if (!config) return ''
    const basics = [
      text('类型', 'Genre'),
      text('目标受众', 'Audience'),
      text('故事结构', 'Story structure'),
      text('叙事视角', 'Point of view'),
      text('篇幅', 'Length'),
    ]
    const previous = previousGenerationSteps(field, config).map(step => text(step.labels[0], step.labels[1]))
    return [...basics, ...previous].join(' · ')
  }

  const scrollToSection = (id: string) => {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handlePageScroll = () => {
    const container = pageRef.current
    if (!container) return
    const threshold = container.getBoundingClientRect().top + 96
    const ids = [
      'novel-settings-core',
      'novel-settings-world',
      ...(goldenFingerEnabled ? ['novel-settings-golden'] : []),
      'novel-settings-protagonist',
      'novel-settings-discipline',
    ]
    let next = ids[0]
    for (const id of ids) {
      const element = document.getElementById(id)
      if (element && element.getBoundingClientRect().top <= threshold) next = id
    }
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 24) {
      next = ids[ids.length - 1]
    }
    setActiveSection(previous => previous === next ? previous : next)
  }

  const startEditing = (field: ProseFieldKey) => {
    setEditingField(field)
    setActiveSection(FIELD_IDS[field])
  }

  const handleFieldGenerate = async (fieldKey: GeneratableField) => {
    const projectSession = captureProjectSession(currentProject)
    if (!projectSession || !isProjectSessionPath(projectSession, projectKey)) return
    const effectiveModelId = useLLMStore.getState().resolveTaskModelId('outline')
    if (!effectiveModelId) {
      toast.warning(text('请先在「设置 → AI 生成模型」中配置默认模型', 'Configure an AI model in Settings first.'))
      useLayoutStore.getState().openSettings('llm')
      return
    }
    if (generatingField) return

    setEditingField(null)
    setActiveSection(FIELD_IDS[fieldKey])
    setGeneratingField(fieldKey)
    const [fieldNameZh, fieldNameEn] = generationFieldLabels(fieldKey)
    const fieldName = text(fieldNameZh, fieldNameEn)

    toast.info(text(`正在生成【${fieldName}】...`, `Generating "${fieldName}"...`))
    try {
      addLog('info', text(`正在生成【${fieldName}】...`, `Generating "${fieldName}"...`))
      const { GenerateFieldCommand } = await import('../../services/workflows/commands/generate-field.command')
      const cmd = new GenerateFieldCommand(fieldKey)
      const writingLanguage = resolveWritingLanguage(currentProject?.novelConfig?.writingLanguage)
      const context: WorkflowContext = {
        runId: `field-${Date.now()}`,
        projectPath: projectSession.projectPath,
        projectSession,
        writingLanguage,
        uiLocale: locale,
        data: {},
        cancelled: false,
        generationModelId: effectiveModelId,
      }
      await cmd.execute({
        step: { id: `step-${fieldKey}`, commandId: 'generate-field', name: fieldName, params: {} },
        context,
        callbacks: {
          log: (msg: string) => addLog('info', msg),
          setProgress: () => {},
          appendText: () => {},
        },
      })
      if (mountedRef.current) setAutoSaveState('saved')
      toast.success(text(`【${fieldName}】生成完成！`, `"${fieldName}" generated successfully!`))
      addLog('info', text(`【${fieldName}】已生成并保存`, `"${fieldName}" was generated and saved.`))
    } catch (e) {
      console.error('[NovelConfigEditor] 字段生成失败:', e)
      const errorMsg = e instanceof Error ? e.message : String(e)
      toast.error(text(`生成失败：${errorMsg}`, `Generation failed: ${errorMsg}`))
      addLog('error', text(`生成失败：${errorMsg}`, `Generation failed: ${errorMsg}`))
    } finally {
      setGeneratingField(null)
    }
  }

  const handleFieldClear = async (fieldKey: ProseFieldKey, fieldLabel: string) => {
    const projectSession = captureProjectSession(currentProject)
    if (!projectSession || !isProjectSessionPath(projectSession, projectKey)) return
    const currentVal = config?.[fieldKey]
    if (typeof currentVal !== 'string' || !currentVal.trim()) return

    const ok = await confirm(
      text(`确认清除「${fieldLabel}」内容？`, `Are you sure you want to clear "${fieldLabel}"?`),
      {
        title: text('清除确认', 'Confirm Clear'),
        confirmText: text('清除', 'Clear'),
        danger: true,
        overlay: false,
      },
    )
    if (!ok) return
    if (!isProjectSessionCurrent(projectSession)) return

    update(fieldKey, '')
    toast.success(text(`已清除「${fieldLabel}」`, `Cleared "${fieldLabel}"`))
  }

  const handleGenerateNext = () => {
    if (!config) return
    const next = NOVEL_CONFIG_GENERATION_CHAIN.find(
      step => isGenerationFieldEnabled(step.key, config) && !String(config[step.key] ?? '').trim(),
    )
    if (!next) {
      const referenceMissing = !String(config.referenceWorks ?? '').trim()
      if (referenceMissing) {
        toast.info(text('参考作品需要手动填写，不适合由 AI 生成。', 'Reference works are best written manually; AI generation does not cover them.'))
        scrollToSection(FIELD_IDS.referenceWorks)
      } else {
        toast.info(text('设定已经填写完整，可以开始写第一章了。', 'All settings are filled. You can start writing chapter one.'))
      }
      return
    }
    void handleFieldGenerate(next.key)
  }

  const taggedContext = config
    ? [
        localizedFacts.genre,
        config.subGenre,
        localizedFacts.targetAudience,
        localizedFacts.plotStructure,
        localizedFacts.narrativePOV,
        config.totalChapters ? text(`${config.totalChapters} 章`, `${config.totalChapters} chapters`) : '',
        config.wordsPerChapter ? text(`每章 ${config.wordsPerChapter} 字`, `${config.wordsPerChapter} words/chapter`) : '',
        resolveWritingLanguage(config.writingLanguage) === 'en-US' ? 'English' : text('简体中文', 'Simplified Chinese'),
      ].filter(Boolean)
    : []

  if (!config) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: 'var(--color-text-muted)' }}>
        <span className="text-sm opacity-50">
          {projectMatches
            ? text('加载配置中...', 'Loading configuration...')
            : text('此标签属于另一个项目，请切回原项目后继续。', 'This tab belongs to another project. Switch back to continue.')}
        </span>
      </div>
    )
  }

  const saveLabel: Record<AutoSaveState, string> = {
    idle: text('自动保存', 'Auto-save'),
    saved: text('已自动保存', 'Saved automatically'),
    pending: text('待保存', 'Unsaved'),
    saving: text('保存中…', 'Saving…'),
    error: text('保存失败', 'Save failed'),
  }

  return (
    <div className="novel-settings-page" ref={pageRef} onScroll={handlePageScroll}>
      <div className="novel-settings-sheet">
        <div className="novel-settings-head">
          <div className="novel-settings-title-row">
            <div>
              <h1 className="novel-settings-title">{text('作品设定', 'Story settings')}</h1>
              {taggedContext.length > 0 && (
                <p className="novel-settings-sub">
                  {taggedContext.map((part, index) => (
                    <span key={`${part}-${index}`}>
                      {index > 0 && <span className="novel-settings-sep">·</span>}
                      {part}
                    </span>
                  ))}
                </p>
              )}
            </div>
            <div className="novel-settings-head-actions">
              <Button
                className="h-[33px] px-3.5 rounded-lg text-[12.5px]"
                onClick={handleGenerateNext}
                disabled={generatingField != null}
              >
                {text('补齐设定', 'Fill gaps')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={coordinatesOpen}
                onClick={() => setCoordinatesOpen(open => !open)}
              >
                {coordinatesOpen ? text('收起作品坐标', 'Hide coordinates') : text('编辑作品坐标', 'Edit coordinates')}
              </Button>
            </div>
          </div>

          <div className="novel-settings-completion">
            <span>{text('设定完成', 'Settings')}</span>
            <span className="novel-settings-completion-bar" aria-hidden="true">
              <span style={{ width: `${completionPercent}%` }} />
            </span>
            <span>{filledCount} / {trackedFields.length}</span>
            {missingFields.length > 0 ? (
              <span className="novel-settings-next">
                {text('待补：', 'Missing: ')}
                {missingFields.map(field => text(field.label[0], field.label[1])).join('、')}
              </span>
            ) : (
              <span className="novel-settings-next">{text('全部设定已填写', 'All settings filled')}</span>
            )}
            <span
              className={`novel-settings-save${autoSaveState === 'error' ? ' error' : ''}`}
              aria-live="polite"
            >
              {autoSaveState === 'saved' ? <Check size={11} /> : null}
              {saveLabel[autoSaveState]}
            </span>
          </div>

          {coordinatesOpen && (
            <CoordinatesPanel
              config={config}
              text={text}
              update={update}
              goldenFingerEnabled={goldenFingerEnabled}
              dormantThreshold={dormantThreshold}
              onClose={() => setCoordinatesOpen(false)}
            />
          )}
        </div>

        <div className="novel-settings-body">
          <nav className="novel-settings-nav" aria-label={text('本页目录', 'On this page')}>
            <div className="novel-settings-nav-label">{text('本页', 'On this page')}</div>
            <NavItem
              active={activeSection === FIELD_IDS.coreOutline}
              filled={Boolean(config.coreOutline?.trim())}
              label={text('核心大纲', 'Core outline')}
              onClick={() => scrollToSection(FIELD_IDS.coreOutline)}
            />
            <NavItem
              active={activeSection === FIELD_IDS.worldSetting}
              filled={Boolean(config.worldSetting?.trim())}
              label={text('世界观与规则', 'World & rules')}
              onClick={() => scrollToSection(FIELD_IDS.worldSetting)}
            />
            {goldenFingerEnabled && (
              <NavItem
                active={activeSection === FIELD_IDS.goldenFinger}
                filled={Boolean(config.goldenFinger?.trim())}
                label={text('金手指', 'Core hook')}
                onClick={() => scrollToSection(FIELD_IDS.goldenFinger)}
              />
            )}
            <NavItem
              active={activeSection === FIELD_IDS.protagonistProfile}
              filled={Boolean(config.protagonistProfile?.trim())}
              label={text('主角人设', 'Protagonist')}
              onClick={() => scrollToSection(FIELD_IDS.protagonistProfile)}
            />
            <NavItem
              active={activeSection === 'novel-settings-discipline'}
              filled={Boolean(config.globalGuidance?.trim() && config.writingStyle?.trim() && config.referenceWorks?.trim())}
              label={text('写作纪律', 'Writing discipline')}
              onClick={() => scrollToSection('novel-settings-discipline')}
            />
          </nav>

          <div>
            <DocSection
              id={FIELD_IDS.coreOutline}
              title={text('核心大纲', 'Core outline')}
              value={config.coreOutline}
              editing={editingField === 'coreOutline'}
              generating={generatingField === 'coreOutline'}
              placeholder={text('在标题下直接写正文，或点生成……', 'Write under this heading, or generate…')}
              emptyTitle={text(EMPTY_COPY.coreOutline[0], EMPTY_COPY.coreOutline[2])}
              emptyCopy={text(EMPTY_COPY.coreOutline[1], EMPTY_COPY.coreOutline[3])}
              emptyGenerateLabel={text('生成核心大纲', 'Generate outline')}
              context={contextFor('coreOutline')}
              onEdit={() => startEditing('coreOutline')}
              onDone={() => setEditingField(null)}
              onChange={value => update('coreOutline', value)}
              onGenerate={() => void handleFieldGenerate('coreOutline')}
              onClear={() => void handleFieldClear('coreOutline', text('核心大纲', 'Core outline'))}
              text={text}
              locale={locale}
            />
            <DocSection
              id={FIELD_IDS.worldSetting}
              title={text('世界观 / 初始设定', 'World / initial setting')}
              value={config.worldSetting}
              editing={editingField === 'worldSetting'}
              generating={generatingField === 'worldSetting'}
              placeholder={text('时代、地点、规则、冲突来源……', 'Era, place, rules, and sources of conflict…')}
              emptyTitle={text(EMPTY_COPY.worldSetting[0], EMPTY_COPY.worldSetting[2])}
              emptyCopy={text(EMPTY_COPY.worldSetting[1], EMPTY_COPY.worldSetting[3])}
              emptyGenerateLabel={text('生成世界观', 'Generate world')}
              context={contextFor('worldSetting')}
              onEdit={() => startEditing('worldSetting')}
              onDone={() => setEditingField(null)}
              onChange={value => update('worldSetting', value)}
              onGenerate={() => void handleFieldGenerate('worldSetting')}
              onClear={() => void handleFieldClear('worldSetting', text('世界观 / 初始设定', 'World / initial setting'))}
              text={text}
              locale={locale}
            />
            {goldenFingerEnabled && (
              <DocSection
                id={FIELD_IDS.goldenFinger}
                title={text('金手指 / 核心卖点', 'Protagonist advantage / core hook')}
                value={config.goldenFinger}
                editing={editingField === 'goldenFinger'}
                generating={generatingField === 'goldenFinger'}
                placeholder={text('来源、机制、限制与代价……', 'Origin, mechanism, limits, and cost…')}
                emptyTitle={text(EMPTY_COPY.goldenFinger[0], EMPTY_COPY.goldenFinger[2])}
                emptyCopy={text(EMPTY_COPY.goldenFinger[1], EMPTY_COPY.goldenFinger[3])}
                emptyGenerateLabel={text('生成金手指', 'Generate hook')}
                context={contextFor('goldenFinger')}
                onEdit={() => startEditing('goldenFinger')}
                onDone={() => setEditingField(null)}
                onChange={value => update('goldenFinger', value)}
                onGenerate={() => void handleFieldGenerate('goldenFinger')}
                onClear={() => void handleFieldClear('goldenFinger', text('金手指 / 核心卖点', 'Protagonist advantage / core hook'))}
                text={text}
                locale={locale}
              />
            )}
            <DocSection
              id={FIELD_IDS.protagonistProfile}
              title={text('主角人设', 'Protagonist profile')}
              value={config.protagonistProfile}
              editing={editingField === 'protagonistProfile'}
              generating={generatingField === 'protagonistProfile'}
              placeholder={text('性格、背景、目标、弱点……', 'Personality, backstory, goal, and weakness…')}
              emptyTitle={text(EMPTY_COPY.protagonistProfile[0], EMPTY_COPY.protagonistProfile[2])}
              emptyCopy={text(EMPTY_COPY.protagonistProfile[1], EMPTY_COPY.protagonistProfile[3])}
              emptyGenerateLabel={text('生成主角人设', 'Generate protagonist')}
              context={contextFor('protagonistProfile')}
              onEdit={() => startEditing('protagonistProfile')}
              onDone={() => setEditingField(null)}
              onChange={value => update('protagonistProfile', value)}
              onGenerate={() => void handleFieldGenerate('protagonistProfile')}
              onClear={() => void handleFieldClear('protagonistProfile', text('主角人设', 'Protagonist profile'))}
              text={text}
              locale={locale}
            />

            <DisciplineGroup
              config={config}
              text={text}
              locale={locale}
              editingField={editingField}
              generatingField={generatingField}
              startEditing={startEditing}
              setEditingField={setEditingField}
              update={update}
              onGenerateGlobal={() => void handleFieldGenerate('globalGuidance')}
              onGenerateStyle={() => void handleFieldGenerate('writingStyle')}
              onClearGlobal={() => void handleFieldClear('globalGuidance', text('全局写作要求', 'Global writing guidance'))}
              onClearStyle={() => void handleFieldClear('writingStyle', text('文风配置', 'Writing style'))}
              onClearReference={() => void handleFieldClear('referenceWorks', text('参考作品', 'Reference works'))}
              contextFor={contextFor}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function NavItem({
  active,
  filled,
  label,
  onClick,
}: {
  active: boolean
  filled: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`novel-settings-nav-item${active ? ' active' : ''}`}
      onClick={onClick}
    >
      <span className={`novel-settings-nav-dot${filled ? ' done' : ' pending'}`} aria-hidden="true" />
      {label}
    </button>
  )
}

function DocSection({
  id,
  title,
  value,
  editing,
  generating,
  placeholder,
  emptyTitle,
  emptyCopy,
  emptyGenerateLabel,
  context,
  onEdit,
  onDone,
  onChange,
  onGenerate,
  onClear,
  text,
  locale,
  sub = false,
}: {
  id?: string
  title: string
  value: string | undefined
  editing: boolean
  generating: boolean
  placeholder: string
  emptyTitle: string
  emptyCopy: string
  emptyGenerateLabel?: string
  context?: string
  onEdit: () => void
  onDone: () => void
  onChange: (value: string) => void
  onGenerate?: () => void
  onClear?: () => void
  text: Translate
  locale: string
  sub?: boolean
}) {
  const content = value ?? ''
  const hasContent = Boolean(content.trim())
  const meta = hasContent ? fieldSize(content, locale) : text('未填写', 'Not filled')

  return (
    <section
      id={id}
      className={sub ? 'novel-settings-subfield' : 'novel-settings-section'}
    >
      <div className="novel-settings-section-head">
        {sub
          ? <h3 className="novel-settings-subtitle">{title}</h3>
          : <h2 className="novel-settings-section-title">{title}</h2>}
        <span className="novel-settings-meta">{meta}</span>
        <div className="novel-settings-section-actions">
          {(hasContent || editing) && onGenerate && (
            <button
              type="button"
              className="novel-settings-action"
              onClick={onGenerate}
              disabled={generating}
            >
              {generating
                ? <Loader2 size={12} className="animate-spin" />
                : <RefreshCw size={12} />}
              {generating
                ? text('生成中…', 'Generating…')
                : hasContent
                  ? text('重新生成', 'Regenerate')
                  : (emptyGenerateLabel ?? text('生成', 'Generate'))}
            </button>
          )}
          <button type="button" className="novel-settings-action" onClick={editing ? onDone : onEdit}>
            <PenLine size={12} />
            {editing ? text('完成', 'Done') : text('编辑', 'Edit')}
          </button>
        </div>
      </div>

      {generating && !hasContent ? (
        <p className="novel-settings-empty-copy" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Loader2 size={13} className="animate-spin" />
          {text('正在生成…', 'Generating…')}
        </p>
      ) : editing ? (
        <>
          <AutoGrowTextarea
            value={content}
            onChange={onChange}
            placeholder={placeholder}
            label={title}
          />
          {hasContent && onClear && (
            <div style={{ marginTop: 6 }}>
              <button
                type="button"
                className="novel-settings-action"
                style={{ color: 'var(--color-text-muted)' }}
                onClick={onClear}
              >
                <Trash2 size={12} />
                {text('清除内容', 'Clear content')}
              </button>
            </div>
          )}
        </>
      ) : hasContent ? (
        <div className="novel-settings-prose" role="textbox" tabIndex={0} onClick={onEdit} onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onEdit()
          }
        }}>
          {content}
        </div>
      ) : (
        <div className="novel-settings-empty">
          <p className="novel-settings-empty-title">{emptyTitle}</p>
          <p className="novel-settings-empty-copy">{emptyCopy}</p>
          <div className="novel-settings-empty-actions">
            {onGenerate && emptyGenerateLabel && (
              <Button size="sm" onClick={onGenerate}>{emptyGenerateLabel}</Button>
            )}
            <Button variant="ghost" size="sm" onClick={onEdit}>
              {text('手动填写', 'Write manually')}
            </Button>
          </div>
          {onGenerate && context && (
            <p className="novel-settings-context">
              {text('将参考：', 'Reads: ')}<b>{context}</b>
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function DisciplineGroup({
  config,
  text,
  locale,
  editingField,
  generatingField,
  startEditing,
  setEditingField,
  update,
  onGenerateGlobal,
  onGenerateStyle,
  onClearGlobal,
  onClearStyle,
  onClearReference,
  contextFor,
}: {
  config: NovelConfig
  text: Translate
  locale: string
  editingField: ProseFieldKey | null
  generatingField: GeneratableField | null
  startEditing: (field: ProseFieldKey) => void
  setEditingField: (field: ProseFieldKey | null) => void
  update: <K extends keyof NovelConfig>(key: K, value: NovelConfig[K]) => void
  onGenerateGlobal: () => void
  onGenerateStyle: () => void
  onClearGlobal: () => void
  onClearStyle: () => void
  onClearReference: () => void
  contextFor: (field: GeneratableField) => string
}) {
  const filled = [config.globalGuidance, config.writingStyle, config.referenceWorks]
    .filter(value => Boolean(value?.trim())).length

  return (
    <section id="novel-settings-discipline" className="novel-settings-section">
      <div className="novel-settings-section-head">
        <h2 className="novel-settings-section-title">{text('写作纪律', 'Writing discipline')}</h2>
        <span className="novel-settings-meta">{filled} / 3</span>
      </div>
      <DocSection
        sub
        id={FIELD_IDS.globalGuidance}
        title={text('全局写作要求', 'Global writing guidance')}
        value={config.globalGuidance}
        editing={editingField === 'globalGuidance'}
        generating={generatingField === 'globalGuidance'}
        placeholder={text('跨章节长期有效的规则……', 'Stable cross-chapter rules…')}
        emptyTitle={text(EMPTY_COPY.globalGuidance[0], EMPTY_COPY.globalGuidance[2])}
        emptyCopy={text(EMPTY_COPY.globalGuidance[1], EMPTY_COPY.globalGuidance[3])}
        emptyGenerateLabel={text('生成写作要求', 'Generate rules')}
        context={contextFor('globalGuidance')}
        onEdit={() => startEditing('globalGuidance')}
        onDone={() => setEditingField(null)}
        onChange={value => update('globalGuidance', value)}
        onGenerate={onGenerateGlobal}
        onClear={onClearGlobal}
        text={text}
        locale={locale}
      />
      <DocSection
        sub
        id={FIELD_IDS.writingStyle}
        title={text('文风配置', 'Writing style')}
        value={config.writingStyle || ''}
        editing={editingField === 'writingStyle'}
        generating={generatingField === 'writingStyle'}
        placeholder={text('节奏、对话、描写密度……', 'Pacing, dialogue, and descriptive density…')}
        emptyTitle={text(EMPTY_COPY.writingStyle[0], EMPTY_COPY.writingStyle[2])}
        emptyCopy={text(EMPTY_COPY.writingStyle[1], EMPTY_COPY.writingStyle[3])}
        emptyGenerateLabel={text('生成文风配置', 'Generate style')}
        context={contextFor('writingStyle')}
        onEdit={() => startEditing('writingStyle')}
        onDone={() => setEditingField(null)}
        onChange={value => update('writingStyle', value)}
        onGenerate={onGenerateStyle}
        onClear={onClearStyle}
        text={text}
        locale={locale}
      />
      <DocSection
        sub
        id={FIELD_IDS.referenceWorks}
        title={text('参考作品', 'Reference works')}
        value={config.referenceWorks || ''}
        editing={editingField === 'referenceWorks'}
        generating={false}
        placeholder={text('参考哪些作品的风格或体系……', 'Which works should inform style or systems…')}
        emptyTitle={text(EMPTY_COPY.referenceWorks[0], EMPTY_COPY.referenceWorks[2])}
        emptyCopy={text(EMPTY_COPY.referenceWorks[1], EMPTY_COPY.referenceWorks[3])}
        onEdit={() => startEditing('referenceWorks')}
        onDone={() => setEditingField(null)}
        onChange={value => update('referenceWorks', value)}
        onClear={onClearReference}
        text={text}
        locale={locale}
      />
    </section>
  )
}

function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.max(element.scrollHeight, 96)}px`
  }, [value])

  useEffect(() => {
    ref.current?.focus()
  }, [])

  return (
    <textarea
      ref={ref}
      aria-label={label}
      className="novel-settings-textarea"
      value={value}
      placeholder={placeholder}
      rows={3}
      onChange={event => onChange(event.target.value)}
    />
  )
}

function CoordinatesPanel({
  config,
  text,
  update,
  goldenFingerEnabled,
  dormantThreshold,
  onClose,
}: {
  config: NovelConfig
  text: Translate
  update: <K extends keyof NovelConfig>(key: K, value: NovelConfig[K]) => void
  goldenFingerEnabled: boolean
  dormantThreshold: number
  onClose: () => void
}) {
  return (
    <div className="novel-settings-coordinates">
      <div className="novel-settings-coordinates-head">
        <h2 className="novel-settings-coordinates-title">{text('作品坐标', 'Project coordinates')}</h2>
        <span className="novel-settings-coordinates-desc">
          {text('这些参数会作为 AI 生成与写作的长期约束', 'These parameters constrain AI generation and writing')}
        </span>
        <button type="button" className="novel-settings-coordinates-close" onClick={onClose}>
          {text('收起', 'Hide')}
        </button>
      </div>
      <div className="novel-settings-coordinates-grid">
        <Field label={text('类型', 'Genre')}>
          <NativeSelect value={config.genre || ''} onChange={(e) => update('genre', e.target.value)}>
            <option value="" disabled>{text('请选择类型', 'Select a genre')}</option>
            {config.genre && !GENRES.includes(config.genre) && (
              <option value={config.genre}>{config.genre}</option>
            )}
            {GENRES.map((g) => <option key={g} value={g}>{text(g, GENRE_EN[g] ?? g)}</option>)}
          </NativeSelect>
        </Field>
        <Field label={text('细分类型', 'Subgenre')}>
          <Input value={config.subGenre || ''} onChange={(e) => update('subGenre', e.target.value)} placeholder={text('如：修仙/重生/末世', 'e.g. cultivation / rebirth / post-apocalyptic')} />
        </Field>
        <Field label={text('目标受众', 'Audience')}>
          <NativeSelect value={config.targetAudience || ''} onChange={(e) => update('targetAudience', e.target.value)}>
            <option value="" disabled>{text('请选择目标受众', 'Select an audience')}</option>
            {config.targetAudience && !Object.hasOwn(AUDIENCE_EN, config.targetAudience) && (
              <option value={config.targetAudience}>{config.targetAudience}</option>
            )}
            {Object.entries(AUDIENCE_EN).map(([value, labelEn]) => (
              <option key={value} value={value}>{text(value, labelEn)}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={text('故事结构', 'Story structure')} tipItems={[
          '三幕结构：经典的“建置→对抗→高潮”，适合大多数网文类型',
          '英雄之旅：神话学十二阶段，适合冒险/成长类，强调内在蜕变',
          '节拍表：好莱坞十五拍结构，节奏最精细，适合情感张力强的故事',
          '起承转合：中国传统四段式结构，适合古言/武侠/仙侠',
          '多线叙事：多条故事线并进交织，适合群像或复杂情节',
          '自由结构：不限定特定框架，AI 根据内容自适应，适合日常/轻小说',
        ].map((item, index) => text(item, [
          'Three-act structure: setup, confrontation, and climax; suitable for most genres',
          'Hero’s journey: a transformation-focused adventure structure',
          'Beat sheet: detailed pacing for emotionally intense stories',
          'Kishōtenketsu: a four-part East Asian structure',
          'Multi-thread: interwoven story lines for ensembles and complex plots',
          'Freeform: AI adapts the structure to the content',
        ][index]))}>
          <NativeSelect value={config.plotStructure || 'three_act'} onChange={(e) => update('plotStructure', e.target.value as NovelConfig['plotStructure'])}>
            <option value="three_act">{text('三幕结构', 'Three-act')}</option>
            <option value="heros_journey">{text('英雄之旅', 'Hero’s journey')}</option>
            <option value="save_the_cat">{text('节拍表', 'Beat sheet')}</option>
            <option value="kishotenketsu">{text('起承转合', 'Kishōtenketsu')}</option>
            <option value="multi_thread">{text('多线叙事', 'Multi-thread')}</option>
            <option value="freeform">{text('自由结构', 'Freeform')}</option>
          </NativeSelect>
        </Field>
        <Field label={text('叙事视角', 'Point of view')} tipItems={[
          '第一人称："我"视角叙事，代入感最强，信息受限',
          '第三人称有限视角：跟随主角视角，兼顾代入感和灵活性，最常用',
          '第三人称全知视角：可自由切换角色内心，适合群像叙事',
          '多视角轮换：多名角色交替叙事，适合复杂群像故事',
        ].map((item, index) => text(item, [
          'First person: immersive and intentionally limited information',
          'Third-person limited: follows one viewpoint with flexibility',
          'Third-person omniscient: can enter any character’s perspective',
          'Multiple POV: alternates between several viewpoint characters',
        ][index]))}>
          <NativeSelect value={config.narrativePOV || 'third_limited'} onChange={(e) => update('narrativePOV', e.target.value as NovelConfig['narrativePOV'])}>
            <option value="first_person">{text('第一人称', 'First person')}</option>
            <option value="third_limited">{text('第三人称有限视角', 'Third-person limited')}</option>
            <option value="third_omniscient">{text('第三人称全知视角', 'Third-person omniscient')}</option>
            <option value="multi_pov">{text('多视角轮换', 'Multiple POV')}</option>
          </NativeSelect>
        </Field>
        <Field
          label={text('写作语言', 'Writing language')}
          htmlFor="project-writing-language"
          tipItems={[
            text(
              '用途：控制后续 AI 创作使用的内置指令语言',
              'Purpose: controls the built-in instruction language for later AI writing',
            ),
            text(
              '界面：不会改变软件界面语言',
              'Interface: does not change the app language',
            ),
            text(
              '已有内容：不会翻译已经写好的文字',
              'Existing text: does not translate what you already wrote',
            ),
          ]}
        >
          <NativeSelect
            id="project-writing-language"
            value={resolveWritingLanguage(config.writingLanguage)}
            onChange={(e) => update('writingLanguage', e.target.value as WritingLanguage)}
          >
            <option value="zh-CN">{text('简体中文', 'Simplified Chinese')}</option>
            <option value="en-US">English</option>
          </NativeSelect>
        </Field>
        <Field label={text('总章数', 'Total chapters')}>
          <Input
            type="number"
            value={config.totalChapters ?? ''}
            onChange={(e) => update('totalChapters', (e.target.value === '' ? '' : parseInt(e.target.value)) as number)}
            onBlur={() => {
              const v = Number(config.totalChapters)
              if (!v || v < 1) update('totalChapters', 100)
            }}
            placeholder="100"
            min={1}
          />
        </Field>
        <Field label={text('每章字数', 'Words per chapter')}>
          <Input
            type="number"
            value={config.wordsPerChapter ?? ''}
            onChange={(e) => update('wordsPerChapter', (e.target.value === '' ? '' : parseInt(e.target.value)) as number)}
            onBlur={() => {
              const v = Number(config.wordsPerChapter)
              if (!v || v < 100) update('wordsPerChapter', 3000)
            }}
            placeholder="3000"
            min={100}
          />
        </Field>
        <Field
          label={text('沉寂提醒阈值（章）', 'Dormant reminder threshold (chapters)')}
          htmlFor="narrative-thread-dormant-threshold"
          tipItems={[
            text(
              '提醒：线索连续若干章未推进后，在剧情「计划清单」上显示沉寂提醒',
              'Reminder: after several chapters without progress, the plot plan list flags the thread as dormant',
            ),
            text(
              '逾期：仍按该线索的预计回收章节即时计算，与此阈值无关',
              'Overdue: still computed from the thread’s expected payoff chapter, independent of this threshold',
            ),
            text(
              `默认：${DEFAULT_NARRATIVE_THREAD_DORMANT_THRESHOLD} 章，仅作用于当前项目`,
              `Default: ${DEFAULT_NARRATIVE_THREAD_DORMANT_THRESHOLD} chapters, this project only`,
            ),
          ]}
        >
          <div className="flex items-center gap-1.5">
            <Input
              id="narrative-thread-dormant-threshold"
              type="number"
              min={MIN_NARRATIVE_THREAD_DORMANT_THRESHOLD}
              max={MAX_NARRATIVE_THREAD_DORMANT_THRESHOLD}
              value={dormantThreshold}
              onChange={event => update(
                'narrativeThreadDormantChapterThreshold',
                resolveNarrativeThreadDormantThreshold(Number(event.target.value)),
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => update(
                'narrativeThreadDormantChapterThreshold',
                DEFAULT_NARRATIVE_THREAD_DORMANT_THRESHOLD,
              )}
              title={text('恢复默认值', 'Restore default')}
              aria-label={text('恢复默认值', 'Restore default')}
            >
              <RotateCcw size={13} />
            </Button>
          </div>
        </Field>
        <Field
          label={text('金手指', 'Special advantage')}
          htmlFor="project-golden-finger"
          tipItems={[
            text(
              '不需要：隐藏「金手指 / 核心卖点」，且不进入 AI 生成上下文',
              'Not needed: hides the section and keeps it out of AI generation context',
            ),
            text(
              '已写内容保留，切换回「需要」即可恢复',
              'Existing text is kept and restored when switched back',
            ),
          ]}
        >
          <NativeSelect
            id="project-golden-finger"
            value={goldenFingerEnabled ? 'yes' : 'no'}
            onChange={(event) => update('needsGoldenFinger', event.target.value === 'yes')}
          >
            <option value="yes">{text('需要', 'Needed')}</option>
            <option value="no">{text('不需要', 'Not needed')}</option>
          </NativeSelect>
        </Field>
      </div>
    </div>
  )
}

function fieldSize(value: string, locale: string): string {
  const count = value.replace(/\s+/g, '').length
  if (count === 0) return ''
  if (locale === 'zh-CN') return `${count.toLocaleString('zh-CN')} 字`
  return `${count.toLocaleString('en-US')} chars`
}

/** 坐标表单字段 */
function Field({
  label,
  htmlFor,
  tipItems,
  children,
}: {
  label: string
  htmlFor?: string
  tipItems?: string[]
  children: React.ReactNode
}) {
  const [showTip, setShowTip] = useState(false)
  const iconRef = useRef<HTMLSpanElement>(null)
  const [tipPos, setTipPos] = useState({ top: 0, left: 0 })

  const openTip = () => {
    const rect = iconRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = 260
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8))
    setTipPos({ top: rect.top, left })
    setShowTip(true)
  }

  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 flex items-center gap-1 font-medium text-[var(--color-text-muted)]" style={{ fontSize: 11 }}>
        {label}
        {tipItems && tipItems.length > 0 && (
          <span
            ref={iconRef}
            style={{ display: 'inline-flex' }}
            onMouseEnter={openTip}
            onMouseLeave={() => setShowTip(false)}
          >
            <Info size={11} style={{ opacity: 0.5 }} />
            {showTip && createPortal(
              <div
                style={{
                  position: 'fixed',
                  top: tipPos.top,
                  left: tipPos.left,
                  transform: 'translateY(-100%) translateY(-6px)',
                  padding: '8px 12px',
                  borderRadius: 8,
                  fontSize: 11,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-line',
                  color: 'var(--color-text)',
                  background: 'var(--color-bg-elevated, var(--color-sidebar))',
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                  zIndex: 10000,
                  width: 260,
                  pointerEvents: 'none',
                }}
              >
                {tipItems.map((item, i) => (
                  <div key={i}>
                    <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{item.split(/：|: /)[0]}</span>
                    {item.includes('：') ? '：' + item.split('：').slice(1).join('：') : ': ' + item.split(': ').slice(1).join(': ')}
                  </div>
                ))}
              </div>,
              document.body,
            )}
          </span>
        )}
      </label>
      {children}
    </div>
  )
}
