import { useEffect } from 'react'
import { useLLMStore } from '../../stores/llm-store'
import AgentHeader from './agent/AgentHeader'
import AgentConversation from './agent/AgentConversation'

/**
 * 右侧 AI 审稿助手面板（Development Editor）
 * 专职章节草稿的只读审查：一致性、人物、情节逻辑、节奏、对白与文字基础。
 * - 顶部：AgentHeader（专属审稿助手标题与会话管理）
 * - 主体：AgentConversation（专属审稿历史/空状态）
 */
export default function ReviewPanel() {
  const init = useLLMStore(s => s.init)
  const loaded = useLLMStore(s => s.loaded)
  useEffect(() => {
    if (!loaded) init()
  }, [init, loaded])

  return (
    <div className="writer-ai-panel w-full h-full flex flex-col overflow-hidden">
      {/* 顶部工具栏（审稿助手模式） */}
      <AgentHeader assistantType="review" />

      {/* 主对话区：占满剩余高度 */}
      <div className="flex-1 overflow-hidden">
        <AgentConversation assistantType="review" />
      </div>
    </div>
  )
}
