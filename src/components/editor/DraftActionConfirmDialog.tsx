/**
 * AI 审稿确认弹窗 — 选择审稿重点维度后交给审稿助手。
 * 直接修稿入口已移除：修稿只从审稿报告的「按确认意见修稿」进入。
 */

import { Check, Sparkles } from 'lucide-react'
import { Button } from '../ui/Button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '../ui/Dialog'
import { useLocaleStore } from '../../stores/locale-store'
import type { DraftMeta } from '../../services/workflows/chapter-workflow'
import type { ReviewDimensionKey } from '../../shared/review-dimensions'

export interface ReviewDimension {
  key: ReviewDimensionKey
  label: string
}

export interface DraftActionConfirmDialogProps {
  open: boolean
  meta: DraftMeta | null
  reviewDims: Partial<Record<ReviewDimensionKey, boolean>>
  reviewDimensions: readonly ReviewDimension[]
  onClose: () => void
  onToggleReviewDim: (key: ReviewDimensionKey) => void
  onConfirm: () => void
}

export function DraftActionConfirmDialog({
  open,
  meta,
  reviewDims,
  reviewDimensions,
  onClose,
  onToggleReviewDim,
  onConfirm,
}: DraftActionConfirmDialogProps) {
  const text = useLocaleStore(s => s.text)

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={15} className="text-[var(--color-accent)]" />
            {text('AI 审稿确认', 'Confirm AI review')}
          </DialogTitle>
          <DialogDescription>
            {text('对象：', 'Target: ')}{meta
              ? `${meta.chapterTitle || text('未知标题', 'Untitled')} v${meta.version}`
              : text('当前草稿', 'Current draft')}
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 py-2 text-sm space-y-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          <div>{text('将切到右侧审稿助手，对本章草稿做只读审查并产出审稿报告。', 'This opens the review assistant for a read-only audit of this chapter and produces a review report.')}</div>
          <div className="mt-3">
            <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text)' }}>{text('重点检查维度：', 'Review focus:')}</div>
            <div className="flex flex-wrap gap-2">
              {reviewDimensions.map(d => (
                <label
                  key={d.key}
                  className="flex items-center gap-1.5 cursor-pointer select-none px-2 py-1 rounded-md text-xs"
                  style={{
                    border: `1px solid ${reviewDims[d.key] ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    backgroundColor: reviewDims[d.key] ? 'rgba(var(--color-accent-rgb),0.1)' : 'transparent',
                    color: reviewDims[d.key] ? 'var(--color-accent)' : 'var(--color-text-muted)'}}
                  onClick={() => onToggleReviewDim(d.key)}
                >
                  <div
                    className="w-3 h-3 rounded flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: reviewDims[d.key] ? 'var(--color-accent)' : 'transparent',
                      border: `1.5px solid ${reviewDims[d.key] ? 'var(--color-accent)' : 'var(--color-border)'}`}}
                  >
                    {reviewDims[d.key] && (
                      <Check size={9} strokeWidth={3} color="white" aria-hidden="true" />
                    )}
                  </div>
                  {d.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{text('取消', 'Cancel')}</Button>
          <Button variant="ai" onClick={onConfirm}>{text('确认执行', 'Run')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
