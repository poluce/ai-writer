/**
 * 弹出式三栏合并视图弹窗 — 处理修稿与当前草稿的差异合并。
 * 从 DraftEditor 拆出的展示与合并协调组件。
 */

import ThreeWayMerge from './ThreeWayMerge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog'
import { useLocaleStore } from '../../stores/locale-store'
import type { DraftMeta } from '../../services/workflows/chapter-workflow'

export interface DraftMergeData {
  originalContent: string
  modifiedContent: string
  staleReason?: string | null
}

export interface DraftMergeDialogProps {
  open: boolean
  meta: DraftMeta | null
  mergeData: DraftMergeData | null
  onComplete: (resolvedContent: string) => void
  onClose: () => void
}

export function DraftMergeDialog({
  open,
  meta,
  mergeData,
  onComplete,
  onClose,
}: DraftMergeDialogProps) {
  const text = useLocaleStore(s => s.text)

  if (!open || !mergeData) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="p-0"
        style={{
          width: '90vw',
          maxWidth: '90vw',
          height: '85vh',
          maxHeight: '85vh',
          overflow: 'hidden'}}
        /* 阻止点击遮罩关闭，防止误触丢失合并进度 */
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-4 py-0" style={{ height: 38, display: 'flex', alignItems: 'center' }}>
          <DialogTitle className="flex items-center gap-2 text-[0.8rem]">
            {text(
              `修稿合并 — 第${meta?.chapterNumber ?? ''}章 ${meta?.chapterTitle || '未知标题'}`,
              `Revision merge — Chapter ${meta?.chapterNumber ?? ''} ${meta?.chapterTitle || 'Untitled'}`,
            )}
          </DialogTitle>
        </DialogHeader>
        {/* 合并视图主体 */}
        <div className="flex-1 overflow-hidden" style={{ height: 'calc(85vh - 38px - 1px)' }}>
          <div className="flex h-full flex-col">
            {mergeData.staleReason && (
              <div role="alert" className="border-b border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-warning-text)]">
                {mergeData.staleReason}
              </div>
            )}
            <div className="min-h-0 flex-1">
              <ThreeWayMerge
                originalContent={mergeData.originalContent}
                modifiedContent={mergeData.modifiedContent}
                onComplete={onComplete}
                onCancel={onClose}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
