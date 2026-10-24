import { Cpu, ListChecks, ScrollText } from 'lucide-react'
import { useLayoutStore, type BottomTab } from '../../stores/layout-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useLocaleStore } from '../../stores/locale-store'

/** 底部面板的三个页签；顺序即展示顺序。 */
const BOTTOM_TABS: ReadonlyArray<{
  id: BottomTab
  zh: string
  en: string
  Icon: typeof ListChecks
}> = [
  { id: 'tasks', zh: '任务', en: 'Tasks', Icon: ListChecks },
  { id: 'log', zh: '日志', en: 'Logs', Icon: ScrollText },
  { id: 'models', zh: '模型调用', en: 'Model calls', Icon: Cpu },
]

/** 任务页签上的运行中数量：只统计正在跑或等待中的任务。 */
export function runningTaskCount(runs: ReadonlyArray<{ status?: string }>): number {
  return runs.filter(r => r.status === 'running' || r.status === 'waiting').length
}

/**
 * 底部面板页签条。
 *
 * 页签常驻在这里，而不是占用左侧内容导航：
 * - 面板收起时，它作为 34px 的常驻条仍然可见（见 App 布局）；
 * - 点当前页签在「展开 / 收起」之间切换，点其它页签只切换内容并展开。
 */
export function BottomPanelTabs() {
  const text = useLocaleStore(s => s.text)
  const bottomTab = useLayoutStore(s => s.bottomTab)
  const bottomPanelOpen = useLayoutStore(s => s.bottomPanelOpen)
  const selectBottomTab = useLayoutStore(s => s.selectBottomTab)
  const toggleBottomPanel = useLayoutStore(s => s.toggleBottomPanel)
  const activeRuns = useWorkflowStore(s => s.activeRuns)

  const runningCount = runningTaskCount(activeRuns)

  return (
    <div
      className="no-select flex items-center flex-shrink-0"
      style={{
        height: 'var(--width-bottom-bar)',
        gap: 14,
        padding: '0 12px',
        borderBottom: bottomPanelOpen ? '1px solid var(--color-border)' : 'none',
      }}
    >
      {BOTTOM_TABS.map(({ id, zh, en, Icon }) => {
        const active = bottomPanelOpen && bottomTab === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => selectBottomTab(id)}
            aria-expanded={active}
            className="relative flex h-full items-center transition-colors"
            style={{
              gap: 5,
              fontSize: 11,
              color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
              fontWeight: active ? 600 : 400,
            }}
          >
            <Icon size={13} strokeWidth={active ? 1.9 : 1.6} />
            {text(zh, en)}
            {id === 'tasks' && runningCount > 0 && (
              <span
                className="rounded px-1 font-mono"
                style={{
                  fontSize: 10,
                  backgroundColor: 'rgba(var(--color-accent-rgb), 0.12)',
                  color: 'var(--color-accent)',
                }}
              >
                {runningCount}
              </span>
            )}
            {active && (
              <span
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-t"
                style={{ backgroundColor: 'var(--color-accent)' }}
              />
            )}
          </button>
        )
      })}

      <button
        type="button"
        onClick={toggleBottomPanel}
        title={bottomPanelOpen ? text('收起面板', 'Collapse panel') : text('展开面板', 'Expand panel')}
        className="icon-btn ml-auto"
        style={{ width: 18, height: 18, transform: bottomPanelOpen ? 'none' : 'rotate(180deg)' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>
  )
}
