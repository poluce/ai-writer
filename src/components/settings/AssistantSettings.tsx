import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Bot, Eye, RotateCcw, Trash2 } from 'lucide-react'

import { ipc } from '../../services/ipc-client'
import { buildAgentSkillCatalog } from '../../services/agent/skill-catalog'
import { skillRegistry } from '../../services/agent/skill-registry'
import {
  ASSISTANT_TYPES,
  assistantLabel,
  assistantModuleLabel,
  builtinAssistantModuleText,
  loadAssistantModuleDocs,
  resetAssistantModule,
  saveAssistantModule,
  type AssistantModuleDoc,
  type AssistantModuleId,
} from '../../services/agent/assistant-settings'
import {
  clearProjectCustomPrompts,
  loadCustomPrompts,
  loadProjectCustomPrompts,
} from '../../services/prompt-templates'
import type { AssistantPromptBlockView } from '../../shared/agent-prompt'
import type { AssistantType } from '../../shared/agent-conversation-archive'
import { confirm } from '../../shared/dialog-port'
import { resolveWritingLanguage, type WritingLanguage } from '../../shared/writing-language'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'
import { cn } from '../../lib/utils'
import { captureProjectSession, isProjectSessionCurrent } from '../project-session-gate'
import SystemPromptPreview from './SystemPromptPreview'

type Scope = 'global' | 'project'

const SOURCE_CONFIG = {
  builtin: { label: '内置默认', labelEn: 'Built-in', color: 'var(--color-text-muted)', bg: 'var(--color-hover)' },
  global: { label: '全局', labelEn: 'Global', color: 'var(--color-info)', bg: 'color-mix(in srgb, var(--color-info) 10%, transparent)' },
  project: { label: '项目', labelEn: 'Project', color: 'var(--color-success-text)', bg: 'color-mix(in srgb, var(--color-success) 10%, transparent)' },
} as const

type ModuleSelection = AssistantModuleId | 'skill_catalog'

const MODULES: AssistantModuleId[] = ['hard_rules', 'identity', 'work_rules']

export default function AssistantSettings(): ReactElement {
  const text = useLocaleStore((s) => s.text)
  const project = useProjectStore((s) => s.currentProject)
  const projectId = project?.id ?? null
  const projectPath = project?.path ?? null
  const projectSession = projectId && projectPath
    ? captureProjectSession({ id: projectId, path: projectPath })
    : null
  const projectWritingLanguage = resolveWritingLanguage(project?.novelConfig.writingLanguage)

  const [languageSelection, setLanguageSelection] = useState<{
    projectId: string | null
    writingLanguage: WritingLanguage
  }>({ projectId: projectId ?? null, writingLanguage: projectWritingLanguage })
  const editingLanguage = languageSelection.projectId === (projectId ?? null)
    ? languageSelection.writingLanguage
    : projectWritingLanguage

  const [assistantType, setAssistantType] = useState<AssistantType>('general')
  const [scope, setScope] = useState<Scope>('global')
  const [module, setModule] = useState<ModuleSelection>('hard_rules')
  const [docs, setDocs] = useState<AssistantModuleDoc[]>([])
  const [drafts, setDrafts] = useState<Record<AssistantModuleId, string>>({
    hard_rules: '',
    identity: '',
    work_rules: '',
  })
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [skillBlock, setSkillBlock] = useState<AssistantPromptBlockView | null>(null)
  const [showBuiltin, setShowBuiltin] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const saveTimer = useRef<number | null>(null)
  const pendingRef = useRef<{ module: AssistantModuleId; text: string } | null>(null)

  const docFor = (id: AssistantModuleId) => docs.find((doc) => doc.id === id)
  const selectedDoc = module === 'skill_catalog' ? undefined : docFor(module)
  const selectedText = module === 'skill_catalog' ? '' : drafts[module]

  function syncDrafts(nextDocs: AssistantModuleDoc[]): void {
    setDrafts({
      hard_rules: nextDocs.find((doc) => doc.id === 'hard_rules')?.text ?? '',
      identity: nextDocs.find((doc) => doc.id === 'identity')?.text ?? '',
      work_rules: nextDocs.find((doc) => doc.id === 'work_rules')?.text ?? '',
    })
  }

  async function refreshDocs(
    type: AssistantType,
    language: WritingLanguage,
    options: { resetDrafts: boolean; session?: typeof projectSession },
  ): Promise<void> {
    const nextDocs = await loadAssistantModuleDocs(type, language, options.session)
    setDocs(nextDocs)
    if (options.resetDrafts) syncDrafts(nextDocs)
  }

  async function refreshSkillBlock(type: AssistantType, language: WritingLanguage): Promise<void> {
    try {
      await skillRegistry.ensureLoaded()
      const result = await ipc.invoke(
        'agent:system-prompt',
        buildAgentSkillCatalog(language),
        type,
      )
      if (!result.success) {
        setSkillBlock(null)
        return
      }
      setSkillBlock(result.blocks?.find((block) => block.kind === 'skill_catalog') ?? null)
    } catch {
      setSkillBlock(null)
    }
  }

  useEffect(() => {
    void loadCustomPrompts(editingLanguage).catch(() => undefined)
  }, [editingLanguage])

  useEffect(() => {
    const session = projectId && projectPath
      ? captureProjectSession({ id: projectId, path: projectPath })
      : null
    if (!session) {
      clearProjectCustomPrompts()
    } else {
      void loadProjectCustomPrompts(session, editingLanguage)
    }
    // 异步载入放到宏任务里，避免在 effect 内同步触发级联渲染。
    const timer = window.setTimeout(() => {
      void refreshDocs(assistantType, editingLanguage, { resetDrafts: true, session })
      void refreshSkillBlock(assistantType, editingLanguage)
    }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantType, editingLanguage, projectId, projectPath])

  function clearTimer(): void {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
  }

  async function persist(moduleId: AssistantModuleId, value: string): Promise<void> {
    pendingRef.current = null
    const operationSession = scope === 'project' ? projectSession : null
    if (scope === 'project' && !operationSession) {
      setSaveState('error')
      return
    }
    setSaveState('saving')
    const saved = await saveAssistantModule({
      assistantType,
      module: moduleId,
      language: editingLanguage,
      scope,
      projectSession: operationSession,
      text: value,
    })
    if (operationSession && !isProjectSessionCurrent(operationSession)) return
    if (!saved) {
      setSaveState('error')
      return
    }
    await refreshDocs(assistantType, editingLanguage, { resetDrafts: false, session: operationSession })
    setSaveState('saved')
    setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
    void refreshSkillBlock(assistantType, editingLanguage)
  }

  async function flushPending(): Promise<void> {
    const pending = pendingRef.current
    if (!pending) return
    clearTimer()
    await persist(pending.module, pending.text)
  }

  function handleEdit(value: string): void {
    if (module === 'skill_catalog') return
    setDrafts((prev) => ({ ...prev, [module]: value }))
    pendingRef.current = { module, text: value }
    setSaveState('saving')
    clearTimer()
    saveTimer.current = window.setTimeout(() => {
      void persist(module, value)
    }, 700)
  }

  async function handleSwitchAssistant(next: AssistantType): Promise<void> {
    if (next === assistantType) return
    await flushPending()
    setModule('hard_rules')
    setShowBuiltin(false)
    setAssistantType(next)
  }

  async function handleSwitchScope(next: Scope): Promise<void> {
    if (next === scope) return
    await flushPending()
    setScope(next)
  }

  async function handleReset(): Promise<void> {
    if (module === 'skill_catalog') return
    clearTimer()
    pendingRef.current = null
    setSaveState('saving')
    const operationSession = scope === 'project' ? projectSession : null
    if (scope === 'project' && !operationSession) {
      setSaveState('error')
      return
    }
    const reset = await resetAssistantModule({
      assistantType,
      module,
      language: editingLanguage,
      projectSession: projectSession ?? undefined,
    })
    if (projectSession && !isProjectSessionCurrent(projectSession)) return
    if (!reset) {
      setSaveState('error')
      return
    }
    await refreshDocs(assistantType, editingLanguage, {
      resetDrafts: true,
      session: operationSession,
    })
    void refreshSkillBlock(assistantType, editingLanguage)
    setSaveState('saved')
    setSavedAt(null)
  }

  async function handleClear(): Promise<void> {
    if (module === 'skill_catalog') return
    const agreed = await confirm(
      text(
        '清空后这一块不会注入任何助手，四份系统提示都会失去这段规则。确定清空？',
        'Clearing removes this block from every assistant prompt. Continue?',
      ),
      {
        title: text('清空软件硬规则', 'Clear software hard rules'),
        confirmText: text('清空', 'Clear'),
        cancelText: text('取消', 'Cancel'),
        danger: true,
      },
    )
    if (!agreed) return
    handleEdit('')
  }

  const skillChars = skillBlock?.chars ?? 0

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="flex bg-[var(--color-hover)] rounded-lg p-0.5">
          {(['global', 'project'] as const).map((item) => {
            const disabled = item === 'project' && !projectSession
            return (
              <button
                key={item}
                onClick={() => void handleSwitchScope(item)}
                disabled={disabled}
                className={cn(
                  'px-3 py-1 rounded-md text-xs transition-colors',
                  scope === item ? 'bg-[var(--color-panel)] shadow-sm font-medium' : '',
                  disabled ? 'opacity-40 cursor-not-allowed' : '',
                )}
                style={{ color: scope === item ? 'var(--color-text)' : 'var(--color-text-muted)' }}
              >
                {text(item === 'global' ? '全局' : '本项目', item === 'global' ? 'Global' : 'Project')}
              </button>
            )
          })}
        </div>
        <select
          value={editingLanguage}
          onChange={(event) => {
            setShowBuiltin(false)
            setLanguageSelection({
              projectId: projectId ?? null,
              writingLanguage: event.target.value as WritingLanguage,
            })
          }}
          className="text-xs rounded-md px-2 py-1.5 outline-none"
          style={{
            backgroundColor: 'var(--color-hover)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <option value="zh-CN">{text('语言：中文', 'Language: Chinese')}</option>
          <option value="en-US">{text('语言：英文', 'Language: English')}</option>
        </select>
        <span className="ml-auto text-[0.68rem]" style={{ color: 'var(--color-text-muted)' }}>
          {projectSession
            ? text(`${project?.name ?? '当前项目'} · 编辑即自动保存`, `${project?.name ?? 'Current project'} · autosaved`)
            : text('未打开项目 · 仅可编辑全局配置', 'No project open · global edits only')}
        </span>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {ASSISTANT_TYPES.map((item) => (
          <button
            key={item}
            onClick={() => void handleSwitchAssistant(item)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs transition-colors',
              assistantType === item ? 'font-medium' : '',
            )}
            style={{
              color: assistantType === item ? 'var(--color-text)' : 'var(--color-text-muted)',
              backgroundColor: assistantType === item ? 'var(--color-panel)' : 'transparent',
              border: `1px solid ${assistantType === item ? 'var(--color-border)' : 'transparent'}`,
            }}
          >
            {assistantLabel(item, editingLanguage)}
          </button>
        ))}
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        <div className="w-48 flex-shrink-0 flex flex-col gap-1">
          {MODULES.map((item) => {
            const doc = docFor(item)
            const active = module === item
            const source = doc?.source ?? 'builtin'
            const sourceConfig = resolveSourceConfig(source)
            return (
              <button
                key={item}
                onClick={() => void flushPending().then(() => { setModule(item); setShowBuiltin(false) })}
                className={cn(
                  'text-left px-2.5 py-2 rounded-lg transition-colors',
                  active ? 'bg-[var(--color-panel)]' : 'hover:bg-[var(--color-hover)]',
                )}
                style={{ border: `1px solid ${active ? 'var(--color-border)' : 'transparent'}` }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                    {assistantModuleLabel(item, editingLanguage)}
                  </span>
                  <span
                    className="text-[0.6rem] px-1.5 py-0.5 rounded-full"
                    style={{ color: sourceConfig.color, backgroundColor: sourceConfig.bg }}
                  >
                    {text(sourceConfig.label, sourceConfig.labelEn)}
                  </span>
                </div>
                <div className="text-[0.65rem] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {doc ? `${doc.text.length.toLocaleString()} ${text('字符', 'chars')}` : ' '}
                </div>
              </button>
            )
          })}
          <button
            onClick={() => void flushPending().then(() => { setModule('skill_catalog'); setShowBuiltin(false) })}
            className={cn(
              'text-left px-2.5 py-2 rounded-lg transition-colors',
              module === 'skill_catalog' ? 'bg-[var(--color-panel)]' : 'hover:bg-[var(--color-hover)]',
            )}
            style={{
              border: `1px solid ${module === 'skill_catalog' ? 'var(--color-border)' : 'transparent'}`,
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                {text('技能目录', 'Skill catalog')}
              </span>
              <span
                className="text-[0.6rem] px-1.5 py-0.5 rounded-full"
                style={{ color: 'var(--color-info)', backgroundColor: 'color-mix(in srgb, var(--color-info) 10%, transparent)' }}
              >
                {text('自动生成', 'Auto')}
              </span>
            </div>
            <div className="text-[0.65rem] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {`${skillChars.toLocaleString()} ${text('字符', 'chars')}`}
            </div>
          </button>
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-2 rounded-lg p-3" style={{ border: '1px solid var(--color-border)' }}>
          {module === 'skill_catalog' ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  {text('技能目录', 'Skill catalog')}
                </span>
                <span className="text-[0.6rem] px-1.5 py-0.5 rounded-full" style={{ color: 'var(--color-info)', backgroundColor: 'color-mix(in srgb, var(--color-info) 10%, transparent)' }}>
                  {text('自动生成 · 只读', 'Auto · read-only')}
                </span>
              </div>
              <p className="text-[0.7rem] m-0" style={{ color: 'var(--color-text-muted)' }}>
                {text(
                  '四个助手都能加载技能；目录按写作阶段过滤，没有阶段标记的技能所有助手可见。',
                  'All four assistants can load skills; the catalog is filtered by writing stage, and unmarked skills are visible to everyone.',
                )}
              </p>
              <pre
                className="flex-1 min-h-0 overflow-auto rounded-md p-2.5 text-[0.7rem] leading-relaxed whitespace-pre-wrap font-mono m-0"
                style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text-secondary)' }}
              >
                {skillBlock?.text || text('当前没有可见技能。', 'No skills are visible to this assistant.')}
              </pre>
              <div className="text-[0.68rem]" style={{ color: 'var(--color-text-muted)' }}>
                {text('技能正文按需通过 manage_skills 读取，不进入系统提示词。', 'Skill bodies are loaded on demand via manage_skills and never enter the system prompt.')}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  {assistantModuleLabel(module, editingLanguage)}
                </span>
                {selectedDoc && (
                  <span
                    className="text-[0.6rem] px-1.5 py-0.5 rounded-full"
                    style={{
                      color: resolveSourceConfig(selectedDoc.source).color,
                      backgroundColor: resolveSourceConfig(selectedDoc.source).bg,
                    }}
                  >
                    {text(resolveSourceConfig(selectedDoc.source).label, resolveSourceConfig(selectedDoc.source).labelEn)}
                  </span>
                )}
                <span className="ml-auto text-[0.65rem]" style={{ color: 'var(--color-text-muted)' }}>
                  {`${selectedText.length.toLocaleString()} ${text('字符', 'chars')} · ${text('可编辑', 'editable')}`}
                </span>
              </div>
              {module === 'identity' && (
                <div className="flex items-center gap-1.5 text-[0.68rem]" style={{ color: 'var(--color-text-muted)' }}>
                  {text('变量', 'Variable')}
                  <code className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text-secondary)' }}>
                    {'{{mode_instruction}}'}
                  </code>
                  {text('由系统插入界面状态说明。', 'is replaced by the system with the interface-state note.')}
                </div>
              )}
              <textarea
                value={selectedText}
                onChange={(event) => handleEdit(event.target.value)}
                spellCheck={false}
                className="flex-1 min-h-0 w-full resize-none rounded-md p-2.5 text-[0.72rem] leading-6 outline-none font-mono"
                style={{
                  backgroundColor: 'var(--color-editor-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                }}
              />
              {showBuiltin && (
                <pre
                  className="max-h-32 overflow-auto rounded-md p-2 text-[0.68rem] whitespace-pre-wrap font-mono m-0"
                  style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text-muted)' }}
                >
                  {builtinAssistantModuleText(assistantType, module, editingLanguage)}
                </pre>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-[0.68rem]"
                  style={{
                    color: saveState === 'error'
                      ? 'var(--color-danger-text, var(--color-error-text, var(--color-text-muted)))'
                      : saveState === 'saved'
                        ? 'var(--color-success-text)'
                        : 'var(--color-text-muted)',
                  }}
                >
                  {saveState === 'saving' && text('保存中…', 'Saving…')}
                  {saveState === 'saved' && (savedAt
                    ? text(`已自动保存到${scope === 'global' ? '全局' : '项目'} · ${savedAt}`, `Saved to ${scope === 'global' ? 'global' : 'project'} · ${savedAt}`)
                    : text('已恢复', 'Reset'))}
                  {saveState === 'error' && text('保存失败，请重试', 'Save failed, try again')}
                  {saveState === 'idle' && text('编辑即自动保存', 'Autosaved as you type')}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  {module === 'hard_rules' && (
                    <button
                      onClick={() => void handleClear()}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[0.7rem] transition-colors hover:bg-[var(--color-hover)]"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      <Trash2 size={12} />
                      {text('清空', 'Clear')}
                    </button>
                  )}
                  <button
                    onClick={() => void handleReset()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[0.7rem] transition-colors hover:bg-[var(--color-hover)]"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <RotateCcw size={12} />
                    {text('恢复默认', 'Restore default')}
                  </button>
                  <button
                    onClick={() => setShowBuiltin((value) => !value)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[0.7rem] transition-colors hover:bg-[var(--color-hover)]"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <Eye size={12} />
                    {text('查看内置默认', 'View built-in')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end flex-shrink-0">
        <button
          onClick={() => setPreviewOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-white"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          <Bot size={13} />
          {text('预览最终系统提示词', 'Preview final system prompt')}
        </button>
      </div>

      <SystemPromptPreview
        key={assistantType}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        assistantType={assistantType}
      />
    </div>
  )
}

function resolveSourceConfig(source: AssistantModuleDoc['source']): {
  label: string
  labelEn: string
  color: string
  bg: string
} {
  return SOURCE_CONFIG[source]
}
