/**
 * 模型连通性状态展示 — 结果横幅与单模型测试状态按钮。
 * 从 GenerationModelSettings 拆出的展示组件。
 */
import type { ReactElement } from 'react'
import { cn } from '../../lib/utils'
import {
  type LocalizedText,
  type ModelTestStatus,
  modelTestStatusPresentation,
} from './generation-model-settings-shared'

export function ConnectionTestResultBanner({
  result,
  text,
}: {
  result: { success: boolean; error?: string }
  text: LocalizedText
}): ReactElement {
  let className = 'bg-red-500/10 text-[var(--color-error-text)] border border-red-500/20'
  let message = text(`连接失败：${result.error}`, `Connection failed: ${result.error}`)
  if (result.success) {
    className = 'bg-green-500/10 text-[var(--color-success-text)] border border-green-500/20'
    message = text('连接成功', 'Connection succeeded')
  }
  return (
    <div className={`text-xs p-2 rounded ${className} break-all`}>
      {message}
    </div>
  )
}


export function ModelTestStatusButton({
  testInfo,
  text,
  onTest,
}: {
  testInfo: ModelTestStatus
  text: LocalizedText
  onTest: () => void
}): ReactElement {
  const presentation = modelTestStatusPresentation(testInfo, text)
  return (
    <button
      type="button"
      className="flex items-center justify-center p-1.5 rounded hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
      title={presentation.statusText}
      aria-label={presentation.statusText}
      disabled={testInfo.status === 'testing'}
      onClick={onTest}
    >
      <span
        className={cn('w-2.5 h-2.5 rounded-full transition-all flex-shrink-0', presentation.dotClass)}
        data-test-status={testInfo.status}
      />
    </button>
  )
}
