import { useEffect, useRef, useState } from 'react'
import { ChevronsDown, Trash2 } from 'lucide-react'
import { useLocaleStore } from '../../../stores/locale-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { Button } from '../../ui/Button'

export function LogsView() {
  const text = useLocaleStore(s => s.text)
  const globalLogs = useWorkflowStore(s => s.globalLogs)
  const clearLogs = useWorkflowStore(s => s.clearLogs)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [globalLogs.length, autoScroll])

  const levelColor = (level: string) => {
    switch (level) {
      case 'error': return 'var(--color-error-text)'
      case 'warn':  return 'var(--color-warning-text)'
      default:      return 'var(--color-text-secondary)'
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-1 px-2 py-1 flex-shrink-0">
        <span className="text-[0.68rem] text-[var(--color-text-muted)]">AI Writer v{__APP_VERSION__}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? text('自动滚动：开', 'Auto-scroll: on') : text('自动滚动：关', 'Auto-scroll: off')}
            className={autoScroll ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}
          >
            <ChevronsDown size={13} />
          </Button>
          <Button variant="ghost" size="icon" onClick={clearLogs} title={text('清空日志', 'Clear logs')}>
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pb-2 font-mono text-xs leading-5">
        {globalLogs.length === 0 && (
          <div className="text-center py-8 opacity-30">{text('暂无日志', 'No logs')}</div>
        )}
        {globalLogs.map((log, i) => (
          <div key={i} className="flex gap-2">
            <span style={{ color: 'var(--color-text-muted)' }}>{log.time}</span>
            <span style={{ color: levelColor(log.level) }}>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
