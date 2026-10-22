/**
 * 情节大纲左侧章节区间目录 (TOC) — 展示分卷分段树、拖拽排卷、折叠与未保存标记。
 * 从 SynopsisEditor 拆出的展示与导航组件。
 */

import { ChevronDown, ChevronRight, GripVertical, Map } from 'lucide-react'
import { useLocaleStore } from '../../stores/locale-store'
import type { ParsedSynopsis, SynopsisNodeGroup } from './synopsis-outline-nodes'

export interface SynopsisTocProps {
  parsed: ParsedSynopsis
  groups: SynopsisNodeGroup[]
  tocWidth: number
  minWidth: number
  maxWidth: number
  isGroupOpen: (groupId: string) => boolean
  drafts: Record<string, string>
  selectedGroupId: string | null
  selectedNodeId: string | null
  draggingVolumeIndex: number | null
  dragOverVolumeIndex: number | null
  onSetDragOverVolumeIndex: (index: number | null) => void
  onSetDraggingVolumeIndex: (index: number | null) => void
  onDropVolume: (volumeIndex: number) => void | Promise<void>
  onToggleGroup: (groupId: string) => void
  onScrollToNode: (nodeId: string) => void
}

export function SynopsisToc({
  parsed,
  groups,
  tocWidth,
  minWidth,
  maxWidth,
  isGroupOpen,
  drafts,
  selectedGroupId,
  selectedNodeId,
  draggingVolumeIndex,
  dragOverVolumeIndex,
  onSetDragOverVolumeIndex,
  onSetDraggingVolumeIndex,
  onDropVolume,
  onToggleGroup,
  onScrollToNode,
}: SynopsisTocProps) {
  const text = useLocaleStore(s => s.text)

  return (
    <div
      className="flex flex-col flex-shrink-0 border-r overflow-hidden"
      style={{
        width: tocWidth,
        minWidth,
        maxWidth,
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-sidebar)',
      }}
    >
      {parsed.nodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 opacity-40 p-4">
          <Map size={28} />
          <span className="text-xs text-center">
            {text(
              '尚无大纲内容，点击右上角「AI 生成大纲」按章区间生成。',
              'No outline yet. Use “Generate outline” above to create one by chapter range.',
            )}
          </span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-1" data-testid="synopsis-toc">
          {groups.map(group => {
            const open = isGroupOpen(group.id)
            const groupDirty = group.nodes.some(node => drafts[node.id] !== undefined)
            const holdsSelection = group.id === selectedGroupId
            const isDragging = draggingVolumeIndex === group.volumeIndex
            const isDragOver = dragOverVolumeIndex === group.volumeIndex && draggingVolumeIndex !== group.volumeIndex

            return (
              <div
                key={group.id}
                className={`mb-1 transition-all rounded ${
                  isDragOver ? 'border-t-2 border-[var(--color-accent)]' : ''
                } ${isDragging ? 'opacity-40' : ''}`}
                onDragOver={group.draggable ? (e) => { e.preventDefault(); onSetDragOverVolumeIndex(group.volumeIndex!) } : undefined}
                onDragLeave={group.draggable ? () => { onSetDragOverVolumeIndex(null) } : undefined}
                onDrop={group.draggable ? (e) => { e.preventDefault(); void onDropVolume(group.volumeIndex!) } : undefined}
              >
                {/* 活页笔记本分卷标签卡片头 */}
                <div
                  draggable={group.draggable}
                  onDragStart={group.draggable ? (e) => {
                    e.dataTransfer.setData('text/plain', String(group.volumeIndex))
                    onSetDraggingVolumeIndex(group.volumeIndex!)
                  } : undefined}
                  onDragEnd={() => {
                    onSetDraggingVolumeIndex(null)
                    onSetDragOverVolumeIndex(null)
                  }}
                  className={`group relative flex items-center gap-1 rounded px-1.5 py-1 text-xs select-none transition-colors ${
                    group.draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                  } ${
                    holdsSelection && !open
                      ? 'bg-[var(--color-active)] text-[var(--color-text)]'
                      : 'hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)]'
                  } ${
                    group.volumeName ? 'border-l-2' : ''
                  }`}
                  style={{
                    borderLeftColor: group.volumeName ? 'var(--color-accent)' : undefined,
                    color: holdsSelection && !open ? undefined : 'var(--color-text-secondary)',
                  }}
                  onClick={() => onToggleGroup(group.id)}
                  title={group.volumeName
                    ? `${group.label}${group.startChapter ? ` (${group.startChapter}–${group.endChapter}章)` : ''}`
                    : `${group.label}（${group.nodes.length} 段）`
                  }
                >
                  {group.draggable && (
                    <span className="opacity-0 group-hover:opacity-60 transition-opacity -ml-0.5 shrink-0 cursor-grab">
                      <GripVertical size={11} />
                    </span>
                  )}
                  <button
                    type="button"
                    className="flex items-center justify-center p-0.5 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleGroup(group.id)
                    }}
                  >
                    {open
                      ? <ChevronDown size={12} className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                      : <ChevronRight size={12} className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold truncate text-xs text-[var(--color-text)]">
                        {group.volumeName
                          ? group.volumeName.split(/[:：]/)[0]
                          : group.label
                        }
                      </span>
                      {group.startChapter && (
                        <span className="font-mono text-[0.65rem] shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                          {group.startChapter}–{group.endChapter}
                        </span>
                      )}
                    </div>
                    {group.volumeName && group.volumeName.includes('：') && (
                      <div className="text-[0.68rem] truncate opacity-70 leading-tight" style={{ color: 'var(--color-text-muted)' }}>
                        {group.volumeName.split(/[:：]/).slice(1).join('：')}
                      </div>
                    )}
                  </div>
                  {groupDirty && (
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: 'var(--color-accent)' }}
                    />
                  )}
                  <span className="text-[0.65rem] px-1 py-0.2 rounded bg-[var(--color-hover)] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                    {group.nodes.length}
                  </span>
                </div>

                {open && (
                  <div>
                    {group.nodes.map(node => {
                      const nodeDirty = drafts[node.id] !== undefined
                      const active = node.id === selectedNodeId
                      return (
                        <div
                          key={node.id}
                          className={`relative ml-2 px-2 py-1.5 rounded-md text-xs cursor-pointer mb-0.5 transition-colors ${
                            active
                              ? 'bg-[var(--color-active)] text-[var(--color-text)] font-medium'
                              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]'
                          }`}
                          onClick={() => onScrollToNode(node.id)}
                          aria-current={active ? 'true' : undefined}
                          title={node.title ? `${node.label}：${node.title}` : node.label}
                        >
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[0.7rem] opacity-40 flex-shrink-0">
                              {node.startChapter ?? '—'}
                            </span>
                            <span className="font-medium truncate flex-1">{node.label}</span>
                            {nodeDirty && (
                              <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: 'var(--color-accent)' }}
                              />
                            )}
                          </div>
                          {node.title && (
                            <div className="text-[0.68rem] truncate opacity-75 mt-0.5 pl-3.5" style={{ color: 'var(--color-text-muted)' }}>
                              {node.title}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
