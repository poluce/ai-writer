import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, History, Trash2 } from 'lucide-react'

import type { ImportPurpose, ImportRunSnapshot } from '../../shared/import-run'
import { ipc } from '../../services/ipc-client'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'
import { captureProjectSession, isProjectSessionCurrent } from '../project-session-gate'
import { formatRelativeTime } from '../../utils/time'
import { Button } from '../ui/Button'
import { confirm } from '../ui/Confirm'
import { toast } from '../ui/Toast'

const STATUS_LABELS: Record<ImportRunSnapshot['status'], readonly [string, string]> = {
  ready: ['待继续', 'Ready'],
  running: ['进行中', 'Running'],
  failed: ['失败', 'Failed'],
  cancelled: ['已取消', 'Cancelled'],
  completed: ['已完成', 'Completed'],
}

interface ImportRunHistoryProps {
  purpose: ImportPurpose
  /** 删除成功后通知父级把对应记录从「可继续的导入」里摘掉。 */
  onDeleted?: (runId: string, purpose: ImportPurpose) => void
}

/**
 * 导入历史管理：导入运行记录只增不减会让项目库持续膨胀，这里提供可视化的
 * 查看与删除入口。删除仅清理运行记录/章节快照/收据，不删除已导入到项目里的
 * 知识文档、蓝图或原稿，也不会删除跨运行的来源映射（避免重复导入）。
 */
export default function ImportRunHistory({ purpose, onDeleted }: ImportRunHistoryProps) {
  const text = useLocaleStore(s => s.text)
  const locale = useLocaleStore(s => s.locale)
  const currentProject = useProjectStore(s => s.currentProject)
  const [expanded, setExpanded] = useState(false)
  const [runs, setRuns] = useState<ImportRunSnapshot[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!expanded) return
    let cancelled = false
    void (async () => {
      const session = captureProjectSession(currentProject)
      if (!session) return
      try {
        const rows = await ipc.invokeWithProjectSession(
          session,
          'db:import-run-list-recent',
          20,
          session.projectPath,
        )
        if (cancelled || !isProjectSessionCurrent(session)) return
        setRuns(((rows ?? []) as ImportRunSnapshot[]).filter(run => run.purpose === purpose))
      } catch {
        if (!cancelled && isProjectSessionCurrent(session)) setRuns([])
      }
    })()
    return () => { cancelled = true }
  }, [expanded, currentProject, purpose])

  const deleteRun = async (run: ImportRunSnapshot) => {
    const session = captureProjectSession(currentProject)
    if (!session || !isProjectSessionCurrent(session)) return
    const confirmed = await confirm(
      text(
        '确认删除这条导入记录？\n只删除运行记录、章节快照与收据；已导入到项目里的知识库、蓝图和原稿不会删除。进行中的导入需要先取消。',
        'Delete this import record?\nOnly the run record, chapter snapshots, and receipts are removed. Knowledge documents, blueprints, and manuscripts already imported stay untouched. Cancel a running import first.',
      ),
      {
        title: text('删除导入记录', 'Delete import record'),
        confirmText: text('删除', 'Delete'),
        danger: true,
      },
    )
    if (!confirmed || !isProjectSessionCurrent(session)) return
    setDeletingId(run.id)
    try {
      const result = await ipc.invokeWithProjectSession(
        session,
        'db:import-run-delete',
        run.id,
        session.projectPath,
      )
      if (!isProjectSessionCurrent(session)) return
      if (!result.success && result.errorCode === 'IMPORT_RUN_RUNNING') {
        toast.error(text(
          '导入仍在进行中，请先取消并等它停止后再删除记录。',
          'The import is still running. Cancel it and wait for it to stop before deleting the record.',
        ))
        return
      }
      if (!result.success && result.errorCode !== 'IMPORT_RUN_NOT_FOUND') {
        toast.error(text(
          `删除导入记录失败\n\n${result.error ?? ''}`,
          `Could not delete the import record\n\n${result.error ?? ''}`,
        ))
        return
      }
      setRuns(previous => previous.filter(item => item.id !== run.id))
      onDeleted?.(run.id, purpose)
      toast.success(text('已删除导入记录', 'Import record deleted'))
    } catch (error) {
      if (!isProjectSessionCurrent(session)) return
      toast.error(text(
        `删除导入记录失败\n\n${error instanceof Error ? error.message : String(error)}`,
        `Could not delete the import record\n\n${error instanceof Error ? error.message : String(error)}`,
      ))
    } finally {
      if (isProjectSessionCurrent(session)) setDeletingId(null)
    }
  }

  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{ border: '1px solid var(--color-border)' }}
      data-testid="import-run-history"
    >
      <button
        type="button"
        className="flex w-full items-center gap-1.5 font-medium"
        style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}
        aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}
        data-testid="import-run-history-toggle"
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <History size={13} />
        {text('导入历史', 'Import history')}
      </button>
      {expanded && (
        <div className="mt-2 space-y-1" data-testid="import-run-history-list">
          {runs.length === 0 && (
            <div style={{ color: 'var(--color-text-muted)' }}>
              {text('暂无导入记录', 'No import records')}
            </div>
          )}
          {runs.map(run => {
            const [zhLabel, enLabel] = STATUS_LABELS[run.status]
            const displayName = run.sourceDisplay?.[0]?.displayName ?? run.id
            return (
              <div
                key={run.id}
                className="flex items-center gap-2"
                data-testid={`import-run-history-row-${run.id}`}
              >
                <span className="truncate flex-1" title={displayName}>{displayName}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {text(zhLabel, enLabel)}
                  {' · '}
                  {text(`${run.completedChapters}/${run.totalChapters} 章`, `${run.completedChapters}/${run.totalChapters} ch`)}
                  {' · '}
                  {formatRelativeTime(Date.parse(run.updatedAt || run.createdAt), locale)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={run.status === 'running' || deletingId === run.id}
                  onClick={() => { void deleteRun(run) }}
                  title={text('删除导入记录', 'Delete import record')}
                  aria-label={text('删除导入记录', 'Delete import record')}
                  data-testid={`import-run-history-delete-${run.id}`}
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
