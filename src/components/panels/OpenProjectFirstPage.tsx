import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  ArrowRight,
  BookOpen,
  FileUp,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Search,
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

/** 章节点阵上限：超过这个数量的章节点阵会退化为一条刻度线 */
const MAX_CHAPTER_DOTS = 400

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

function percentOf(snapshot: RecentProjectSnapshot | undefined): number | null {
  if (!snapshot?.totalChapters || !snapshot.lastChapterNumber) return null
  return Math.min(100, Math.round((snapshot.lastChapterNumber / snapshot.totalChapters) * 100))
}

function padIndex(index: number): string {
  return String(index + 1).padStart(2, '0')
}

function ChapterGrid({
  written,
  finalized,
  total,
}: {
  written: number
  finalized: number
  total: number
}) {
  const count = Math.min(total, MAX_CHAPTER_DOTS)
  const dots = useMemo(
    () => Array.from({ length: count }, (_, index) => (
      index < finalized ? 'is-final' : index < written ? 'is-written' : ''
    )),
    [count, finalized, written],
  )
  return (
    <div
      className="launcher-chapters"
      role="img"
      aria-label={`${written} / ${total}`}
    >
      {dots.map((className, index) => (
        <i key={index} className={className || undefined} />
      ))}
    </div>
  )
}

function LauncherHero({
  project,
  text,
  locale,
  onContinue,
  onBlueprint,
}: {
  project: RecentProjectEntry
  text: Translate
  locale: Locale
  onContinue: () => void
  onBlueprint: () => void
}) {
  const snapshot = project.snapshot
  const percent = percentOf(snapshot)
  const words = snapshot ? formatWords(snapshot.totalWords, locale) : ''
  const lastChapter = snapshot?.lastChapterNumber ?? 0
  const totalChapters = snapshot?.totalChapters ?? 0
  const finalized = snapshot?.finalizedChapters ?? 0
  const remaining = totalChapters > 0 ? Math.max(totalChapters - lastChapter, 0) : 0

  const hasProgress = Boolean(snapshot && totalChapters > 0)

  return (
    <section
      className={`launcher-hero${hasProgress ? '' : ' launcher-hero-single'}`}
      aria-labelledby="launcher-continue-title"
    >
      <div className="launcher-hero-main">
        <div className="launcher-eyebrow">
          <span className="launcher-eyebrow-rule" aria-hidden="true" />
          {text('上次编辑', 'Last edited')} · {relativeTime(project.updatedAt, locale)}
        </div>
        <div className="launcher-title-row">
          <h1 id="launcher-continue-title" className="launcher-title">{project.name}</h1>
          <div className="launcher-actions">
            <button type="button" className="launcher-continue focus-ring" onClick={onContinue}>
              {lastChapter > 0
                ? text(`继续写第 ${lastChapter} 章`, `Continue chapter ${lastChapter}`)
                : text('继续写作', 'Continue writing')}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
            <button type="button" className="launcher-secondary focus-ring" onClick={onBlueprint}>
              {text('章节蓝图', 'Chapter blueprint')}
            </button>
          </div>
        </div>
        <div className="launcher-meta">
          {lastChapter > 0 && (
            <span className="launcher-meta-strong">
              {text(`第 ${lastChapter} 章`, `Chapter ${lastChapter}`)}
            </span>
          )}
          {snapshot?.lastChapterTitle && <span>{snapshot.lastChapterTitle}</span>}
          {words && (
            <>
              <span className="launcher-meta-sep" aria-hidden="true" />
              <span>{words}</span>
            </>
          )}
          {finalized > 0 && (
            <>
              <span className="launcher-meta-sep" aria-hidden="true" />
              <span>{text(`已定稿 ${finalized} 章`, `${finalized} finalized`)}</span>
            </>
          )}
          {totalChapters > 0 && (
            <>
              <span className="launcher-meta-sep" aria-hidden="true" />
              <span>{text(`计划 ${totalChapters} 章`, `${totalChapters} planned`)}</span>
            </>
          )}
        </div>

        {snapshot?.excerpt && (
          <div className="launcher-excerpt">
            <span className="launcher-excerpt-label">{text('上次写到', 'Last written')}</span>
            <p className="launcher-excerpt-text">{snapshot.excerpt}</p>
          </div>
        )}
      </div>

      {hasProgress && (
        <aside className="launcher-progress" aria-label={text('进度', 'Progress')}>
          <div className="launcher-progress-label">{text('进度', 'Progress')}</div>
          <div className="launcher-progress-num">
            <b>{lastChapter}</b>
            <span>{text(`/ ${totalChapters} 章`, `/ ${totalChapters} chapters`)}</span>
            {percent !== null && <em className="launcher-progress-percent">{percent}%</em>}
          </div>
          {totalChapters <= MAX_CHAPTER_DOTS
            ? (
              <ChapterGrid
                written={lastChapter}
                finalized={finalized}
                total={totalChapters}
              />
            )
            : (
              <div className="launcher-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? 0}>
                <span style={{ width: `${percent ?? 0}%` }} />
              </div>
            )}
          <div className="launcher-legend">
            <span>
              <i className="is-written" aria-hidden="true" />
              {text(`已写 ${lastChapter} 章`, `${lastChapter} drafted`)}
            </span>
            <span>
              <i aria-hidden="true" />
              {text(`待写 ${remaining} 章`, `${remaining} remaining`)}
            </span>
          </div>
          <div className="launcher-stats">
            <div><span>{text('已写章节', 'Drafted')}</span><b>{lastChapter}</b></div>
            <div><span>{text('已定稿', 'Finalized')}</span><b>{finalized}</b></div>
            <div><span>{text('待写章节', 'Remaining')}</span><b>{remaining}</b></div>
          </div>
        </aside>
      )}
    </section>
  )
}

function LauncherRow({
  project,
  index,
  text,
  locale,
  onOpen,
  onMore,
}: {
  project: RecentProjectEntry
  index: number
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
    snapshot?.finalizedChapters
      ? text(`已定稿 ${snapshot.finalizedChapters} 章`, `${snapshot.finalizedChapters} finalized`)
      : '',
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
        <span className="launcher-row-index" aria-hidden="true">{padIndex(index)}</span>
        <span className="launcher-row-text">
          <span className="launcher-row-name">{project.name}</span>
          {meta && <span className="launcher-row-meta">{meta}</span>}
        </span>
        <span className="launcher-row-tail">
          {time && <span className="launcher-row-date">{time}</span>}
          <span className="launcher-row-go" aria-hidden="true">
            {text('继续 →', 'Continue →')}
          </span>
        </span>
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

function LauncherStart({
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
    <div className="launcher-start">
      <span className="launcher-start-label">{text('开始', 'Start')}</span>
      <button type="button" className="launcher-start-item focus-ring" aria-keyshortcuts={newProjectKeyshortcut} onClick={onNew}>
        <Plus size={13} aria-hidden="true" />
        {text('新建项目', 'New project')}
        <span className="launcher-kbd" aria-hidden="true">{newProjectShortcut}</span>
      </button>
      <button type="button" className="launcher-start-item focus-ring" aria-keyshortcuts={openProjectKeyshortcut} onClick={onOpen}>
        <FolderOpen size={13} aria-hidden="true" />
        {text('打开项目', 'Open project')}
        <span className="launcher-kbd" aria-hidden="true">{openProjectShortcut}</span>
      </button>
      <button type="button" className="launcher-start-item focus-ring" onClick={onDeconstruct}>
        <FileUp size={13} aria-hidden="true" />
        {text('拆解参考小说', 'Study a reference novel')}
      </button>
    </div>
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
      <div className="launcher-eyebrow">
        <span className="launcher-eyebrow-rule" aria-hidden="true" />
        {text('新项目', 'New project')}
      </div>
      <h1 id="launcher-intro-title" className="launcher-title launcher-title-intro">
        {text('开始一部长篇', 'Start a long-form project')}
      </h1>
      <p className="launcher-intro-sub">
        {text(
          '从一句核心前提到一百章定稿。设定、蓝图、人物与正文都存放在本地项目里，模型随时可以接入。',
          'From a single premise to a finished hundred-chapter draft. Premise, blueprint, cast and prose stay in your local project; connect a model whenever you are ready.',
        )}
      </p>
      <div className="launcher-actions">
        <button type="button" className="launcher-continue focus-ring" onClick={onNew}>
          {text('新建项目', 'New project')}
          <ArrowRight size={14} aria-hidden="true" />
        </button>
        <button type="button" className="launcher-secondary focus-ring" onClick={onOpen}>
          {text('打开已有项目', 'Open a project')}
        </button>
        <button type="button" className="launcher-secondary focus-ring" onClick={onDeconstruct}>
          {text('拆解参考小说', 'Study a reference novel')}
        </button>
      </div>
      <div className="launcher-intro-points">
        <div>
          <b>{text('本地优先', 'Local first')}</b>
          <span>{text('项目就是一个文件夹，随时可以备份', 'A project is just a folder you can back up')}</span>
        </div>
        <div>
          <b>{text('蓝图驱动', 'Blueprint driven')}</b>
          <span>{text('先定结构，再写正文，连续性可追溯', 'Structure first, prose second, continuity traceable')}</span>
        </div>
        <div>
          <b>{text('多助手协作', 'Assistants')}</b>
          <span>{text('架构、蓝图、写作、审稿各司其职', 'Architect, blueprint, writer and reviewer each own their step')}</span>
        </div>
      </div>
    </section>
  )
}

/**
 * 未打开项目时的主区空态。
 *
 * - launcher：项目工作区的启动页（卷首式主稿区 + 项目书目 + 开始入口）；
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
  const [query, setQuery] = useState('')

  const latest = recentProjects[0]
  const others = recentProjects.slice(1)
  const filteredOthers = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return others
    return others.filter(project =>
      project.name.toLowerCase().includes(keyword) || project.path.toLowerCase().includes(keyword),
    )
  }, [others, query])

  const openNewProject = () => useLayoutStore.getState().openNewProject()
  const openDeconstruction = () => useLayoutStore.getState().openNovelDeconstruction()
  const openSettings = () => useLayoutStore.getState().openSettings()
  const openProject = (projectPath: string) => {
    void useProjectStore.getState().openProject(projectPath)
  }
  const openBlueprint = async (projectPath: string) => {
    const opened = await useProjectStore.getState().openProject(projectPath)
    if (opened) useLayoutStore.getState().openRightPanel('blueprint')
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

  return (
    <div className="skin-workspace-page h-full flex flex-col overflow-hidden bg-[var(--color-bg)]">
      <div className="launcher-page">
        <div className="launcher-inner">
          <header className="launcher-top">
            <span className="launcher-kicker">{text('VELA · 工作台', 'VELA · Workbench')}</span>
            <div className="launcher-model-line">
              <span
                className={`launcher-model-dot${modelReady ? '' : ' launcher-model-dot-warn'}`}
                aria-hidden="true"
              />
              <b>{modelReady ? text('模型已就绪', 'Model ready') : text('尚未配置模型', 'No model configured')}</b>
              <span className="launcher-model-name">
                {modelReady
                  ? modelName
                  : text('接入后才能使用 AI 生成', 'Connect a model to use AI generation')}
              </span>
              <button type="button" className="launcher-model-change focus-ring" onClick={openSettings}>
                {modelReady ? text('更换', 'Change') : text('去设置', 'Set up')}
              </button>
            </div>
          </header>

          {latest
            ? (
              <LauncherHero
                project={latest}
                text={text}
                locale={locale as Locale}
                onContinue={() => openProject(latest.path)}
                onBlueprint={() => void openBlueprint(latest.path)}
              />
            )
            : (
              <LauncherIntro
                text={text}
                onNew={openNewProject}
                onOpen={() => void pickProject()}
                onDeconstruct={openDeconstruction}
              />
            )}

          {latest
            ? (
              <section className="launcher-projects" aria-labelledby="launcher-projects-title">
                <div className="launcher-sec">
                  <h2 id="launcher-projects-title" className="launcher-sec-title">
                    {text('项目', 'Projects')}
                  </h2>
                  <span className="launcher-sec-count">{others.length}</span>
                  <div className="launcher-sec-tools">
                    <label className="launcher-search">
                      <Search size={12} aria-hidden="true" />
                      <input
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder={text('搜索项目', 'Search projects')}
                        aria-label={text('搜索项目', 'Search projects')}
                      />
                    </label>
                    <button
                      type="button"
                      className="launcher-all focus-ring"
                      onClick={() => setAllProjectsOpen(true)}
                    >
                      {text('全部项目', 'All projects')} →
                    </button>
                  </div>
                </div>
                <div className="launcher-rows" role="list">
                  {filteredOthers.length > 0
                    ? filteredOthers.map((project, index) => (
                        <LauncherRow
                          key={project.path}
                          project={project}
                          index={index}
                          text={text}
                          locale={locale as Locale}
                          onOpen={() => openProject(project.path)}
                          onMore={event => openMenu(project, event)}
                        />
                      ))
                    : (
                      <p className="launcher-rows-empty">
                        {query.trim()
                          ? text('没有匹配的项目', 'No matching projects')
                          : text('还没有其他项目', 'No other projects yet')}
                      </p>
                    )}
                  <button type="button" className="launcher-row-new focus-ring" onClick={openNewProject}>
                    <span className="launcher-row-index" aria-hidden="true">+</span>
                    <span className="launcher-row-text">
                      <span className="launcher-row-name">{text('新建项目', 'New project')}</span>
                      <span className="launcher-row-meta">
                        {text('从一个核心前提开始', 'Start from a single premise')}
                      </span>
                    </span>
                    <span className="launcher-row-tail">
                      <span className="launcher-kbd" aria-hidden="true">{newProjectShortcut}</span>
                    </span>
                  </button>
                </div>
              </section>
            )
            : (
              <section className="launcher-projects" aria-labelledby="launcher-recent-empty-title">
                <div className="launcher-sec">
                  <h2 id="launcher-recent-empty-title" className="launcher-sec-title">
                    {text('最近项目', 'Recent projects')}
                  </h2>
                </div>
                <div className="launcher-empty">
                  <BookOpen size={17} strokeWidth={1.7} aria-hidden="true" />
                  <div>
                    <b>{text('最近打开的作品会显示在这里', 'Your recent projects will appear here')}</b>
                    <span>
                      {text(
                        '新建或打开项目后，这里会保留章节与字数进度。',
                        'Chapter and word-count progress will be kept once you start a project.',
                      )}
                    </span>
                  </div>
                </div>
              </section>
            )}

          {latest && (
            <LauncherStart
              text={text}
              onNew={openNewProject}
              onOpen={() => void pickProject()}
              onDeconstruct={openDeconstruction}
            />
          )}
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
                <div className="launcher-rows" role="list">
                  {recentProjects.map((project, index) => (
                    <LauncherRow
                      key={project.path}
                      project={project}
                      index={index}
                      text={text}
                      locale={locale as Locale}
                      onOpen={() => openProject(project.path)}
                      onMore={event => openMenu(project, event)}
                    />
                  ))}
                </div>
              )
              : (
                <p className="launcher-rows-empty">
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
