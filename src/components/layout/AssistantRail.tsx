import { useLayoutStore } from '../../stores/layout-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useLocaleStore } from '../../stores/locale-store'
import { ASSISTANT_VIEWS, shouldPulseOutputTab } from '../panels/agent/AssistantSwitcher'

/**
 * 右侧助手栏的收起态图标条。
 *
 * 面板展开时五个视图由面板头部的 AssistantSwitcher 承担，这里不渲染；
 * 面板收起后保留一条常驻窄图标条，保证每个助手视图都还能一键点回来，
 * 不会出现「关掉面板就再也找不到入口」的死角。
 */
export default function AssistantRail() {
  const aiPanelOpen = useLayoutStore(s => s.aiPanelOpen)
  const rightView = useLayoutStore(s => s.rightView)
  const openRightPanel = useLayoutStore(s => s.openRightPanel)
  const activeRuns = useWorkflowStore(s => s.activeRuns)
  const text = useLocaleStore(s => s.text)

  if (aiPanelOpen) return null

  const showOutputPulse = shouldPulseOutputTab(rightView, activeRuns)

  return (
    <div
      className="writer-right-rail no-select flex flex-col items-center h-full"
      role="toolbar"
      aria-orientation="vertical"
      aria-label={text('AI 助手视图', 'AI assistant views')}
    >
      {ASSISTANT_VIEWS.map(({ id, zh, en, Icon }) => (
        <div key={id} className="relative">
          <button
            type="button"
            className="rail-button"
            title={text(zh, en)}
            aria-label={text(zh, en)}
            onClick={() => openRightPanel(id)}
          >
            <Icon size={17} strokeWidth={1.7} />
          </button>
          {id === 'ai-output' && showOutputPulse && (
            <span
              className="absolute top-[3px] right-[3px] h-1.5 w-1.5 rounded-full animate-pulse pointer-events-none"
              style={{ backgroundColor: 'var(--color-accent)' }}
            />
          )}
        </div>
      ))}
    </div>
  )
}
