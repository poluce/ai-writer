import { useLayoutStore } from '../../stores/layout-store'
import { useProjectStore } from '../../stores/project-store'
import { useLocaleStore } from '../../stores/locale-store'
import { ASSISTANT_VIEWS } from '../panels/agent/assistant-views'
import { resolveAssistantSurface } from './assistant-surface'

/**
 * 右侧助手栏的收起态图标条。
 *
 * 面板展开时五个助手视图由面板头部的 AssistantSwitcher 承担，这里不渲染；
 * 面板收起后保留一条常驻窄图标条，保证每个助手视图都还能一键点回来。
 */
export default function AssistantRail() {
  const aiPanelOpen = useLayoutStore(s => s.aiPanelOpen)
  const openRightPanel = useLayoutStore(s => s.openRightPanel)
  const hasOpenProject = useProjectStore(s => Boolean(s.currentProject))
  const text = useLocaleStore(s => s.text)

  if (!hasOpenProject) return null
  if (resolveAssistantSurface(aiPanelOpen, hasOpenProject) === 'panel') return null

  return (
    <div
      className="writer-right-rail no-select flex flex-col items-center h-full"
      role="toolbar"
      aria-orientation="vertical"
      aria-label={text('AI 助手视图', 'AI assistant views')}
    >
      {ASSISTANT_VIEWS.map(({ id, zh, en, Icon }) => {
        const label = text(zh, en)
        return (
          <div key={id} className="relative">
            <button
              type="button"
              className="rail-button"
              title={label}
              aria-label={label}
              onClick={() => openRightPanel(id)}
            >
              <Icon size={17} strokeWidth={1.7} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
