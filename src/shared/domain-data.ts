/**
 * 公共域数据类型 — 跨层共享的领域数据契约，唯一定义处。
 *
 * 从 ipc-channels.ts 拆出：ipc-channels 保留 IPC 频道契约（channel 名与
 * 参数/返回值），域数据模型（项目、小说配置、模型档案、LLM 请求）集中
 * 在本模块。ipc-channels 通过再导出保持既有导入路径不变。
 * 只依赖 shared 内的叶子模块，不依赖任何业务上层。
 */

import type {
  CreativeStrategy,
  GenerationReasoningStage,
  ReasoningEffort,
  ReasoningOverride} from './reasoning-types'
import type { SubmitToolName } from './submit-contract'
import type { EmbeddingOptions } from './embedding-options'
import type { ModelCapabilities } from './provider-presets'
import type { WritingLanguage } from './writing-language'

// ===== 创作环节调度 =====

export type CreationTaskKey =
  | 'outline'     // 核心大纲与设定推演 (Core Outline & Novel Settings)
  | 'planning'    // 故事规划与分卷蓝图 (Story Planning & Beat Sheets)
  | 'drafting'    // 章节起草与正文扩写 (Chapter Drafting & Prose Expansion)
  | 'review'      // 审稿质检与润色改写 (Review, Quality Control & Polishing)
  | 'assistant'   // 创作助手日常对话 (Sidebar Creative Assistant)

export interface TaskModelConfig {
  /** 指定的模型 ID；为空或未配置时自动遵循全局默认生成模型。 */
  modelId?: string | null
  /** 指定的思考强度；'auto' 时使用该环节推荐的思考强度。 */
  thinkingLevel?: 'auto' | ReasoningEffort
}

export type TaskModelRouting = Partial<Record<CreationTaskKey, TaskModelConfig>>

// ===== 项目会话身份 =====

/**
 * 当前打开项目的跨进程身份。认项目清单里的 projectId，路径只做根目录校验。
 */
export interface ProjectSessionContext {
  projectId: string
  projectPath: string
}

// ===== 项目与文件 =====

export interface ProjectData {
  id: string
  name: string
  path: string
  novelConfig: NovelConfig
  characterStates: string
  createdAt: string
  updatedAt: string
}

export interface NovelConfig {
  /**
   * Project content language; independent from the application UI locale.
   * Missing only while reading pre-language renderer drafts; project open normalizes it.
   */
  writingLanguage?: WritingLanguage
  /** Project-scoped writing intent; independent from the selected model. */
  creativeStrategy?: CreativeStrategy
  /** Project-scoped chapter count before an active narrative thread is marked dormant. */
  narrativeThreadDormantChapterThreshold?: number
  genre: string
  subGenre: string
  targetAudience: string
  totalChapters: number
  wordsPerChapter: number
  plotStructure: 'three_act' | 'heros_journey' | 'save_the_cat' | 'kishotenketsu' | 'multi_thread' | 'freeform'
  narrativePOV: 'third_limited' | 'first_person' | 'third_omniscient' | 'multi_pov'
  coreOutline: string
  worldSetting: string
  goldenFinger: string
  protagonistProfile: string
  globalGuidance: string
  writingStyle?: string
  referenceWorks?: string
}

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  children?: FileNode[]
}

/** 只携带用户可展示名称和不透明能力标识；不暴露外部绝对路径。 */
export interface ExternalFileGrant {
  grantId: string
  displayName: string
}

export type ExternalDirectoryGrant = ExternalFileGrant

// ===== 提示词数据 =====

/** 固定 app-data 服务使用的提示词数据；文件位置不由渲染进程决定。 */
export interface AppPromptTemplate {
  key: string
  writingLanguage?: WritingLanguage
  [key: string]: unknown
}

export interface PromptLoadDiagnostic {
  /** Derived from the owned filename when possible; absent means the whole scope is unreadable. */
  key?: string
  /** Absent on legacy receipts, which retain their original scope-wide behavior. */
  writingLanguage?: WritingLanguage
  path: string
  error: string
}

export interface AppPromptLoadReceipt {
  templates: AppPromptTemplate[]
  diagnostics: PromptLoadDiagnostic[]
}

// ===== LLM 请求与模型档案 =====

export interface LLMRequest {
  modelId: string
  /** Stable attribution for per-project call history. */
  purpose?: string
  /** Project-scoped product intent captured by the renderer for this request. */
  creativeStrategy?: CreativeStrategy
  /** Controlled semantic stage; never inferred from the diagnostic purpose label. */
  reasoningStage?: GenerationReasoningStage
  /** 具体的创作环节标识，用于路由模型与思考强度 */
  taskKey?: CreationTaskKey
  /** 显式指定的思考强度；若指定则优先于宏观策略 */
  reasoningEffort?: ReasoningEffort
  /** Frozen project lease. Missing/stale leases are never written to project statistics. */
  projectSession?: ProjectSessionContext
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  maxTokens?: number
  stream?: boolean
  responseFormat?: { type: 'json_object' | 'text' }
  /** When set, main process uses this submit_* tool; otherwise generate-stream defaults to submit_text. */
  submitTool?: SubmitToolName
}

export type ModelExecutionCapabilityEvidenceSource =
  | 'verified-provider-preset'
  | 'pi-ai-model-registry'
  | 'user-operational-cap'
  | 'legacy-profile'
  | 'unknown'

export interface ModelExecutionCapabilityEvidence {
  source: {
    contextWindowTokens: ModelExecutionCapabilityEvidenceSource
    maxOutputTokens: ModelExecutionCapabilityEvidenceSource
    featureFlags: ModelExecutionCapabilityEvidenceSource
  }
  subjectFingerprint: string
  contextWindowTokens: number | null
  maxOutputTokens: number
  reasoning: boolean | null
  structuredOutput: boolean | null
  usage: boolean | null
}

/** Non-secret evidence for a complete ModelProfile snapshot retained only in the main process. */
export interface ModelExecutionLeaseReceipt {
  leaseId: string
  modelId: string
  provider: ModelProfile['provider']
  protocol: ModelProfile['protocol']
  modelName: string
  modelRevision: string
  endpointFingerprint: string
  capabilityEvidence: ModelExecutionCapabilityEvidence
  createdAt: number
  expiresAt: number
}

/**
 * Provider-neutral end state for generated text. `stop` is the only state
 * that downstream workflows and the Agent may treat as a complete response.
 */
export type LLMFinishReason =
  | 'stop'
  | 'length'
  | 'content_filter'
  | 'cancelled'
  | 'error'
  | 'unknown'

export interface TokenUsage {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

export interface ModelProfile {
  id: string
  name: string
  /** 所属渠道名称（如 hajimi / 自定义中转），同一个渠道下的模型共享该名称 */
  channelName?: string
  provider: 'openai' | 'gemini' | 'deepseek' | 'ollama' | 'bigmodel' | 'xai' | 'siliconflow' | 'custom'
  protocol: 'openai' | 'gemini'
  modelName: string
  apiKey: string
  baseUrl: string
  temperature: number
  /** 新配置使用的端点能力；旧配置缺失时继续使用 maxTokens。 */
  capabilities?: ModelCapabilities
  /** 旧配置和当前执行路径使用的输出 token 上限，保持兼容。 */
  maxTokens: number
  purposes: Array<'generation' | 'refinement' | 'summary' | 'embedding'>
  /** Profile-scoped advanced request; `auto` defers to project strategy and purpose. */
  reasoningOverride?: ReasoningOverride
  /** 仅用于 Embedding 模型；旧配置省略时沿用原有默认行为。 */
  embeddingOptions?: EmbeddingOptions
}

// ===== 项目清理 =====

export interface ProjectClearOptions {
  creativeFields?: boolean
  blueprints?: boolean
  generatedText?: boolean
}

export type ProjectClearScope = 'creativeFields' | 'blueprints' | 'generatedText'