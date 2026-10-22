/**
 * 渠道卡片 — 按渠道聚合展示的模型渠道列表项与服务商图标。
 * 从 GenerationModelSettings 拆出的展示组件。
 */
import type { ReactNode } from 'react'
import { Settings2, Trash2, Zap, Database, Globe, Cpu, MessageSquare } from 'lucide-react'
import type { ModelChannelGroup } from '../../shared/agent-runtime'
import { cn } from '../../lib/utils'
import { useLocaleStore } from '../../stores/locale-store'

/** 渠道卡片 (按渠道聚合，对齐 DSH，简洁卡片不展开内部模型列表) */
export function ChannelCard({
  group,
  defaultModelId,
  onEdit,
  onDelete,
}: {
  group: ModelChannelGroup
  defaultModelId: string | null
  onEdit: () => void
  onDelete: () => void
}) {
  const text = useLocaleStore(s => s.text)
  const rep = group.representative
  const channelTitle = group.channelName || rep.channelName || rep.name || group.label
  const hasDefault = group.models.some(m => m.profile.id === defaultModelId)

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl group transition-colors border',
        hasDefault
          ? 'border-[var(--color-accent)]/50 bg-[color-mix(in_srgb,var(--color-accent)_4%,var(--color-panel))]'
          : 'border-[var(--color-border)] hover:border-[var(--color-accent)]/60 bg-[var(--color-panel)]',
      )}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-lg"
        style={{ backgroundColor: 'var(--color-hover)' }}
      >
        {providerIcon(rep.provider)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>
            {channelTitle}
          </span>
          <span className="text-[0.68rem] px-1.5 py-0.5 rounded bg-[var(--color-hover)] text-[var(--color-text-muted)] flex-shrink-0 font-mono">
            {rep.protocol}
          </span>
        </div>
        <p className="text-xs truncate mt-0.5 font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {rep.baseUrl}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          title={text('编辑', 'Edit')}
          aria-label={text('编辑', 'Edit')}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--color-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
        >
          <Settings2 size={13} />
          <span>{text('编辑', 'Edit')}</span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          title={text('删除', 'Delete')}
          aria-label={text('删除', 'Delete')}
          className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-[var(--color-error-text)] cursor-pointer"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}
export function providerIcon(provider: string): ReactNode {
  const commonProps = { size: 18, strokeWidth: 1.8 }

  switch (provider) {
    case 'openai':
      return <Zap {...commonProps} />
    case 'deepseek':
      return <Database {...commonProps} />
    case 'gemini':
      return <Globe {...commonProps} />
    case 'xai':
      return <Cpu {...commonProps} />
    case 'siliconflow':
      return <Database {...commonProps} />
    case 'ollama':
      return <Cpu {...commonProps} />
    case 'bigmodel':
      return <MessageSquare {...commonProps} />
    case 'custom':
      return <Settings2 {...commonProps} />
    default:
      return <Cpu {...commonProps} />
  }
}
