import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, XCircle } from 'lucide-react'
import type { Locale } from '../../../i18n/types'
import type { WorkflowRun, WorkflowStep } from '../../../stores/workflow-store'
import MarkdownContent from '../../ui/MarkdownContent'
import {
  rawStepResultText,
  runLocaleText,
  splitThinkAndContent,
} from './workflow-stream-text'

export function StepStatusIcon({ status }: { status: WorkflowStep['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={13} style={{ color: 'var(--color-success)' }} />
    case 'running':
      return <Loader2 size={13} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
    case 'failed':
      return <XCircle size={13} style={{ color: 'var(--color-error)' }} />
    case 'skipped':
      return (
        <div
          className="w-3 h-3 rounded-full flex items-center justify-center"
          style={{ border: '1.5px dashed var(--color-text-muted)' }}
        />
      )
    default:
      return (
        <div
          className="w-3 h-3 rounded-full"
          style={{ border: '1.5px solid var(--color-border)', backgroundColor: 'var(--color-panel)' }}
        />
      )
  }
}

export function ThinkingBlock({
  thinking,
  showCursor,
  hasContent,
  locale,
}: {
  thinking: string
  showCursor: boolean
  hasContent: boolean
  locale: Locale
}) {
  const [expanded, setExpanded] = useState(!hasContent)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true
    if (hasContent) {
      Promise.resolve().then(() => {
        if (mounted) setExpanded(false)
      })
    }
    return () => { mounted = false }
  }, [hasContent])

  useEffect(() => {
    if (expanded && scrollRef.current) {
      const el = scrollRef.current
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }
        })
      }
    }
  }, [thinking, expanded])

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="group flex items-center gap-1.5 w-full text-left text-xs min-h-6 py-1 select-none transition-colors"
        style={{ color: 'var(--color-text-muted)', opacity: 0.85 }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)' }}
      >
        <ChevronRight
          size={12}
          style={{
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(90deg)' : 'none',
          }}
        />
        <span>
          {showCursor
            ? runLocaleText(locale, '思考中...', 'Thinking...')
            : runLocaleText(locale, '思考过程', 'Thinking process')}
        </span>
        {showCursor && !expanded && (
          <span className="ai-stream-cursor" style={{ height: 11, width: 3 }} />
        )}
      </button>

      {expanded && (
        <div
          ref={scrollRef}
          className="ml-0.5 pl-3 border-l-2 py-0.5 mb-2 mt-1 text-xs leading-relaxed whitespace-pre-wrap overflow-y-auto"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-muted)',
            maxHeight: 220,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            lineHeight: 1.6,
          }}
        >
          {thinking}
          {showCursor && <span className="ai-stream-cursor" style={{ height: 12, width: 3 }} />}
        </div>
      )}
    </div>
  )
}

export function WorkflowStepItem({
  step,
  index,
  isLast,
  isActiveRun,
  isCurrentStep,
  runFailed,
  uiLocale,
}: {
  step: WorkflowStep
  index: number
  isLast: boolean
  isActiveRun: boolean
  isCurrentStep: boolean
  runFailed: boolean
  uiLocale: WorkflowRun['uiLocale']
}) {
  const isRunning = step.status === 'running'
  const rawText = rawStepResultText(step)
  const { thinking, content } = splitThinkAndContent(rawText)
  const showStepError = Boolean(step.error) && !runFailed
  const hasDetail = Boolean(rawText) || showStepError || step.logs.length > 0

  const [expanded, setExpanded] = useState(
    isRunning || (isCurrentStep && hasDetail),
  )

  useEffect(() => {
    let mounted = true
    if (isRunning || (isCurrentStep && hasDetail)) {
      Promise.resolve().then(() => {
        if (mounted) setExpanded(true)
      })
    }
    return () => { mounted = false }
  }, [isRunning, isCurrentStep, hasDetail])

  return (
    <div className="relative flex gap-2.5">
      {/* 左侧状态图标与垂直连接线 */}
      <div className="flex flex-col items-center flex-shrink-0" style={{ paddingTop: 7 }}>
        <div className="flex-shrink-0">
          <StepStatusIcon status={step.status} />
        </div>
        {!isLast && (
          <div
            className="w-px flex-1 mt-1"
            style={{
              minHeight: 12,
              backgroundColor: step.status === 'completed'
                ? 'var(--color-success)'
                : 'var(--color-border)',
              opacity: step.status === 'completed' ? 0.4 : 0.6,
            }}
          />
        )}
      </div>

      {/* 右侧步骤内容 */}
      <div
        className="flex-1 min-w-0 pb-2"
        style={{ minHeight: isLast ? undefined : 26 }}
      >
        <div
          className={`flex items-center gap-1 py-1 ${hasDetail ? 'cursor-pointer' : ''}`}
          onClick={hasDetail ? () => setExpanded(v => !v) : undefined}
        >
          {hasDetail && (
            expanded
              ? <ChevronDown size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
              : <ChevronRight size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          )}
          <span
            className="text-xs flex-1 truncate"
            style={{
              color: isRunning
                ? 'var(--color-text)'
                : step.status === 'pending'
                  ? 'var(--color-text-muted)'
                  : step.status === 'failed'
                    ? 'var(--color-error-text)'
                    : 'var(--color-text-secondary)',
              fontWeight: isRunning ? 500 : 400,
            }}
          >
            {index + 1}. {step.name}
          </span>
          {step.progress !== undefined && isRunning && (
            <span className="text-[0.68rem] font-mono flex-shrink-0" style={{ color: 'var(--color-accent)' }}>
              {step.progress}%
            </span>
          )}
          {step.status === 'skipped' && (
            <span className="text-[0.68rem] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
              {runLocaleText(uiLocale, '已跳过', 'Skipped')}
            </span>
          )}
        </div>

        {/* 展开：步骤错误、日志、思考链与流式正文 */}
        {expanded && hasDetail && (
          <div className="pb-1">
            {showStepError && (
              <div
                className="text-[0.7rem] px-2 py-1 rounded mb-1"
                style={{ backgroundColor: 'rgba(192,57,74,0.08)', color: 'var(--color-error-text)' }}
              >
                {step.error}
              </div>
            )}
            {step.logs.length > 0 && (
              <div className="max-h-16 overflow-y-auto space-y-0.5 mb-1.5">
                {step.logs.slice(-6).map((log, logIndex) => (
                  <div key={logIndex} className="text-[0.68rem] font-mono leading-4" style={{ color: 'var(--color-text-muted)' }}>
                    {log}
                  </div>
                ))}
              </div>
            )}
            {thinking && (
              <ThinkingBlock
                thinking={thinking}
                showCursor={isRunning && isActiveRun && !content}
                hasContent={Boolean(content)}
                locale={uiLocale}
              />
            )}
            {content && (
              <div className="mt-1 text-xs">
                <MarkdownContent content={content} streaming={isRunning && isActiveRun} />
              </div>
            )}
          </div>
        )}

        {/* 等待模型响应骨架 */}
        {!rawText && isRunning && isActiveRun && (
          <div className="py-1 text-xs" style={{ color: 'var(--color-text-muted)', opacity: 0.75 }}>
            {runLocaleText(uiLocale, '等待指令响应...', 'Waiting for the workflow step...')}
          </div>
        )}
      </div>
    </div>
  )
}
