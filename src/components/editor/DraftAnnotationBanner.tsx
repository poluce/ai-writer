/**
 * 选区标注展开栏 — 查看与删除草稿选区标注。
 * 从 DraftEditor 拆出的展示组件。
 */

import { X } from 'lucide-react'
import { useLocaleStore } from '../../stores/locale-store'
import type { DraftAnnotation } from '../../shared/draft-annotation'

export interface DraftAnnotationBannerProps {
  open: boolean
  annotations: DraftAnnotation[]
  onRemove: (id: string) => void
}

export function DraftAnnotationBanner({ open, annotations, onRemove }: DraftAnnotationBannerProps) {
  const text = useLocaleStore(s => s.text)
  if (!open || annotations.length === 0) return null

  return (
    <div
      className="px-3 py-2 text-xs space-y-1.5"
      style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-elevated, var(--color-panel))' }}
    >
      {annotations.map(item => (
        <div key={item.id} className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="truncate" style={{ color: 'var(--color-text-muted)' }}>「{item.quote}」</div>
            <div style={{ color: 'var(--color-text)' }}>{item.note}</div>
          </div>
          <button
            type="button"
            className="p-0.5 rounded"
            title={text('删除标注', 'Remove note')}
            onClick={() => onRemove(item.id)}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
