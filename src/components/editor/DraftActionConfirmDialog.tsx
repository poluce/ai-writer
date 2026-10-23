/**
 * AI 审稿/修稿确认弹窗 — 选择审稿维度或附加修稿要求。
 * 从 DraftEditor 拆出的展示与交互组件。
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
import type { DraftAnnotation } from '../../shared/draft-annotation'

export interface ReviewDimension {
  key: string
  label: string
  desc: string
  promptLabel: string
}

export interface DraftActionConfirmDialogProps {
  open: boolean
  action: 'refine' | 'review' | null
  meta: DraftMeta | null
  annotations: DraftAnnotation[]
  reviewDims: Record<string, boolean>
  reviewDimensions: ReviewDimension[]
  userRefinePrompt: string
  onClose: () => void
  onToggleReviewDim: (key: string) => void
  onChangeUserRefinePrompt: (value: string) => void
  onConfirm: () => void
}

export function DraftActionConfirmDialog({
  open,
  action,
  meta,
  annotations,
  reviewDims,
  reviewDimensions,
  userRefinePrompt,
  onClose,
  onToggleReviewDim,
  onChangeUserRefinePrompt,
  onConfirm,
}: DraftActionConfirmDialogProps) {
  const text = useLocaleStore(s => s.text)

  if (!open || !action) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={15} className="text-[var(--color-accent)]" />
            {action === 'refine'
              ? text('AI 修稿确认', 'Confirm AI revision')
              : text('AI 审稿确认', 'Confirm AI review')}
          </DialogTitle>
          <DialogDescription>
            {text('对象：', 'Target: ')}{meta
              ? `${meta.chapterTitle || text('未知标题', 'Untitled')} v${meta.version}`
              : text('当前草稿', 'Current draft')}
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 py-2 text-sm space-y-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          {action === 'refine' ? (
            <>
              <div className="font-medium text-[var(--color-text)]">{text('本次【直接修稿】范围：', 'This direct revision will:')}</div>
              <div>{text('1. 全文基础润色、词汇优化，增强画面与表现力。', '1. Polish the full chapter, improve wording, and strengthen imagery and expression.')}</div>
              <div>{text('2. 可在下方指定的额外修稿要求。', '2. Follow any additional revision instructions below.')}</div>
              {annotations.length > 0 && (
                <div className="pt-2 space-y-1">
                  <div className="font-medium text-[var(--color-text)]">
                    {text(`将提交 ${annotations.length} 条选区标注：`, `Will send ${annotations.length} passage notes:`)}
                  </div>
                  {annotations.map(item => (
                    <div key={item.id} className="text-xs leading-relaxed">
                      「{item.quote.length > 36 ? `${item.quote.slice(0, 36)}…` : item.quote}」— {item.note}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        {/* 修稿时显示自定义提示词输入框 */}
        {action === 'refine' && (
          <div className="px-5 pb-2">
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              {text('附加修稿要求（可选）：', 'Additional revision guidance (optional):')}
            </label>
            <textarea
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                minHeight: 72,
                resize: 'vertical',
                outline: 'none'}}
              placeholder={text(
                '例如：加强打斗场面的画面感；把结尾的伏笔改为更隐晦的暗示；对白太书面化，改为口语化风格...',
                'For example: make action scenes more vivid; make the final foreshadowing subtler; make dialogue less formal...',
              )}
              value={userRefinePrompt}
              onChange={e => onChangeUserRefinePrompt(e.target.value)}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{text('取消', 'Cancel')}</Button>
          <Button
            variant="ai"
            onClick={onConfirm}
          >
            {text('确认执行', 'Run')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
