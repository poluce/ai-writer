/**
 * 审稿问题严重度展示 — 图标、配色与文案三件套。
 * 从 ReviewReport 拆出的展示模块。
 */
import { AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react'
import type { ReviewIssue } from './review-report-shared'

export const SEVERITY_META: Record<ReviewIssue['severity'], {
  colorClass: string
  bgClass: string
  borderClass: string
}> = {
  unknown: {
    colorClass: 'text-[var(--color-text-muted)]',
    bgClass: 'bg-[var(--color-bg-elevated)]',
    borderClass: 'border-[var(--color-border)]',
  },
  error: {
    colorClass: 'text-[var(--color-error-text)]',
    bgClass: 'bg-red-500/10',
    borderClass: 'border-red-500/30',
  },
  warning: {
    colorClass: 'text-[var(--color-warning-text)]',
    bgClass: 'bg-yellow-500/10',
    borderClass: 'border-yellow-500/30',
  },
  pass: {
    colorClass: 'text-[var(--color-success-text)]',
    bgClass: 'bg-green-500/10',
    borderClass: 'border-green-500/30',
  },
}

export function severityCopy(
  severity: ReviewIssue['severity'],
  text: (zhCNText: string, enUSText: string) => string,
) {
  switch (severity) {
    case 'unknown':
      return {
        label: text('待核实', 'Needs verification'),
        actionLabel: text('证据不足，不代表通过；默认不修稿', 'Insufficient evidence; not passed or included by default'),
        countLabel: text('待核实', 'unverified'),
      }
    case 'error':
      return {
        label: text('严重问题', 'Critical issue'),
        actionLabel: text('强烈建议修复', 'Strongly recommended to fix'),
        countLabel: text('严重', 'critical'),
      }
    case 'warning':
      return {
        label: text('改进建议', 'Improvement'),
        actionLabel: text('建议酌情修复', 'Consider fixing'),
        countLabel: text('建议', 'suggestions'),
      }
    default:
      return {
        label: text('检查通过', 'Passed'),
        actionLabel: text('无需处理', 'No action needed'),
        countLabel: text('通过', 'passed'),
      }
  }
}

export function SeverityIcon({ severity }: { severity: ReviewIssue['severity'] }) {
  if (severity === 'unknown') return <HelpCircle size={14} className="flex-shrink-0 text-[var(--color-text-muted)]" />
  if (severity === 'error') return <AlertTriangle size={14} className="flex-shrink-0" style={{ color: 'var(--color-error)' }} />
  if (severity === 'warning') return <AlertTriangle size={14} className="flex-shrink-0" style={{ color: 'var(--color-warning)' }} />
  return <CheckCircle size={14} className="flex-shrink-0" style={{ color: 'var(--color-success)' }} />
}
