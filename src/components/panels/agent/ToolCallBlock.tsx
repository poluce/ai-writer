/**
 * ToolCallBlock — Tool 调用可视化区块
 *
 * 显示 Agent 调用的每个 Tool：
 * - 折叠的头部：Tool 名称 + 来源徽章 + 状态指示
 * - 展开的主体：参数 JSON + 执行结果
 *
 * 参考 Cursor/Antigravity 的 tool-use 可视化设计。
 */
import { useState } from 'react'
import {
  Wrench,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'
import type { ToolCallInfo } from '../../../shared/agent-ui-types'
import { useLocaleStore } from '../../../stores/locale-store'
import { useEditorStore } from '../../../stores/editor-store'

interface Props {
  toolCall: ToolCallInfo
}

/** 将工具名和参数格式化为业务友好的展示标题 */
function formatToolCallTitle(
  toolName: string,
  args: Record<string, unknown>,
  text: ReturnType<typeof useLocaleStore.getState>['text'],
): string {
  if (toolName === 'delegate_to_assistant') {
    const assistant = args.assistant
    const label = assistant === 'review'
      ? text('审稿助手', 'Review Assistant')
      : assistant === 'blueprint'
        ? text('蓝图助手', 'Blueprint Assistant')
        : assistant === 'architect'
          ? text('架构助手', 'Architecture Assistant')
          : text('专门助手', 'Specialized Assistant')
    return text(`委派任务 → ${label}`, `Delegate Task → ${label}`)
  }
  if (toolName === 'submit_chapter_review') {
    const ch = args.chapter_number
    return typeof ch === 'number'
      ? text(`提交审稿报告：第 ${ch} 章`, `Submit Review Report: Chapter ${ch}`)
      : text('提交审稿报告', 'Submit Review Report')
  }
  if (toolName === 'open_editor') {
    const target = args.target
    if (target === 'draft' && typeof args.chapter_number === 'number') {
      return text(`在主工作区打开：第 ${args.chapter_number} 章草稿`, `Open in Workspace: Chapter ${args.chapter_number} draft`)
    }
    const targetLabels: Record<string, [string, string]> = {
      config: ['小说配置', 'Novel configuration'],
      blueprints: ['章节蓝图', 'Chapter blueprints'],
      characters: ['角色管理', 'Characters'],
      architecture: ['故事架构', 'Story architecture'],
      synopsis: ['情节大纲', 'Plot outline'],
    }
    const mapped = typeof target === 'string' ? targetLabels[target] : undefined
    const label = mapped ? text(mapped[0], mapped[1]) : String(target || '')
    return text(`在主工作区打开：${label}`, `Open in Workspace: ${label}`)
  }
  return toolName
}

/** 状态图标映射 */
function StatusIcon({ status }: { status: ToolCallInfo['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={13} className="tool-call-status completed" />
    case 'failed':
      return <XCircle size={13} className="tool-call-status failed" />
    case 'result_unknown':
      return <AlertTriangle size={13} className="tool-call-status waiting_confirm" />
    case 'running':
      return <Loader2 size={13} className="tool-call-status running tool-spinner" />
    case 'waiting_confirm':
      return <AlertTriangle size={13} className="tool-call-status waiting_confirm tool-pulse" />
    case 'pending':
    default:
      return <Loader2 size={13} className="tool-call-status running" style={{ opacity: 0.3 }} />
  }
}

/** 状态文字 */
function statusLabel(
  status: ToolCallInfo['status'],
  text: ReturnType<typeof useLocaleStore.getState>['text'],
): string {
  switch (status) {
    case 'completed': return text('完成', 'Completed')
    case 'failed': return text('失败', 'Failed')
    case 'result_unknown': return text('结果待确认', 'Result unknown')
    case 'running': return text('执行中', 'Running')
    case 'waiting_confirm': return text('待确认', 'Waiting for confirmation')
    case 'pending': return text('等待中', 'Pending')
    default: return ''
  }
}

export default function ToolCallBlock({ toolCall }: Props) {
  const text = useLocaleStore(s => s.text)
  const [expanded, setExpanded] = useState(false)
  const { toolName, arguments: args, status, result, error, source } = toolCall

  const isReviewAction = toolName === 'submit_chapter_review' || (toolName === 'delegate_to_assistant' && args.assistant === 'review')
  const reviewTab = isReviewAction && status === 'completed'
    ? useEditorStore(s => s.tabs.find(t => t.type === 'review-report'))
    : null

  const targetTab = status === 'completed'
    ? useEditorStore(s => s.tabs.find(t => {
        if (toolName === 'open_editor' && args.target === 'draft' && typeof args.chapter_number === 'number') {
          return t.type === 'chapter' && t.chapterNumber === args.chapter_number
        }
        return false
      }))
    : null

  const actionableTab = reviewTab ?? targetTab
  const actionLabel = reviewTab
    ? text('查看审稿看板', 'View Review Report')
    : text('查看草稿', 'View Draft')

  return (
    <div className="tool-call-block">
      {/* 折叠头部 */}
      <div className="tool-call-header" onClick={() => setExpanded(v => !v)}>
        <div className="tool-call-icon">
          <Wrench size={12} style={{ color: 'var(--color-text-muted)' }} />
        </div>

        <span className="tool-call-name">{formatToolCallTitle(toolName, args, text)}</span>

        {/* 来源徽章 */}
        {source && (
          <span className={`tool-call-source-badge ${source}`}>
            {source === 'builtin'
              ? text('内置', 'Built-in')
              : source === 'mcp'
                ? 'MCP'
                : text('Skill', 'Skill')}
          </span>
        )}

        {/* 状态 */}
        <div className="tool-call-status" style={{ marginLeft: 'auto' }}>
          <StatusIcon status={status} />
          <span>{statusLabel(status, text)}</span>
        </div>

        {/* 展开箭头 */}
        <ChevronRight
          size={12}
          className={`tool-call-arrow ${expanded ? 'expanded' : ''}`}
        />
      </div>

      {/* 主工作区直达快捷操作条 */}
      {actionableTab && (
        <div
          className="px-3 py-1.5 flex items-center justify-between text-xs"
          style={{
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-bg-elevated)',
          }}
        >
          <span style={{ color: 'var(--color-text-secondary)' }}>
            {reviewTab
              ? text('审稿报告已在主工作区展开', 'Review report opened in main workspace')
              : text('文档已在主工作区展开', 'Document opened in main workspace')}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              useEditorStore.getState().setActiveTab(actionableTab.id)
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            <ExternalLink size={11} />
            {actionLabel}
          </button>
        </div>
      )}

      {/* 展开区域 */}
      {expanded && (
        <div className="tool-call-body">
          {/* 参数 */}
          {Object.keys(args).length > 0 && (
            <div className="tool-call-params">
              {JSON.stringify(args, null, 2)}
            </div>
          )}

          {/* 结果 */}
          {result && (
            <div className="tool-call-result" style={{ position: 'relative' }}>
              {result}
              <button
                onClick={() => navigator.clipboard.writeText(result).catch(() => {})}
                className="absolute top-1 right-1 text-[0.65rem] px-1.5 py-0.5 rounded transition-opacity opacity-0 hover:opacity-100"
                style={{
                  backgroundColor: 'var(--color-hover)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
                title={text('复制结果', 'Copy result')}
              >
                {text('复制', 'Copy')}
              </button>
            </div>
          )}

          {/* 错误 */}
          {error && (
            <div className="tool-call-result" style={{ color: 'var(--color-error-text)' }}>
              <XCircle size={13} className="inline mr-1" />{error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
