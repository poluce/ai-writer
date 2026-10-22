import { isAssistantThinkingLevel, type AssistantThinkingLevel } from './agent-runtime'

export const AGENT_CONVERSATION_ARCHIVE_VERSION = 1 as const

type PersistedAgentMode = 'planning' | 'fast'

export interface PersistedAgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
  toolCalls?: unknown
  artifacts?: unknown
}

export const ASSISTANT_TYPES = ['general', 'architect', 'blueprint', 'review'] as const

export type AssistantType = (typeof ASSISTANT_TYPES)[number]

/**
 * 会话 ID 前缀是助手类型的稳定身份编码：主进程与渲染进程都靠它把历史会话
 * 归档回各自的助手面板。general 保留无前缀的历史格式。
 */
const ASSISTANT_CONVERSATION_PREFIXES: Record<AssistantType, string> = {
  general: '',
  architect: 'architect-',
  blueprint: 'blueprint-',
  review: 'review-',
}

export function isAssistantType(value: unknown): value is AssistantType {
  return typeof value === 'string' && (ASSISTANT_TYPES as readonly string[]).includes(value)
}

export function conversationPrefixForAssistantType(type: AssistantType): string {
  return ASSISTANT_CONVERSATION_PREFIXES[type]
}

export function assistantTypeFromConversationId(conversationId: string): AssistantType {
  for (const type of ASSISTANT_TYPES) {
    const prefix = ASSISTANT_CONVERSATION_PREFIXES[type]
    if (prefix && conversationId.startsWith(prefix)) return type
  }
  return 'general'
}

export interface PersistedAgentConversation {
  id: string
  title: string
  messages: PersistedAgentMessage[]
  createdAt: number
  updatedAt: number
  mode: PersistedAgentMode
  modelId: string | null
  /** 会话级思考等级；缺省表示 Pi 默认（off）。 */
  thinkingLevel?: AssistantThinkingLevel | null
  /** 助手类型：通用写作助手（general）、架构助手（architect）、章节蓝图助手（blueprint）或审稿助手（review） */
  assistantType?: AssistantType
}

export interface AgentConversationArchive {
  version: typeof AGENT_CONVERSATION_ARCHIVE_VERSION
  activeConversationId: string | null
  conversations: PersistedAgentConversation[]
}

export interface AgentPromptHistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

export function emptyAgentConversationArchive(): AgentConversationArchive {
  return {
    version: AGENT_CONVERSATION_ARCHIVE_VERSION,
    activeConversationId: null,
    conversations: [],
  }
}

function isMode(value: unknown): value is PersistedAgentMode {
  return value === 'planning' || value === 'fast'
}

function persistMessage(value: unknown): PersistedAgentMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const message = value as Partial<PersistedAgentMessage> & { streaming?: unknown }
  if (typeof message.id !== 'string' || !message.id) return null
  if (message.role !== 'user' && message.role !== 'assistant' && message.role !== 'system') return null
  if (typeof message.content !== 'string') return null
  if (typeof message.createdAt !== 'number' || !Number.isFinite(message.createdAt)) return null
  if (message.streaming && !message.content.trim()) return null
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    ...(message.toolCalls !== undefined ? { toolCalls: message.toolCalls } : {}),
    ...(message.artifacts !== undefined ? { artifacts: message.artifacts } : {}),
  }
}

function persistConversation(value: unknown): PersistedAgentConversation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const conversation = value as Partial<PersistedAgentConversation>
  if (typeof conversation.id !== 'string' || !conversation.id) return null
  if (typeof conversation.title !== 'string') return null
  if (!Array.isArray(conversation.messages)) return null
  if (typeof conversation.createdAt !== 'number' || !Number.isFinite(conversation.createdAt)) return null
  if (typeof conversation.updatedAt !== 'number' || !Number.isFinite(conversation.updatedAt)) return null
  const messages = conversation.messages
    .map(persistMessage)
    .filter((message): message is PersistedAgentMessage => message !== null)
  return {
    id: conversation.id,
    title: conversation.title,
    messages,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    mode: isMode(conversation.mode) ? conversation.mode : 'planning',
    modelId: typeof conversation.modelId === 'string' ? conversation.modelId : null,
    thinkingLevel: isAssistantThinkingLevel(conversation.thinkingLevel)
      ? conversation.thinkingLevel
      : null,
    assistantType: isAssistantType(conversation.assistantType)
      ? conversation.assistantType
      : assistantTypeFromConversationId(conversation.id),
  }
}

export function parseAgentConversationArchive(value: unknown): AgentConversationArchive {
  if (value == null) return emptyAgentConversationArchive()
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('助手会话存档格式无效')
  }
  const candidate = value as Partial<AgentConversationArchive>
  if (candidate.version !== AGENT_CONVERSATION_ARCHIVE_VERSION) {
    throw new Error('助手会话存档版本不受支持')
  }
  if (!Array.isArray(candidate.conversations)) {
    throw new Error('助手会话存档缺少会话列表')
  }
  const conversations = candidate.conversations
    .map(persistConversation)
    .filter((conversation): conversation is PersistedAgentConversation => conversation !== null)
  const activeConversationId = typeof candidate.activeConversationId === 'string'
    && conversations.some(conversation => conversation.id === candidate.activeConversationId)
    ? candidate.activeConversationId
    : conversations[0]?.id ?? null
  return {
    version: AGENT_CONVERSATION_ARCHIVE_VERSION,
    activeConversationId,
    conversations,
  }
}

export function serializeAgentConversationArchive(
  conversations: readonly PersistedAgentConversation[],
  activeConversationId: string | null,
): string {
  const archive: AgentConversationArchive = {
    version: AGENT_CONVERSATION_ARCHIVE_VERSION,
    activeConversationId: activeConversationId
      && conversations.some(conversation => conversation.id === activeConversationId)
      ? activeConversationId
      : conversations[0]?.id ?? null,
    conversations: conversations.map(conversation => persistConversation(conversation)).filter(
      (conversation): conversation is PersistedAgentConversation => conversation !== null,
    ),
  }
  return `${JSON.stringify(archive, null, 2)}\n`
}

export function toAgentPromptHistory(
  messages: readonly Pick<PersistedAgentMessage, 'role' | 'content'>[],
): AgentPromptHistoryTurn[] {
  const history: AgentPromptHistoryTurn[] = []
  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    const content = message.content.trim()
    if (!content) continue
    history.push({ role: message.role, content })
  }
  return history
}
