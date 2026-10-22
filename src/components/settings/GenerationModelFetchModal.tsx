/**
 * 获取可用模型弹层 — 从端点发现结果中勾选批量加入渠道。
 * 从 GenerationModelSettings 拆出的展示组件。
 */
import { useState } from 'react'
import { X, Search, Plus } from 'lucide-react'
import type { DiscoveredModel } from '../../shared/ipc-channels'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { cn } from '../../lib/utils'
import { useLocaleStore } from '../../stores/locale-store'

export function FetchModelsModal({
  open,
  onClose,
  discoveredModels,
  alreadyAddedModelNames,
  onAddModels,
}: {
  open: boolean
  onClose: () => void
  discoveredModels: DiscoveredModel[]
  alreadyAddedModelNames: string[]
  onAddModels: (modelNames: string[]) => void
}) {
  const text = useLocaleStore(s => s.text)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  if (!open) return null

  const normalized = query.trim().toLowerCase()
  const visible = normalized
    ? discoveredModels.filter(m =>
        m.id.toLowerCase().includes(normalized) ||
        m.name.toLowerCase().includes(normalized) ||
        m.value.toLowerCase().includes(normalized),
      )
    : discoveredModels

  const visibleUnadded = visible.filter(m => !alreadyAddedModelNames.includes(m.value))
  const allVisibleSelected = visibleUnadded.length > 0 && visibleUnadded.every(m => selected.includes(m.value))

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected(prev => prev.filter(val => !visibleUnadded.some(m => m.value === val)))
    } else {
      setSelected(prev => Array.from(new Set([...prev, ...visibleUnadded.map(m => m.value)])))
    }
  }

  const handleAdopt = () => {
    onAddModels(selected)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      data-channel-model-adder
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={text('获取可用模型', 'Fetch available models')}
        className="w-full max-w-lg rounded-xl shadow-2xl flex flex-col max-h-[85vh] border border-[var(--color-border)] bg-[var(--color-panel)] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">
              {text('获取可用模型', 'Fetch available models')}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {text('添加到本渠道：从端点发现的可用模型。勾选后点击「添加所选」即可加入本渠道。', 'Add to this channel: select discovered models to include in this channel.')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={text('关闭', 'Close')}
            className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-hover)] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--color-border)]/60 bg-[var(--color-bg)]/30">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={text('搜索模型 ID 或名称...', 'Search model ID or name...')}
              className="pl-8 text-xs h-8"
              type="search"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={visibleUnadded.length === 0}
            onClick={toggleSelectAll}
            className="text-xs h-8 flex-shrink-0"
          >
            {allVisibleSelected ? text('取消全选', 'Deselect all') : text('全选', 'Select all')}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-1 min-h-[160px] max-h-[360px]">
          {visible.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">
              {text('未找到匹配的模型', 'No matching models found')}
            </div>
          ) : (
            visible.map((candidate) => {
              const alreadyAdded = alreadyAddedModelNames.includes(candidate.value)
              const checked = alreadyAdded || selected.includes(candidate.value)
              const optionLabel = candidate.name === candidate.id
                ? candidate.id
                : `${candidate.name} (${candidate.id})`
              let optionClassName = 'hover:bg-[var(--color-hover)]/50 border-transparent'
              if (alreadyAdded) {
                optionClassName = 'opacity-50 cursor-default bg-transparent border-transparent'
              } else if (checked) {
                optionClassName = 'bg-[var(--color-hover)] border-[var(--color-border)]'
              }

              return (
                <label
                  key={candidate.id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer border',
                    optionClassName,
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={alreadyAdded}
                    aria-label={optionLabel}
                    onChange={() => {
                      if (alreadyAdded) return
                      setSelected(prev =>
                        prev.includes(candidate.value)
                          ? prev.filter(v => v !== candidate.value)
                          : [...prev, candidate.value]
                      )
                    }}
                    className="rounded text-[var(--color-accent)]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[var(--color-text)] truncate">
                      {candidate.id}
                    </div>
                    {candidate.name && candidate.name !== candidate.id && (
                      <div className="text-[0.7rem] text-[var(--color-text-muted)] truncate">
                        {candidate.name}
                      </div>
                    )}
                  </div>
                  {alreadyAdded && (
                    <span className="text-[0.7rem] text-[var(--color-text-muted)] px-1.5 py-0.5 rounded bg-[var(--color-bg)]">
                      {text('已添加', 'Added')}
                    </span>
                  )}
                </label>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]/50">
          <span className="text-xs text-[var(--color-text-muted)]">
            {text(`已选择 ${selected.length} 个模型`, `${selected.length} model(s) selected`)}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {text('取消', 'Cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={selected.length === 0}
              onClick={handleAdopt}
            >
              <Plus size={13} />
              {text(`添加 ${selected.length} 个模型`, `Add ${selected.length} model(s)`)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
