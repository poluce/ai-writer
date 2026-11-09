import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import {
  ArrowRight,
  BookOpen,
  FileUp,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react'
import type { Locale } from '../../i18n/types'
import { ipc } from '../../services/ipc-client'
import type { RecentProjectEntry, RecentProjectSnapshot } from '../../shared/recent-projects'
import { useLLMStore } from '../../stores/llm-store'
import { useLayoutStore } from '../../stores/layout-store'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'
import { formatRelativeTime } from '../../utils/time'
import { confirm } from '../ui/Confirm'
import { ContextMenu, type ContextMenuEntry } from '../ui/ContextMenu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog'
import { toast } from '../ui/Toast'

type Translate = (zhCNText: string, enUSText: string) => string

interface MenuState {
  project: RecentProjectEntry
  x: number
  y: number
}

const isMac = navigator.userAgent.includes('Mac')
const newProjectShortcut = isMac ? '⌘N' : 'Ctrl N'
const openProjectShortcut = isMac ? '⌘O' : 'Ctrl O'
const newProjectKeyshortcut = isMac ? 'Meta+N' : 'Control+N'
const openProjectKeyshortcut = isMac ? 'Meta+O' : 'Control+O'

function relativeTime(updatedAt: string, locale: Locale): string {
  const timestamp = new Date(updatedAt).getTime()
  if (!Number.isFinite(timestamp)) return ''
  return formatRelativeTime(timestamp, locale)
}

function formatWords(count: number, locale: Locale): string {
  if (!Number.isFinite(count) || count <= 0) return ''
  if (locale === 'zh-CN') {
    return count >= 10000
      ? `${(count / 10000).toFixed(1).replace(/\.0$/, '')} 万字`
      : `${count.toLocaleString('zh-CN')} 字`
  }
  return count >= 1000
    ? `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k words`
    : `${count.toLocaleString('en-US')} words`
}

function folderName(projectPath: string): string {
  const parts = projectPath.split(/[\\/]+/).filter(Boolean)
  return parts.length >= 2 ? parts[parts.length - 2] : ''
}

function progressOf(snapshot: RecentProjectSnapshot | undefined): { percent: number; label: string } | null {
  if (!snapshot?.totalChapters || !snapshot.lastChapterNumber) return null
  const percent = Math.min(100, Math.round((snapshot.lastChapterNumber / snapshot.totalChapters) * 100))
  return { percent, label: `${snapshot.lastChapterNumber} / ${snapshot.totalChapters}` }
}

function LauncherHero({
  project,
  text,
  locale,
  onContinue,
}: {
  project: RecentProjectEntry
  text: Translate
  locale: Locale
  onContinue: () => void
}) {
  const snapshot = project.snapshot
  const progress = progressOf(snapshot)
  const metaParts: ReactNode[] = []
  if (snapshot?.lastChapterNumber) {
    metaParts.push(
      <span key="chapter" className="launcher-chip">
        {text(`第 ${snapshot.lastChapterNumber} 章`, `Chapter ${snapshot.lastChapterNumber}`)}
      </span>,
    )
  }
  if (snapshot?.lastChapterTitle) {
    metaParts.push(<span key="chapter-title">{snapshot.lastChapterTitle}</span>)
  }
  const words = snapshot ? formatWords(snapshot.totalWords, locale) : ''
  if (words) {
    if (metaParts.length > 0) metaParts.push(<span key="sep-words" className="launcher-sep" />)
    metaParts.push(<span key="words" className="launcher-soft">{words}</span>)
  }
  if (snapshot?.totalChapters) {
    if (metaParts.length > 0) metaParts.push(<span key="sep-total" className="launcher-sep" />)
    metaParts.push(
      <span key="total" className="launcher-soft">
        {text(`全书 ${snapshot.totalChapters} 章`, `${snapshot.totalChapters} chapters planned`)}
      </span>,
    )
  }

  return (
    <section className="launcher-hero" aria-labelledby="launcher-continue-title">
      <div className="launcher-hero-top">
        <span className="launcher-eyebrow">
          <span className="launcher-eyebrow-dot" />
          {text('继续写作', 'Continue writing')}
        </span>
        <span className="launcher-when">{relativeTime(project.updatedAt, locale)}</span>
        <div className="launcher-hero-actions">
          <button type="button" className="launcher-btn launcher-btn-primary focus-ring" onClick={onContinue}>
            {text('继续写作', 'Continue')}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <h1 id="launcher-continue-title" className="launcher-title">{project.name}</h1>
      {metaParts.length > 0 && <div className="launcher-meta">{metaParts}</div>}
      {progress && (
        <div className="launcher-progress">
          <span className="launcher-caption">{text(`${progress.label} 章`, `Chapter ${progress.label}`)}</span>
          <div className="launcher-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
            <span className="launcher-bar-fill" style={{ width: `${progress.percent}%` }} />
          </div>
          <span className="launcher-caption">{progress.percent}%</span>
        </div>
      )}
      {snapshot?.excerpt && (
        <div className="launcher-excerpt">
          <span className="launcher-excerpt-label">{text('上次写到', 'Last written')}</span>
          <p className="launcher-excerpt-text">{snapshot.excerpt}</p>
        </div>
      )}
    </section>
  )
}

function LauncherRecentRow({
  project,
  text,
  locale,
  onOpen,
  onMore,
}: {
  project: RecentProjectEntry
  text: Translate
  locale: Locale
  onOpen: () => void
  onMore: (event: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  const snapshot = project.snapshot
  const meta = [
    snapshot?.lastChapterNumber
      ? text(`第 ${snapshot.lastChapterNumber} 章`, `Ch. ${snapshot.lastChapterNumber}`)
      : '',
    snapshot ? formatWords(snapshot.totalWords, locale) : '',
    folderName(project.path),
  ].filter(Boolean).join(' · ')
  const time = relativeTime(project.updatedAt, locale)

  return (
    <div className="launcher-row" role="listitem">
      <button
        type="button"
        className="launcher-row-open focus-ring"
        title={project.path}
        onClick={onOpen}
      >
        <span className="launcher-row-icon" aria-hidden="true">
          <BookOpen size={14} strokeWidth={1.7} />
        </span>
        <span className="launcher-row-text">
          <span className="launcher-row-name">{project.name}</span>
          {meta && <span className="launcher-row-meta">{meta}</span>}
        </span>
        {time && <span className="launcher-row-time">{time}</span>}
      </button>
      <button
        type="button"
        className="launcher-row-more focus-ring"
        aria-label={text(`更多操作：${project.name}`, `More actions: ${project.name}`)}
        onClick={onMore}
      >
        <MoreHorizontal size={15} aria-hidden="true" />
      </button>
    </div>
  )
}

function LauncherStartPanel({
  text,
  modelReady,
  modelName,
  showNew,
  showOpen,
  onNew,
  onOpen,
  onDeconstruct,
  onSettings,
}: {
  text: Translate
  modelReady: boolean
  modelName: string
  showNew: boolean
  showOpen: boolean
  onNew: () => void
  onOpen: () => void
  onDeconstruct: () => void
  onSettings: () => void
}) {
  return (
    <section className="launcher-start" aria-labelledby="launcher-start-title">
      <div className="launcher-sec-head">
        <h2 id="launcher-start-title" className="launcher-sec-title">{text('开始', 'Start')}</h2>
      </div>
      {showNew && (
        <button
          type="button"
          className="launcher-action focus-ring"
          aria-keyshortcuts={newProjectKeyshortcut}
          onClick={onNew}
        >
          <span className="launcher-action-icon launcher-action-icon-accent" aria-hidden="true">
            <Plus size={15} />
          </span>
          <span className="launcher-action-text">
            <span className="launcher-action-name">{text('新建项目', 'New project')}</span>
          </span>
          <span className="launcher-kbd" aria-hidden="true">{newProjectShortcut}</span>
        </button>
      )}
      {showOpen && (
        <button
          type="button"
          className="launcher-action focus-ring"
          aria-keyshortcuts={openProjectKeyshortcut}
          onClick={onOpen}
        >
          <span className="launcher-action-icon" aria-hidden="true">
            <FolderOpen size={15} />
          </span>
          <span className="launcher-action-text">
            <span className="launcher-action-name">{text('打开项目', 'Open project')}</span>
          </span>
          <span className="launcher-kbd" aria-hidden="true">{openProjectShortcut}</span>
        </button>
      )}
      <button type="button" className="launcher-action focus-ring" onClick={onDeconstruct}>
        <span className="launcher-action-icon" aria-hidden="true">
          <FileUp size={15} />
        </span>
        <span className="launcher-action-text">
          <span className="launcher-action-name">{text('拆解仿写', 'Style study')}</span>
          <span className="launcher-action-desc">
            {text('从参考小说提炼文风与结构', 'Derive style and structure from a reference novel')}
          </span>
        </span>
      </button>

      <div className="launcher-divider" />

      <div className="launcher-model">
        <span
          className={`launcher-model-dot${modelReady ? '' : ' launcher-model-dot-warn'}`}
          aria-hidden="true"
        />
        <span style={{ fontWeight: 600 }}>
          {modelReady ? text('模型已就绪', 'Model ready') : text('尚未配置模型', 'No model configured')}
        </span>
        <span className="launcher-model-name">
          {modelReady
            ? modelName
            : text('接入后才能使用 AI 生成', 'Connect a model to use AI generation')}
        </span>
        <button type="button" className="launcher-link focus-ring" onClick={onSettings}>
          {modelReady ? text('更换', 'Change') : text('去设置', 'Set up')}
        </button>
      </div>
    </section>
  )
}

function LauncherIntro({
  text,
  onNew,
  onOpen,
  onDeconstruct,
}: {
  text: Translate
  onNew: () => void
  onOpen: () => void
  onDeconstruct: () => void
}) {
  return (
    <section className="launcher-intro" aria-labelledby="launcher-intro-title">
      <span className="launcher-eyebrow">
        <span className="launcher-eyebrow-dot" />
        {text('新项目', 'New project')}
      </span>
      <h1 id="launcher-intro-title" className="launcher-intro-title">
        {text('开始一部长篇', 'Start a long-form project')}
      </h1>
      <p className="launcher-intro-sub">
        {text('从设定到定稿都在本地完成。模型随时可以接入。', 'Everything from premise to final draft stays local. Connect a model whenever you are ready.')}
      </p>
      <div className="launcher-intro-actions">
        <button type="button" className="launcher-btn launcher-btn-primary launcher-btn-lg focus-ring" onClick={onNew}>
          {text('新建项目', 'New project')}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
        <button type="button" className="launcher-btn launcher-btn-outline launcher-btn-lg focus-ring" onClick={onOpen}>
          <FolderOpen size={15} aria-hidden="true" />
          {text('打开已有项目', 'Open a project')}
        </button>
      </div>
      <p className="launcher-intro-alt">
        {text('或者 ', 'Or ')}
        <button type="button" className="focus-ring" onClick={onDeconstruct}>
          {text('拆解一本参考小说', 'study a reference novel')}
        </button>
        {text('，先建立自己的文风与结构约束。', ' to derive your style and structure.')}
      </p>
    </section>
  )
}

/**
 * 未打开项目时的主区空态。
 *
 * - launcher：项目工作区的启动页（继续写作 / 最近项目 / 新建入口）；
 * - workspace：其它工作区（知识库、蓝图…）的空态，由正文自己说明「这是哪儿」。
 */
export function OpenProjectFirstPage({
  title,
  mode = 'launcher',
}: {
  title?: string
  mode?: 'launcher' | 'workspace'
}) {
  const text = useLocaleStore(s => s.text)
  const locale = useLocaleStore(s => s.locale)
  const recentProjects = useProjectStore(s => s.recentProjects)
  const modelReady = useLLMStore(s => s.models.length > 0)
  const modelName = useLLMStore((s) => {
    const model = s.models.find(item => item.id === s.defaultModelId) ?? s.models[0]
    return model?.name?.trim() || model?.modelName?.trim() || ''
  })
  const [allProjectsOpen, setAllProjectsOpen] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)

  const latest = recentProjects[0]
  const others = recentProjects.slice(1, 6)

  const openNewProject = () => useLayoutStore.getState().openNewProject()
  const openDeconstruction = () => useLayoutStore.getState().openNovelDeconstruction()
  const openSettings = () => useLayoutStore.getState().openSettings()
  const openProject = (projectPath: string) => {
    void useProjectStore.getState().openProject(projectPath)
  }
  const pickProject = async () => {
    const folder = await ipc.invoke('dialog:select-folder')
    if (folder) await useProjectStore.getState().openProject(folder)
  }

  /** 从最近项目移除记录（不删项目文件） */
  const removeRecent = async (project: { name: string; path: string }) => {
    const ok = await confirm(
      text(
        `确认从最近项目中移除「${project.name}」？\n这只会移除列表记录，不会删除项目文件。`,
        `Remove “${project.name}” from recent projects?\nThis only removes the list entry and does not delete project files.`,
      ),
      {
        title: text('从最近项目移除', 'Remove from recent projects'),
        confirmText: text('移除记录', 'Remove entry'),
      },
    )
    if (!ok) return
    const success = await useProjectStore.getState().removeRecentProject(project.path)
    if (success) toast.success(text(`已从最近项目移除「${project.name}」`, `Removed “${project.name}”`))
  }

  const openMenu = (project: RecentProjectEntry, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setMenu({ project, x: Math.round(rect.right - 156), y: Math.round(rect.bottom + 4) })
  }

  const menuItems: ContextMenuEntry[] = menu
    ? [
        {
          key: 'open',
          label: text('打开项目', 'Open project'),
          icon: <FolderOpen size={13} />,
          onClick: () => {
            const target = menu.project
            setMenu(null)
            openProject(target.path)
          },
        },
        { key: 'divider', type: 'divider' },
        {
          key: 'remove',
          label: text('从最近项目移除', 'Remove from recent projects'),
          icon: <Trash2 size={13} />,
          danger: true,
          onClick: () => {
            const target = menu.project
            setMenu(null)
            void removeRecent(target)
          },
        },
      ]
    : []

  // 其它工作区：上下文由正文承担，不再重复侧栏已经给过的按钮
  if (mode === 'workspace') {
    return (
      <div className="skin-workspace-page h-full flex flex-col overflow-hidden bg-[var(--color-bg)]">
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="flex w-full max-w-[420px] flex-col items-center text-center">
            <span
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ backgroundColor: 'rgba(var(--color-accent-rgb), 0.1)', color: 'var(--color-accent)' }}
            >
              <BookOpen size={26} strokeWidth={1.6} />
            </span>
            <h2 className="mt-4 font-semibold" style={{ color: 'var(--color-text)', fontSize: 20 }}>
              {title}
            </h2>
            <p className="mt-1.5" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
              {text('打开项目后可查看这里的内容', 'Open a project to see this workspace')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const recentSection = latest ? (
    <section className="launcher-recent-col" aria-labelledby="launcher-others-title">
      <div className="launcher-sec-head">
        <h2 id="launcher-others-title" className="launcher-sec-title">{text('其他项目', 'Other projects')}</h2>
        <span className="launcher-sec-count">{others.length}</span>
        <button
          type="button"
          className="launcher-link focus-ring"
          onClick={() => setAllProjectsOpen(true)}
        >
          {text('全部项目', 'All projects')} <span aria-hidden="true">→</span>
        </button>
      </div>
      <div className="launcher-list" role="list">
        {others.length > 0
          ? others.map(project => (
              <LauncherRecentRow
                key={project.path}
                project={project}
                text={text}
                locale={locale as Locale}
                onOpen={() => openProject(project.path)}
                onMore={event => openMenu(project, event)}
              />
            ))
          : (
            <p className="launcher-row-meta" style={{ padding: '8px 12px' }}>
              {text('还没有其他项目', 'No other projects yet')}
            </p>
          )}
      </div>
    </section>
  ) : (
    <section className="launcher-recent-col" aria-labelledby="launcher-first-recent-title">
      <div className="launcher-sec-head">
        <h2 id="launcher-first-recent-title" className="launcher-sec-title">{text('最近项目', 'Recent projects')}</h2>
      </div>
      <div className="launcher-empty">
        <BookOpen size={17} strokeWidth={1.7} aria-hidden="true" />
        <div>
          <b>{text('最近打开的作品会显示在这里', 'Your recent projects will appear here')}</b>
          <span>{text('新建或打开项目后，这里会保留章节与字数进度。', 'Chapter and word-count progress will be kept once you start a project.')}</span>
        </div>
      </div>
    </section>
  )

  return (
    <div className="skin-workspace-page h-full flex flex-col overflow-hidden bg-[var(--color-bg)]">
      <div className="launcher-page">
        <div className="launcher-inner">
          <div className="launcher-cols">
            {latest
              ? (
                <>
                  <LauncherHero
                    project={latest}
                    text={text}
                    locale={locale as Locale}
                    onContinue={() => openProject(latest.path)}
                  />
                  {recentSection}
                </>
              )
              : (
                <>
                  <LauncherIntro
                    text={text}
                    onNew={openNewProject}
                    onOpen={() => void pickProject()}
                    onDeconstruct={openDeconstruction}
                  />
                  {recentSection}
                </>
              )}
            <LauncherStartPanel
              text={text}
              modelReady={modelReady}
              modelName={modelName}
              showNew={Boolean(latest)}
              showOpen={Boolean(latest)}
              onNew={openNewProject}
              onOpen={() => void pickProject()}
              onDeconstruct={openDeconstruction}
              onSettings={openSettings}
            />
          </div>
        </div>
      </div>

      <Dialog open={allProjectsOpen} onOpenChange={setAllProjectsOpen}>
        <DialogContent className="max-w-[560px] p-0 gap-0" aria-describedby={undefined}>
          <DialogHeader className="pr-12">
            <DialogTitle>{text('全部项目', 'All projects')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto p-3">
            {recentProjects.length > 0
              ? (
                <div className="launcher-list" role="list">
                  {recentProjects.map(project => (
                    <LauncherRecentRow
                      key={project.path}
                      project={project}
                      text={text}
                      locale={locale as Locale}
                      onOpen={() => openProject(project.path)}
                      onMore={event => openMenu(project, event)}
                    />
                  ))}
                </div>
              )
              : (
                <p className="launcher-row-meta" style={{ padding: '12px' }}>
                  {text('暂无最近项目', 'No recent projects')}
                </p>
              )}
          </div>
        </DialogContent>
      </Dialog>

      {menu && (
        <ContextMenu
          items={menuItems}
          position={{ x: menu.x, y: menu.y }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
