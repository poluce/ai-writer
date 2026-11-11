import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Copy, Trash2, XCircle } from 'lucide-react'
import type { ProjectSessionContext } from '../../../shared/ipc-channels'
import {
  projectSessionContextFromProject,
  sameProjectSessionContext,
} from '../../../shared/project-session-context'
import {
  coarseRuntimePlatform,
  formatSafeCallDiagnostic,
  type SafeDiagnosticWorkflow,
} from '../../../services/safe-call-diagnostic'
import { diagnosticWorkflowForCall, type LLMCallRecord } from '../../../services/stats-service'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { Button } from '../../ui/Button'
import { confirm } from '../../ui/Confirm'
import { toast } from '../../ui/Toast'
import { LLMDataRequestGate } from '../llm-data-request-gate'

export function SafeDiagnosticCopyButton({
  call,
  workflow,
}: {
  call: LLMCallRecord
  workflow?: SafeDiagnosticWorkflow
}) {
  const locale = useLocaleStore(s => s.locale)
  const text = useLocaleStore(s => s.text)

  const copyDiagnostic = async () => {
    if (!navigator.clipboard?.writeText) {
      toast.error(text('当前环境不支持复制安全诊断', 'Safe diagnostic copying is unavailable in this environment.'))
      return
    }
    const diagnostic = formatSafeCallDiagnostic({
      locale,
      appVersion: __APP_VERSION__,
      platform: coarseRuntimePlatform(navigator.platform),
      call,
      workflow,
    })
    try {
      await navigator.clipboard.writeText(diagnostic)
      toast.success(text('已复制安全诊断', 'Safe diagnostics copied.'))
    } catch {
      toast.error(text('复制安全诊断失败', 'Could not copy safe diagnostics.'))
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => void copyDiagnostic()}
      title={text('复制安全诊断', 'Copy safe diagnostics')}
      aria-label={text('复制安全诊断', 'Copy safe diagnostics')}
    >
      <Copy size={12} />
    </Button>
  )
}

export function ModelsView() {
  const text = useLocaleStore(s => s.text)
  const locale = useLocaleStore(s => s.locale)
  const currentProject = useProjectStore(s => s.currentProject)
  const projectSession = useMemo(
    () => projectSessionContextFromProject(currentProject),
    [currentProject],
  )
  const clearCalls = async () => {
    if (!projectSession) return
    const confirmed = await confirm(
      text(
        '确认清空本项目的模型调用记录？\n只删除统计与诊断日志，不影响任何小说内容。',
        'Clear model call records for this project?\nOnly statistics and diagnostics are removed; novel content is untouched.',
      ),
      {
        title: text('清空调用记录', 'Clear call records'),
        confirmText: text('清空', 'Clear'),
        danger: true,
      },
    )
    if (!confirmed) return
    try {
      const { clearLLMHistory } = await import('../../../services/stats-service')
      const result = await clearLLMHistory(projectSession)
      if (result.success) {
        toast.success(text(`已清空 ${result.deleted} 条调用记录`, `Cleared ${result.deleted} call records`))
      } else {
        toast.error(text('清空调用记录失败', 'Could not clear call records'))
      }
    } catch (error) {
      toast.error(text(
        `清空调用记录失败\n\n${error instanceof Error ? error.message : String(error)}`,
        `Could not clear call records\n\n${error instanceof Error ? error.message : String(error)}`,
      ))
    }
  }
  const [requestGate] = useState(() => new LLMDataRequestGate())
  const activeWorkflowRuns = useWorkflowStore(s => s.activeRuns)
  const workflowHistory = useWorkflowStore(s => s.history)
  const diagnosticWorkflowRuns = useMemo(
    () => [...activeWorkflowRuns, ...workflowHistory],
    [activeWorkflowRuns, workflowHistory],
  )
  const [data, setData] = useState<{
    projectSession: ProjectSessionContext
    stats: {
      totalCalls: number; successfulCalls: number; failedCalls: number; knownUsageCalls: number
      totalTokens: number | null
      totalPromptTokens: number | null; totalCompletionTokens: number | null
    }
    history: LLMCallRecord[]
  } | null>(null)

  const visibleData = data && sameProjectSessionContext(data.projectSession, projectSession)
    ? data
    : null
  const stats = visibleData?.stats ?? null
  const history = visibleData?.history ?? []

  useEffect(() => {
    if (!projectSession) {
      requestGate.invalidate()
      return
    }
    let disposed = false
    const load = () => {
      const ticket = requestGate.begin(projectSession)
      void import('../../../services/stats-service')
        .then(({ loadLLMData }) => loadLLMData(projectSession, 30))
        .then(({ stats: loadedStats, history: loadedHistory }) => {
          if (disposed) return
          const currentSession = projectSessionContextFromProject(
            useProjectStore.getState().currentProject,
          )
          if (!requestGate.isCurrent(ticket, currentSession)) return
          setData({ projectSession: ticket.projectSession, stats: loadedStats, history: loadedHistory })
        })
        .catch(() => {
          // IPC 失败时保持清空状态；旧请求也不能反向写入 UI。
        })
    }
    load()
    const refreshTimer = window.setInterval(load, 2000)
    return () => {
      disposed = true
      window.clearInterval(refreshTimer)
      requestGate.invalidate()
    }
  }, [projectSession, requestGate])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {stats && (
        <div
          className="flex items-center gap-4 px-4 py-2 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="text-[0.7rem] text-[var(--color-text-muted)]">
            <span className="font-bold text-sm text-[var(--color-text)]">{stats.totalCalls}</span> {text('次调用', 'calls')}
          </div>
          <div className="text-[0.7rem] text-[var(--color-text-muted)]">
            <span className="font-bold text-sm text-[var(--color-text)]">{stats.totalTokens == null ? text('未知', 'Unknown') : `${(stats.totalTokens / 1000).toFixed(1)}k`}</span> Tokens
            {stats.knownUsageCalls < stats.totalCalls && (
              <span>{text(`（${stats.knownUsageCalls}/${stats.totalCalls} 次已报告）`, ` (${stats.knownUsageCalls}/${stats.totalCalls} reported)`)}</span>
            )}
          </div>
          <div className="text-[0.7rem] text-[var(--color-text-muted)]">
            {text('输入', 'Input')} <span className="font-mono text-[var(--color-text-secondary)]">{stats.totalPromptTokens == null ? text('未知', 'Unknown') : `${(stats.totalPromptTokens / 1000).toFixed(1)}k`}</span>
          </div>
          <div className="text-[0.7rem] text-[var(--color-text-muted)]">
            {text('输出', 'Output')} <span className="font-mono text-[var(--color-text-secondary)]">{stats.totalCompletionTokens == null ? text('未知', 'Unknown') : `${(stats.totalCompletionTokens / 1000).toFixed(1)}k`}</span>
          </div>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { void clearCalls() }}
            title={text('清空调用记录', 'Clear call records')}
            aria-label={text('清空调用记录', 'Clear call records')}
            data-testid="clear-llm-calls"
            className="text-[var(--color-text-muted)]"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {history.length === 0 ? (
          <div className="flex items-center justify-center h-full opacity-30 text-sm">{text('暂无调用记录', 'No model calls')}</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr
                className="text-[0.7rem] text-[var(--color-text-muted)]"
                style={{ borderBottom: '1px solid var(--color-border)' }}
              >
                <th className="text-left px-4 py-1 font-medium">{text('时间', 'Time')}</th>
                <th className="text-left px-2 py-1 font-medium">{text('模型', 'Model')}</th>
                <th className="text-left px-2 py-1 font-medium">{text('用途', 'Purpose')}</th>
                <th className="text-right px-2 py-1 font-medium">Tokens</th>
                <th className="text-right px-2 py-1 font-medium">{text('耗时', 'Duration')}</th>
                <th className="text-center px-2 py-1 font-medium">{text('状态', 'Status')}</th>
                <th className="text-center px-2 py-1 font-medium">{text('诊断', 'Diagnostics')}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-[var(--color-hover)] transition-colors"
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                >
                  <td className="px-4 py-1 text-[var(--color-text-muted)]">
                    {new Date(row.createdAt).toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-2 py-1 text-[var(--color-text-secondary)]">{row.modelName || '-'}</td>
                  <td className="px-2 py-1 text-[var(--color-text-secondary)]">{row.purpose || '-'}</td>
                  <td className="px-2 py-1 text-right text-[var(--color-text)]">{row.totalTokens == null ? text('未知', 'Unknown') : row.totalTokens.toLocaleString(locale)}</td>
                  <td className="px-2 py-1 text-right text-[var(--color-text-muted)]">{(row.durationMs / 1000).toFixed(1)}s</td>
                  <td className="px-2 py-1 text-center">{row.success ? <CheckCircle2 size={12} style={{ color: 'var(--color-success)', display: 'inline' }} /> : <XCircle size={12} style={{ color: 'var(--color-error)', display: 'inline' }} />}</td>
                  <td className="px-2 py-0.5 text-center">
                    <SafeDiagnosticCopyButton
                      call={row}
                      workflow={projectSession
                        ? diagnosticWorkflowForCall(row, diagnosticWorkflowRuns, projectSession.projectPath)
                        : undefined}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
