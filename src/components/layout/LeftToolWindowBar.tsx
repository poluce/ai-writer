import {
  FolderOpen,
  BookOpen,
  Users,
  ListTree,
  Globe2,
  GitBranch,
  Settings,
  Map} from 'lucide-react'
import { useLayoutStore, type SidebarView } from '../../stores/layout-store'
import { useProjectStore } from '../../stores/project-store'
import { useEditorStore } from '../../stores/editor-store'
import { openBuiltinEditor } from '../../services/editor-file-openers'
import { useLocaleStore } from '../../stores/locale-store'

/** 左侧内容导航按钮配置（首页已并入项目，不再单独渲染） */
const sidebarActivities: Array<{ id: SidebarView; icon: typeof FolderOpen; zh: string; en: string }> = [
  { id: 'project', icon: FolderOpen, zh: '项目', en: 'Project' },
]


function leftNavButtonClassName(active: boolean | undefined, disabled: boolean | undefined): string {
  let className = 'left-nav-button'
  if (active) className += ' is-active'
  if (disabled) className += ' is-disabled opacity-35 cursor-not-allowed pointer-events-none'
  return className
}

function LeftNavButton({
  icon: Icon,
  label,
  active,
  pulse,
  disabled,
  onClick,
  title}: {
  icon: typeof FolderOpen
  label: string
  active?: boolean
  pulse?: boolean
  disabled?: boolean
  onClick: () => void
  title?: string
}) {
  const text = useLocaleStore(s => s.text)
  const resolvedTitle = disabled
    ? `${title ?? label} (${text('请先打开项目', 'Open a project first')})`
    : (title ?? label)

  return (
    <div className="relative w-full px-1">
      <button
        onClick={onClick}
        disabled={disabled}
        title={resolvedTitle}
        className={leftNavButtonClassName(active, disabled)}
      >
        <Icon size={22} strokeWidth={active ? 2 : 1.75} />
        <span className="left-nav-label">{label}</span>
      </button>
      {pulse && !disabled && (
        <span
          className="absolute top-[5px] right-[5px] w-[5px] h-[5px] rounded-full animate-pulse pointer-events-none"
          style={{ backgroundColor: 'var(--color-accent)' }}
        />
      )}
    </div>
  )
}

/**
 * 左侧工具窗口栏（LeftToolWindowBar）
 * JetBrains 风格：带文字标签的左侧主导航，全高
 */
export default function LeftToolWindowBar() {
  const activeRailItem = useLayoutStore(s => s.activeRailItem)
  const setSidebarView = useLayoutStore(s => s.setSidebarView)
  const openSettings = useLayoutStore(s => s.openSettings)
  const hasOpenProject = useProjectStore(s => Boolean(s.currentProject))
  const text = useLocaleStore(s => s.text)

  const openProjectWorkspace = () => {
    setSidebarView('project')
    const project = useProjectStore.getState().currentProject
    if (!project) return
    useEditorStore.getState().openFile({
      id: 'config',
      name: text('小说配置', 'Novel configuration'),
      type: 'config',
      projectKey: project.path})
  }

  const plotTreeActive = activeRailItem === 'plot-tree'

  return (
    <div
      className="writer-left-rail no-select flex flex-col h-full"
      style={{
        width: 'var(--width-left-bar)',
        flexShrink: 0}}
    >
      {/* ===== 顶部：内容导航 ===== */}
      <div className="flex flex-col items-center w-full pt-0.5">

        {/* 侧边栏视图按钮 */}
        {sidebarActivities.map(({ id, icon: Icon, zh, en }) => {
          const label = text(zh, en)
          const isActive = activeRailItem === id
          const isDisabled = id === 'characters' && !hasOpenProject
          return (
            <LeftNavButton
              key={id}
              icon={Icon}
              label={label}
              active={isActive}
              disabled={isDisabled}
              title={label}
              onClick={() => {
                if (isDisabled) return
                if (id === 'project') openProjectWorkspace()
                else setSidebarView(id)
              }}
            />
          )
        })}

        <div className="writer-nav-divider w-8 my-1" style={{ height: 1 }} />

        <LeftNavButton
          icon={Globe2}
          label={text('架构', 'Architecture')}
          active={activeRailItem === 'world'}
          disabled={!hasOpenProject}
          title={text('故事架构', 'Story architecture')}
          onClick={() => {
            if (!hasOpenProject) return
            setSidebarView('project', 'world')
            openBuiltinEditor('world-building-editor', text('故事架构', 'Story architecture'), 'world-building')
          }}
        />
        <LeftNavButton
          icon={Map}
          label={text('情节', 'Plot')}
          active={activeRailItem === 'synopsis'}
          disabled={!hasOpenProject}
          title={text('情节', 'Plot')}
          onClick={() => {
            if (!hasOpenProject) return
            setSidebarView('project', 'synopsis')
            openBuiltinEditor('synopsis-editor', text('情节', 'Plot'), 'synopsis')
          }}
        />
        <LeftNavButton
          icon={ListTree}
          label={text('蓝图', 'Plot')}
          active={activeRailItem === 'blueprint'}
          disabled={!hasOpenProject}
          title={text('章节蓝图', 'Chapter blueprint')}
          onClick={() => {
            if (!hasOpenProject) return
            setSidebarView('project', 'blueprint')
            openBuiltinEditor('chapter-card-editor', text('章节蓝图', 'Chapter blueprint'), 'chapter-card')
          }}
        />
        <LeftNavButton
          icon={GitBranch}
          label={text('剧情', 'Plot tree')}
          active={plotTreeActive}
          disabled={!hasOpenProject}
          title={text('剧情树', 'Plot tree')}
          onClick={() => {
            if (!hasOpenProject) return
            setSidebarView('project', 'plot-tree')
            openBuiltinEditor(
              'narrative-thread-editor',
              text('剧情树与叙事线索', 'Plot tree & narrative threads'),
              'narrative-thread',
              'plot-tree',
            )
          }}
        />
        <LeftNavButton
          icon={Users}
          label={text('人物', 'Cast')}
          active={activeRailItem === 'characters'}
          disabled={!hasOpenProject}
          title={text('人物', 'Cast')}
          onClick={() => {
            if (!hasOpenProject) return
            setSidebarView('characters')
          }}
        />
        <LeftNavButton
          icon={BookOpen}
          label={text('知识库', 'Knowledge')}
          active={activeRailItem === 'knowledge'}
          disabled={!hasOpenProject}
          title={text('知识库', 'Knowledge base')}
          onClick={() => {
            if (!hasOpenProject) return
            setSidebarView('knowledge')
          }}
        />
      </div>

      {/* 弹性间隔 */}
      <div className="flex-1" />

      {/* ===== 底部：设置（任务/日志/模型 已归底部页签条） ===== */}
      <div className="flex flex-col items-center w-full pb-1">
        <div className="writer-nav-divider w-8 mb-1" style={{ height: 1 }} />

        <LeftNavButton
          icon={Settings}
          label={text('设置', 'Settings')}
          active={activeRailItem === 'settings'}
          onClick={() => openSettings()}
        />
      </div>
    </div>
  )
}
