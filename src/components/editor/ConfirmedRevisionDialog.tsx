/**
 * 按确认意见修稿对话框 — 选择本次修稿模型并冻结启动。
 * 从 ReviewReport 拆出的展示组件。
 */
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '../ui/Button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '../ui/Dialog'
import { Label } from '../ui/Label'
import { NativeSelect } from '../ui/NativeSelect'
import { useLocaleStore } from '../../stores/locale-store'
import { useLLMStore } from '../../stores/llm-store'
import type { WritingLanguage } from '../../shared/writing-language'
import {
  renderHumanConfirmedReviewBrief,
  type HumanConfirmedReviewSnapshot,
} from '../../shared/human-confirmed-review'
import {
  availableGenerationModelId,
  isGenerationModel,
  preferredGenerationModelId,
} from './review-report-shared'

interface ConfirmedRevisionDialogProps {
  snapshot: HumanConfirmedReviewSnapshot
  writingLanguage: WritingLanguage
  onClose: () => void
  onStart: (generationModelId: string) => Promise<string | null>
}

/**
 * Mounted only while open so every revision gets a fresh local snapshot of the
 * global default model. The chooser never writes to the global default.
 */
export function ConfirmedRevisionDialog({ snapshot, writingLanguage, onClose, onStart }: ConfirmedRevisionDialogProps) {
  const text = useLocaleStore(s => s.text)
  const models = useLLMStore(s => s.models)
  const defaultModelId = useLLMStore(s => s.defaultModelId)
  const reviewModelId = useLLMStore(s => s.resolveTaskModelId('review'))
  const fallbackGenerationModelId = reviewModelId ?? preferredGenerationModelId(models, defaultModelId)
  const [generationModelId, setGenerationModelId] = useState<string | null>(() => fallbackGenerationModelId)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const generationModels = models.filter(isGenerationModel)
  const selectedGenerationModelId = generationModelId ?? fallbackGenerationModelId
  const selectedGenerationModel = generationModels.find(model => model.id === selectedGenerationModelId)
  const modelSelectionError = generationModels.length === 0
    ? text(
      '没有已配置且可用于文本生成的模型。请在设置中添加或启用一项生成模型。',
      'No configured model can generate text. Add or enable a generation model in Settings.',
    )
    : !selectedGenerationModel
      ? text(
        '所选修稿模型已不可用。请选择一项可用于文本生成的模型后再试。',
        'The selected revision model is no longer available. Select a compatible generation model and try again.',
      )
      : null
  const confirmedBrief = renderHumanConfirmedReviewBrief(snapshot, writingLanguage)

  const start = async () => {
    if (modelSelectionError || !selectedGenerationModelId) {
      setStartError(modelSelectionError ?? text(
        '请选择一项可用于文本生成的模型。',
        'Select a compatible generation model before starting.',
      ))
      return
    }

    const frozenGenerationModelId = availableGenerationModelId(
      useLLMStore.getState().models,
      selectedGenerationModelId,
    )
    if (!frozenGenerationModelId) {
      setStartError(text(
        '所选修稿模型已不可用。请选择一项可用于文本生成的模型后再试。',
        'The selected revision model is no longer available. Select a compatible generation model and try again.',
      ))
      return
    }

    setStarting(true)
    try {
      const error = await onStart(frozenGenerationModelId)
      if (error) {
        setStartError(error)
        return
      }
      onClose()
    } catch (error) {
      setStartError(error instanceof Error
        ? error.message
        : text('启动审稿修稿时发生错误。', 'An error occurred while starting the review-driven revision.'))
    } finally {
      setStarting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => {
      if (!open && !starting) onClose()
    }}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={15} className="text-[var(--color-accent)]" />
            {text('按确认意见修稿', 'Revise from confirmed checklist')}
          </DialogTitle>
          <DialogDescription>
            {text(
              '仅将已确认纳入的审稿项和作者指导传给修稿流程；已忽略项与原始 AI 报告不会成为模型指令。',
              'Only confirmed review items and author guidance are sent to revision. Ignored items and the raw AI report are not model instructions.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 py-2 space-y-3">
          <div>
            <Label htmlFor="review-revision-model">
              {text('本次修稿模型', 'Model for this revision')}
            </Label>
            <NativeSelect
              id="review-revision-model"
              value={selectedGenerationModelId ?? ''}
              onChange={(event) => {
                setGenerationModelId(event.target.value || null)
                setStartError(null)
              }}
              disabled={generationModels.length === 0 || starting}
            >
              <option value="" disabled>{text('请选择可用生成模型', 'Select a generation model')}</option>
              {generationModels.map(model => (
                <option key={model.id} value={model.id}>{model.name || model.modelName}</option>
              ))}
            </NativeSelect>
            <p className="mt-1 text-[0.7rem] text-[var(--color-text-muted)]">
              {text('仅用于本次修稿，不会更改默认模型。', 'Used for this revision only; it does not change the default model.')}
            </p>
            {modelSelectionError && (
              <p role="alert" className="mt-1 text-xs text-[var(--color-error-text)]">
                {modelSelectionError}
              </p>
            )}
          </div>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
            <div className="mb-1 text-xs font-medium text-[var(--color-text)]">
              {text('将传给修稿流程的已确认意见', 'Confirmed guidance sent to revision')}
            </div>
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-5 text-[var(--color-text-secondary)]">
              {confirmedBrief}
            </pre>
          </div>
          {startError && (
            <p role="alert" className="text-xs text-[var(--color-error-text)]">
              {startError}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={starting}>
            {text('取消', 'Cancel')}
          </Button>
          <Button variant="ai" onClick={start} disabled={starting || Boolean(modelSelectionError)}>
            <Sparkles size={13} />
            {text('开始修稿', 'Start revision')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
