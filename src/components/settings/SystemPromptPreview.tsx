import { useEffect, useState, type ReactElement } from 'react'
import { Copy, Download, X } from 'lucide-react'

import { ipc } from '../../services/ipc-client'
import { buildAgentSkillCatalog } from '../../services/agent/skill-catalog'
import { skillRegistry } from '../../services/agent/skill-registry'
import { ASSISTANT_TYPES, assistantLabel } from '../../services/agent/assistant-settings'
import type { AssistantPromptPreview } from '../../shared/agent-prompt'
import type { AssistantType } from '../../shared/agent-conversation-archive'
import { resolveWritingLanguage } from '../../shared/writing-language'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'
import { cn } from '../../lib/utils'

interface SystemPromptPreviewProps {
  open: boolean
  onClose: () => void
  assistantType: AssistantType
}

/** 粗略 token 估算：CJK 约 1 字 1 token，其余按 3.5 字符 1 token。 */
function estimateTokens(value: string): number {
  let cjk = 0
  let other = 0
  for (const char of value) {
    if (/[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/u.test(char)) cjk += 1
    else other += 1
  }
  return Math.ceil(cjk + other / 3.5)
}

export default function SystemPromptPreview({
  open,
  onClose,
  assistantType,
}: SystemPromptPreviewProps): ReactElement | null {
  const text = useLocaleStore((s) => s.text)
  const project = useProjectStore((s) => s.currentProject)
  const language = resolveWritingLanguage(project?.novelConfig.writingLanguage)
  const [active, setActive] = useState<AssistantType>(assistantType)
  const [preview, setPreview] = useState<AssistantPromptPreview | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let disposed = false
    void (async () => {
      try {
        await skillRegistry.ensureLoaded()
        const result = await ipc.invoke(
          'agent:system-prompt',
          buildAgentSkillCatalog(language),
          active,
        )
        if (disposed) return
        if (result.success) {
          setPreview({
            prompt: result.prompt ?? '',
            blocks: result.blocks ?? [],
            assistantType: active,
          })
        }
      } catch {
        if (!disposed) setPreview(null)
      }
    })()
    return () => {
      disposed = true
    }
  }, [open, active, language])

  if (!open) return null

  async function handleCopy(): Promise<void> {
    if (!preview) return
    try {
      await navigator.clipboard.writeText(preview.prompt)
      setNotice(text('已复制', 'Copied'))
    } catch {
      setNotice(text('复制失败', 'Copy failed'))
    }
    window.setTimeout(() => setNotice(null), 2000)
  }

  function handleExport(): void {
    if (!preview) return
    const blob = new Blob([preview.prompt], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `assistant-prompt-${preview.assistantType}.md`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col w-[760px] max-h-[620px] rounded-xl overflow-hidden"
        style={{ backgroundColor: 'var(--color-editor-bg)', border: '1px solid var(--color-border)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {text('最终系统提示词', 'Final system prompt')}
          </span>
          <div className="flex bg-[var(--color-hover)] rounded-lg p-0.5 ml-2">
            {ASSISTANT_TYPES.map((item) => (
              <button
                key={item}
                onClick={() => { setActive(item); setPreview(null) }}
                className={cn('px-2 py-1 rounded-md text-[0.68rem] transition-colors', active === item ? 'bg-[var(--color-panel)] shadow-sm font-medium' : '')}
                style={{ color: active === item ? 'var(--color-text)' : 'var(--color-text-muted)' }}
              >
                {assistantLabel(item, language)}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[0.65rem]" style={{ color: 'var(--color-text-muted)' }}>
            {preview ? `${estimateTokens(preview.prompt).toLocaleString()} tokens` : ''}
          </span>
          <button
            onClick={onClose}
            aria-label={text('关闭', 'Close')}
            className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-[var(--color-hover)]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
          {preview ? (
            <pre
              className="m-0 text-[0.7rem] leading-relaxed whitespace-pre-wrap font-mono"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {preview.prompt}
            </pre>
          ) : (
            <div className="text-xs py-10 text-center" style={{ color: 'var(--color-text-muted)' }}>
              {text('正在读取…', 'Loading…')}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-sidebar)' }}>
          <span className="ml-auto text-[0.65rem]" style={{ color: 'var(--color-text-muted)' }}>{notice}</span>
          <button onClick={() => void handleCopy()} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[0.68rem] hover:bg-[var(--color-hover)]" style={{ color: 'var(--color-text-secondary)' }}>
            <Copy size={12} />
            {text('复制', 'Copy')}
          </button>
          <button onClick={handleExport} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[0.68rem] hover:bg-[var(--color-hover)]" style={{ color: 'var(--color-text-secondary)' }}>
            <Download size={12} />
            {text('导出', 'Export')}
          </button>
        </div>
      </div>
    </div>
  )
}
