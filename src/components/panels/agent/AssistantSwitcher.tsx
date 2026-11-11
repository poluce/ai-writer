import { useEffect, useRef, useState } from 'react'
import { useLayoutStore } from '../../../stores/layout-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { ASSISTANT_VIEWS } from './assistant-views'

/**
 * 右侧面板切换器。
 *
 * 五位助手的视图入口并进面板头部；工作流运行与输出已统一归并至底部「任务」看板。
 */
/** 面板窄于这个宽度时只留图标，避免五个标签挤成省略号。 */
const COMPACT_BREAKPOINT = 272

export function AssistantSwitcher() {
  const text = useLocaleStore(s => s.text)
  const rightView = useLayoutStore(s => s.rightView)
  const openRightPanel = useLayoutStore(s => s.openRightPanel)

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
      {ASSISTANT_VIEWS.map(({ id, zh, en, Icon }) => {
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
          </button>
        )
      })}
    </div>
  )
}
