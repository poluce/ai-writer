import { useEffect, useRef, useState } from 'react'
import { Bot, ClipboardCheck, DraftingCompass, ListTree, Workflow } from 'lucide-react'
import { useLayoutStore, type RightView } from '../../../stores/layout-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { useLocaleStore } from '../../../stores/locale-store'

/** 右侧面板的五个视图；顺序即展示顺序。 */
const VIEWS: ReadonlyArray<{
  id: RightView
  zh: string
  en: string
  Icon: typeof Bot
}> = [
  { id: 'agent', zh: '写作', en: 'Write', Icon: Bot },
  { id: 'architect', zh: '架构', en: 'Architect', Icon: DraftingCompass },
  { id: 'blueprint', zh: '蓝图', en: 'Blueprint', Icon: ListTree },
  { id: 'review', zh: '审稿', en: 'Review', Icon: ClipboardCheck },
  { id: 'ai-output', zh: '输出', en: 'Output', Icon: Workflow },
]

/** 右侧输出页签是否需要提示：有任务在跑、且当前没在查看输出。 */
export function shouldPulseOutputTab(
  rightView: RightView,
  runs: ReadonlyArray<{ status?: string }>,
): boolean {
  const running = runs.some(r => r.status === 'running' || r.status === 'waiting')
  return running && rightView !== 'ai-output'
}

/**
 * 右侧面板切换器。
 *
 * 取代原先独立成条的 30px 图标栏：五个视图入口并进面板头部，
 * 少一条纵向分区，也让「架构 / 蓝图」这类同名入口只出现一次。
 */
/** 面板窄于这个宽度时只留图标，避免五个标签挤成省略号。 */
const COMPACT_BREAKPOINT = 268

export function AssistantSwitcher() {
  const text = useLocaleStore(s => s.text)
  const rightView = useLayoutStore(s => s.rightView)
  const openRightPanel = useLayoutStore(s => s.openRightPanel)
  const activeRuns = useWorkflowStore(s => s.activeRuns)

  const showOutputPulse = shouldPulseOutputTab(rightView, activeRuns)

  const rootRef = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth
      setCompact(width > 0 && width < COMPACT_BREAKPOINT)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={rootRef}
      className="no-select flex items-center flex-shrink-0"
      style={{
        height: 34,
        gap: 2,
        padding: '4px 8px',
        borderBottom: '1px solid var(--color-border)',
      }}
      role="tablist"
    >
      {VIEWS.map(({ id, zh, en, Icon }) => {
        const active = rightView === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            title={text(zh, en)}
            aria-label={text(zh, en)}
            onClick={() => openRightPanel(id)}
            className="relative flex flex-1 items-center justify-center rounded-md transition-colors"
            style={{
              height: 26,
              gap: 5,
              fontSize: 10.5,
              minWidth: 0,
              backgroundColor: active ? 'var(--color-raised)' : 'transparent',
              color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
              fontWeight: active ? 500 : 400,
            }}
          >
            <Icon size={compact ? 15 : 13} strokeWidth={active ? 2 : 1.6} />
            {!compact && <span className="truncate">{text(zh, en)}</span>}
            {id === 'ai-output' && showOutputPulse && (
              <span
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: 'var(--color-accent)' }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
