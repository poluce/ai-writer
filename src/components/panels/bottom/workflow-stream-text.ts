import type { Locale } from '../../../i18n/types'
import type { WorkflowStep } from '../../../stores/workflow-store'

export function runLocaleText(locale: Locale, zhCNText: string, enUSText: string): string {
  return locale === 'en-US' ? enUSText : zhCNText
}

export function splitThinkAndContent(rawText: string): { thinking: string; content: string } {
  const segments = rawText.split(/<think>/)
  if (segments.length <= 1) {
    return { thinking: '', content: rawText }
  }
  const lastSegment = segments[segments.length - 1]
  const end = lastSegment.indexOf('</think>')
  if (end !== -1) {
    return {
      thinking: lastSegment.substring(0, end),
      content: lastSegment.substring(end + 8),
    }
  }
  return { thinking: lastSegment, content: '' }
}

export function rawStepResultText(step: WorkflowStep): string {
  if (typeof step.result === 'string') return step.result
  if (step.result) return JSON.stringify(step.result)
  return ''
}
