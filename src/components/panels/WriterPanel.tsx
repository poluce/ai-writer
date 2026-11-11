import { useEffect } from 'react'
import { useLLMStore } from '../../stores/llm-store'
import AgentHeader from './agent/AgentHeader'
import AgentConversation from './agent/AgentConversation'

/**
 * 右侧 AI 写作助手面板（Prose Writer）
 * 专职章节正文起草、场景扩写、对白润色、划词与审稿修稿，以及人物状态与伏笔进展同步。
 * - 顶部：AgentHeader（专属写作助手标题与会话管理）
 * - 主体：AgentConversation（专属写作助手空状态/创作对话历史）
 */
export default function WriterPanel() {
  const init = useLLMStore(s => s.init)
  const loaded = useLLMStore(s => s.loaded)
  useEffect(() => {
    if (!loaded) init()
  }, [init, loaded])

  return (
    <div className="writer-ai-panel w-full h-full flex flex-col overflow-hidden">
      {/* 顶部工具栏（写作助手模式） */}
      <AgentHeader assistantType="writer" />

      {/* 主对话区：占满剩余高度 */}
      <div className="flex-1 overflow-hidden">
        <AgentConversation assistantType="writer" />
      </div>
    </div>
  )
}
