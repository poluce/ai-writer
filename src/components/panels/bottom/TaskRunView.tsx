import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2, Clock, Loader2, Pause, Play, StopCircle, X, XCircle, Zap,
} from 'lucide-react'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import { useWorkflowStore, type WorkflowRun } from '../../../stores/workflow-store'
import { RecoveryCandidatesBar } from './RecoveryCandidatesBar'
import { useRecoveryCandidates } from './use-recovery-candidates'
import { WorkflowFailureNotice } from './WorkflowFailureNotice'
import {
  rawStepResultText,
  runLocaleText,
  splitThinkAndContent,
} from './workflow-stream-text'
import { WorkflowStepItem } from './WorkflowStepStream'

function isRunActiveStatus(status: WorkflowRun['status']): boolean {
  return status === 'running' || status === 'waiting' || status === 'paused' || status === 'cancelling'
}

export function TaskRunView() {
  const text = useLocaleStore(s => s.text)
  const currentLocale = useLocaleStore(s => s.locale)
  const currentProject = useProjectStore(s => s.currentProject)
  const activeRuns = useWorkflowStore(s => s.activeRuns)
  const history = useWorkflowStore(s => s.history)
  const waitingRuns = useWorkflowStore(s => s.waitingRuns)
  const getActiveStreamingRun = useWorkflowStore(s => s.getActiveStreamingRun)
  const cancelWorkflow = useWorkflowStore(s => s.cancelWorkflow)
  const pauseWorkflow = useWorkflowStore(s => s.pauseWorkflow)
  const resumeWorkflow = useWorkflowStore(s => s.resumeWorkflow)
  const confirmContinue = useWorkflowStore(s => s.confirmContinue)

  const recovery = useRecoveryCandidates(currentProject, currentLocale)
  const activeRun = getActiveStreamingRun()
  const activeRunId = activeRun?.id
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  useEffect(() => {
    if (!activeRunId) return
    const syncTimer = window.setTimeout(() => {
      setSelectedRunId(prev => prev === activeRunId ? prev : activeRunId)
    }, 0)
    return () => window.clearTimeout(syncTimer)
  }, [activeRunId])

  const selectedRun: WorkflowRun | undefined =
    activeRuns.find(r => r.id === selectedRunId)
    || history.find(r => r.id === selectedRunId)
    || activeRun
    || activeRuns[0]
    || history[0]
    || undefined

  const hasRecovery = recovery.candidates.length > 0 || Boolean(recovery.error)

  if (activeRuns.length === 0 && history.length === 0 && !hasRecovery) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: 'var(--color-text-muted)' }}>
        <Zap size={24} style={{ opacity: 0.5 }} />
        <span className="text-xs">{text('暂无任务，AI 工作流启动后会在这里展示进度', 'No tasks. AI workflow progress will appear here.')}</span>
      </div>
    )
  }

  const recentHistory = history.slice(0, 15)
  const historyHeadingLocale = selectedRun?.uiLocale ?? recentHistory[0]?.uiLocale ?? currentLocale

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <RecoveryCandidatesBar
        candidates={recovery.candidates}
        error={recovery.error}
        locale={currentLocale}
        onCopy={candidate => { void recovery.copyCandidate(candidate) }}
        onContinue={candidate => { void recovery.continueCandidate(candidate) }}
        onDiscard={candidate => { void recovery.discardCandidate(candidate) }}
      />

      {(activeRuns.length > 0 || recentHistory.length > 0) && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* 左侧：活跃任务 + 历史记录列表 */}
          <div
            className="w-[240px] sm:w-[270px] flex-shrink-0 border-r overflow-y-auto"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {activeRuns.length > 0 && (
              <div
                style={{ borderBottom: recentHistory.length > 0 ? '1px solid var(--color-border)' : undefined }}
              >
                {activeRuns.map(run => {
                  const selected = selectedRun?.id === run.id
                  const completedCount = run.steps.filter(s => s.status === 'completed').length
                  const totalCount = run.steps.length
                  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
                  const runningStep = run.steps.find(s => s.status === 'running')
                  const isActive = isRunActiveStatus(run.status)
                  const isBatchTask = run.steps.length > 1
                  const runText = (zh: string, en: string) => runLocaleText(run.uiLocale, zh, en)

                  return (
                    <div
                      key={run.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedRunId(run.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedRunId(run.id)
                        }
                      }}
                      className="px-2.5 py-2 cursor-pointer transition-colors border-b last:border-b-0"
                      style={{
                        borderColor: 'var(--color-border)',
                        backgroundColor: selected ? 'var(--color-hover)' : 'transparent',
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="flex-shrink-0">
                          {run.status === 'running' && (
                            <Loader2 size={12} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
                          )}
                          {run.status === 'waiting' && (
                            <Clock size={12} style={{ color: 'var(--color-warning)' }} />
                          )}
                          {run.status === 'paused' && (
                            <Pause size={12} style={{ color: 'var(--color-warning)' }} />
                          )}
                          {run.status === 'cancelling' && (
                            <Loader2 size={12} className="animate-spin" style={{ color: 'var(--color-warning)' }} />
                          )}
                        </div>
                        <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--color-text)' }}>
                          {runningStep && isActive ? runningStep.name : run.title}
                        </span>
                        <span className="text-[0.65rem] font-mono flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                          {completedCount}/{totalCount}
                        </span>
                        {isBatchTask && run.status === 'running' && !run.pauseRequested && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); pauseWorkflow(run.id) }}
                            className="icon-btn"
                            style={{ width: 18, height: 18 }}
                            title={runText('暂停（将在当前步骤完成后生效）', 'Pause (takes effect after the current step finishes)')}
                          >
                            <Pause size={11} />
                          </button>
                        )}
                        {isBatchTask && run.status === 'running' && run.pauseRequested && (
                          <span
                            className="text-[0.62rem] whitespace-nowrap"
                            style={{ color: 'var(--color-warning-text)' }}
                            title={runText('暂停将在当前步骤完成后生效', 'Pause takes effect after the current step finishes')}
                          >
                            {runText('暂停中', 'Pausing')}
                          </span>
                        )}
                        {isBatchTask && run.status === 'paused' && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); resumeWorkflow(run.id) }}
                            className="icon-btn"
                            style={{ width: 18, height: 18 }}
                            title={runText('继续任务', 'Resume task')}
                          >
                            <Play size={11} />
                          </button>
                        )}
                        {run.status !== 'cancelling' && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); cancelWorkflow(run.id) }}
                            className="icon-btn"
                            style={{ width: 18, height: 18 }}
                            title={runText('取消任务', 'Cancel task')}
                          >
                            <X size={11} />
                          </button>
                        )}
                      </div>
                      <div className="mt-1.5 h-[2px] rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${progress}%`, backgroundColor: 'var(--color-accent)' }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {recentHistory.length > 0 && (
              <div className="py-1.5">
                <div
                  className="px-2.5 pt-1 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {runLocaleText(historyHeadingLocale, '历史', 'History')}
                </div>
                {recentHistory.map(run => {
                  const selected = selectedRun?.id === run.id
                  return (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => setSelectedRunId(run.id)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors"
                      style={{
                        backgroundColor: selected ? 'var(--color-hover)' : 'transparent',
                      }}
                    >
                      {run.status === 'completed'
                        ? <CheckCircle2 size={11} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                        : <XCircle size={11} style={{ color: 'var(--color-error)', flexShrink: 0 }} />}
                      <span className="flex-1 text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                        {run.title}
                      </span>
                      <span className="text-[0.62rem] font-mono flex-shrink-0 opacity-60" style={{ color: 'var(--color-text-muted)' }}>
                        {new Date(run.createdAt).toLocaleTimeString(run.uiLocale, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 右侧：选中任务的步骤流、确认操作、流式输出与故障诊断 */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {selectedRun ? (
              <RunDetailPane
                run={selectedRun}
                waitingForConfirm={waitingRuns[selectedRun.id]?.waitingForConfirm ?? false}
                waitingAfterStepIndex={waitingRuns[selectedRun.id]?.waitingAfterStepIndex ?? -1}
                onConfirm={() => confirmContinue(selectedRun.id)}
                onCancel={() => cancelWorkflow(selectedRun.id)}
                onPause={() => pauseWorkflow(selectedRun.id)}
                onResume={() => resumeWorkflow(selectedRun.id)}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {text('请选择左侧任务查看详情', 'Select a task on the left to inspect details')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function RunDetailPane({
  run,
  waitingForConfirm,
  waitingAfterStepIndex,
  onConfirm,
  onCancel,
  onPause,
  onResume,
}: {
  run: WorkflowRun
  waitingForConfirm: boolean
  waitingAfterStepIndex: number
  onConfirm: () => void
  onCancel: () => void
  onPause: () => void
  onResume: () => void
}) {
  const locale = run.uiLocale
  const runText = (zh: string, en: string) => runLocaleText(locale, zh, en)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const prevLenRef = useRef(0)

  const isActive = isRunActiveStatus(run.status)
  const isBatchTask = run.steps.length > 1
  const currentStep = run.steps[run.currentStepIndex] || run.steps[0]
  const rawText = currentStep ? rawStepResultText(currentStep) : ''
  const { content } = splitThinkAndContent(rawText)
  const contentLen = content.length

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return
    if (contentLen !== prevLenRef.current) {
      prevLenRef.current = contentLen
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      })
    }
  }, [contentLen, autoScroll, run.currentStepIndex])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
  }

  const completedCount = run.steps.filter(s => s.status === 'completed').length
  const totalCount = run.steps.length
  const overallProgress = totalCount > 0
    ? Math.round(((completedCount + (currentStep?.progress || 0) / 100) / totalCount) * 100)
    : 0
  const nextStepName = run.steps[waitingAfterStepIndex + 1]?.name
  const confirmationPreview = run.steps[waitingAfterStepIndex]?.result

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 顶部细进度条 */}
      <div className="flex-shrink-0" style={{ height: 2, backgroundColor: 'var(--color-border)' }}>
        <div
          style={{
            height: '100%',
            width: `${Math.max(isActive ? 3 : 0, overallProgress)}%`,
            backgroundColor: run.status === 'completed'
              ? 'var(--color-success)'
              : run.status === 'failed'
                ? 'var(--color-error)'
                : 'var(--color-accent)',
            transition: 'width 0.5s ease',
          }}
        />
      </div>

      {/* 详情头部控制条 */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-b flex-shrink-0"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--color-text)' }}>
          {run.status === 'cancelling'
            ? runText('正在取消，等待当前操作退出', 'Cancelling; waiting for the current operation to exit')
            : run.title}
        </span>

        <span className="text-[0.68rem] font-mono flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          {completedCount}/{totalCount}
        </span>

        {isBatchTask && run.status === 'running' && !run.pauseRequested && (
          <button
            type="button"
            onClick={onPause}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors"
            style={{
              color: 'var(--color-text)',
              backgroundColor: 'var(--color-hover)',
              border: '1px solid var(--color-border)',
            }}
          >
            <Pause size={11} />
            {runText('暂停', 'Pause')}
          </button>
        )}

        {isBatchTask && run.status === 'running' && run.pauseRequested && (
          <span className="text-xs" style={{ color: 'var(--color-warning-text)' }}>
            {runText('暂停中', 'Pausing')}
          </span>
        )}

        {isBatchTask && run.status === 'paused' && (
          <button
            type="button"
            onClick={onResume}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors"
            style={{
              color: '#fff',
              backgroundColor: 'var(--color-accent)',
            }}
          >
            <Play size={11} />
            {runText('继续任务', 'Resume task')}
          </button>
        )}

        {isActive && run.status !== 'cancelling' && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors"
            style={{
              color: 'var(--color-text)',
              backgroundColor: 'var(--color-hover)',
              border: '1px solid var(--color-border)',
            }}
          >
            <StopCircle size={12} />
            {runText('中止生成', 'Stop generation')}
          </button>
        )}
      </div>

      {/* 步骤时间线、流式正文、确认卡与错误诊断 */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 py-2">
        <div>
          {run.steps.map((step, index) => (
            <WorkflowStepItem
              key={step.id}
              step={step}
              index={index}
              isLast={index === run.steps.length - 1}
              isActiveRun={isActive}
              isCurrentStep={index === run.currentStepIndex}
              runFailed={run.status === 'failed'}
              uiLocale={locale}
            />
          ))}
        </div>

        {waitingForConfirm && nextStepName && (
          <div
            data-testid="workflow-confirmation-panel"
            className="mt-2 px-3 py-2 rounded flex flex-col gap-2"
            style={{
              backgroundColor: 'rgba(var(--color-accent-rgb), 0.07)',
              border: '1px solid rgba(var(--color-accent-rgb), 0.25)',
            }}
          >
            {confirmationPreview && (
              <pre
                data-testid="workflow-confirmation-preview"
                className="max-h-48 w-full overflow-auto whitespace-pre-wrap text-xs font-sans"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {confirmationPreview}
              </pre>
            )}
            <div className="flex w-full items-center gap-2">
              <Clock size={11} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span className="text-xs flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                {runText('下一步：', 'Next: ')}{nextStepName}
              </span>
              <button
                type="button"
                data-testid="workflow-confirmation-cancel"
                onClick={onCancel}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium flex-shrink-0"
                style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
              >
                <X size={10} /> {runText('取消工作流', 'Cancel workflow')}
              </button>
              <button
                type="button"
                data-testid="workflow-confirmation-confirm"
                onClick={onConfirm}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium flex-shrink-0"
                style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
              >
                <Play size={10} /> {nextStepName}
              </button>
            </div>
          </div>
        )}

        {run.status === 'failed' && <WorkflowFailureNotice run={run} />}
      </div>
    </div>
  )
}
