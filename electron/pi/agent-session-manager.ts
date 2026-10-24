import { randomUUID } from 'node:crypto'
import {
  BACKGROUND_CONTEXT,
  type ExecutionEnv,
} from '@earendil-works/pi-agent-core'

import { AgentSession } from './agent-session'
import { abortAllPiInFlight, registerPiInFlight } from './in-flight'
import { ConversationQueue } from './conversation-queue'
import { createPiModels } from './pi-models'
import { toPiModelSamplingParams } from './pi-stream-options'
import { resolveGenerationParameters } from '../llm/generation-parameter-policy'
import { buildToolsForAssistantType, confirmationToolNames, type AssistantDelegateHandler, type DelegatableAssistantType } from './tool-builder'
import type { AgentConversationStore } from './agent-conversation-store'

import type { CreativeStrategy } from '../../src/shared/reasoning-types'
import type { AgentEditorSnapshot, PiAgentEvent, RendererActionSink } from '../../src/shared/agent-events'
import type { AgentSkillCatalogEntry } from '../../src/shared/agent-skills'
import type { AssistantThinkingLevel } from '../../src/shared/agent-runtime'
import type { AgentTurnRefusalCode } from '../../src/shared/agent-turn-refusal'
import type { AgentPromptHistoryTurn, AssistantType, PersistedAgentConversation } from '../../src/shared/agent-conversation-archive'
import { assistantTypeFromConversationId } from '../../src/shared/agent-conversation-archive'
import type { ModelProfile } from '../../src/shared/ipc-channels'
import { writingLanguageText, type WritingLanguage } from '../../src/shared/writing-language'
import { logFailure, logInfo } from '../../src/shared/fail-log'

/** 会话的运行时身份：换模型、凭据、端点或思考等级都算换运行时，会话要重建。 */
function agentRuntimeKey(profile: ModelProfile, thinkingLevel: AssistantThinkingLevel): string {
  return [
    profile.id,
    profile.provider,
    profile.protocol,
    profile.modelName,
    profile.baseUrl,
    profile.apiKey,
    thinkingLevel,
  ].join('\u0000')
}

/**
 * 我们自己拒绝这一轮时抛的错。
 *
 * 带上原因码，渲染层才能给出一句人能读的话；未知异常的原文不会走到界面上
 * （旧行为是统一显示"生成失败"，这里保持不放宽）。
 */
export class AgentTurnRefusal extends Error {
  constructor(readonly code: AgentTurnRefusalCode, message: string) {
    super(message)
    this.name = 'AgentTurnRefusal'
  }
}

export interface AgentSessionManagerOptions {
  /** Resolve a persisted model profile for a turn (modelId may be undefined). */
  resolveModel: (modelId: string | undefined, assistantType?: AssistantType) => ModelProfile | null
  resolveSystemPrompt: (
    conversationId: string,
    skills?: readonly AgentSkillCatalogEntry[],
    assistantType?: AssistantType,
  ) => string
  resolveLanguage: (conversationId: string) => WritingLanguage
  /** Forward a normalized agent event toward the renderer. */
  emit: (conversationId: string, event: PiAgentEvent) => void
  rendererAction: RendererActionSink
  /** Durable Pi session of the open project; absent means the turn must be refused. */
  resolveConversationStore?: () => AgentConversationStore | null
  /** Pi harness 执行工具的沙箱环境；不返回就不挂这些工具。 */
  resolveToolEnvironment?: () => ExecutionEnv | null
  /** 允许直读正文的技能根（用户级 + 项目级）；不返回就只用目录快照。 */
  resolveSkillRoots?: () => readonly string[]
  /**
   * 助手对话的创作策略；工作流路径按各自的阶段解析，助手固定用 `general`。
   * 不返回就按 `auto` 处理。
   */
  resolveCreativeStrategy?: () => CreativeStrategy | undefined
}

/**
 * Owns one long-lived Pi Agent harness per conversation. The IPC handler
 * delegates prompt/confirm/abort here; sessions stay warm for context-cache
 * reuse and are aborted on book switch.
 */
export class AgentSessionManager {
  private readonly sessions = new Map<string, AgentSession>()
  /** 每个会话由哪个 store 提供存档，关会话时要让它忘掉这个已关闭的 session。 */
  private readonly stores = new Map<string, AgentConversationStore | null>()
  /** 会话当前的运行时身份（模型 + 思考等级），用来判断要不要重建。 */
  private readonly runtimeKeys = new Map<string, string>()
  /** 父会话到正在执行的委派子会话的映射（用于联动终止） */
  private readonly delegatedChildren = new Map<string, string>()
  /** 每个会话专属的消息与任务接收队列（FIFO 保证顺序执行与忙碌排队缓冲） */
  private readonly queues = new Map<string, ConversationQueue>()

  constructor(private readonly options: AgentSessionManagerOptions) {}

  private getQueue(conversationId: string): ConversationQueue {
    let queue = this.queues.get(conversationId)
    if (!queue) {
      queue = new ConversationQueue()
      this.queues.set(conversationId, queue)
    }
    return queue
  }

  async prompt(
    conversationId: string,
    input: string,
    modelId?: string,
    editorSnapshot?: AgentEditorSnapshot,
    history?: readonly AgentPromptHistoryTurn[],
    skills?: readonly AgentSkillCatalogEntry[],
    thinkingLevel?: AssistantThinkingLevel,
    executionMode?: 'plan' | 'writing',
    assistantType: AssistantType = assistantTypeFromConversationId(conversationId),
  ): Promise<{ success: boolean; error?: string; code?: AgentTurnRefusalCode }> {
    const queue = this.getQueue(conversationId)
    return queue.enqueue(async () => {
      try {
        const profile = this.options.resolveModel(modelId, assistantType)
        logInfo('Agent', 'prompt start', {
          conversationId,
          modelId,
          modelName: profile?.modelName,
          protocol: profile?.protocol,
          provider: profile?.provider,
          thinkingLevel: thinkingLevel ?? 'off',
          executionMode: executionMode ?? 'plan',
          assistantType,
          chars: input.length,
          pendingQueued: queue.pendingCount,
        })
        const session = await this.getOrCreate(conversationId, modelId, history, skills, thinkingLevel, assistantType)
        const language = this.options.resolveLanguage(conversationId)
        session.setEditorSnapshot(editorSnapshot)
        session.setExecutionMode(executionMode)
        session.setSystemPrompt(this.options.resolveSystemPrompt(conversationId, skills, assistantType))
        const tools = buildToolsForAssistantType(assistantType, language, this.options.rendererAction, {
          skills,
          skillRoots: this.options.resolveSkillRoots?.() ?? [],
          delegateHandler: this.createDelegateHandler(conversationId),
        })
        await session.setTools(tools)
        await session.prompt(input)
        logInfo('Agent', 'prompt finished', { conversationId, modelId, assistantType })
        return { success: true }
      } catch (error) {
        logFailure('Agent', 'prompt failed', error, { conversationId, modelId })
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          ...(error instanceof AgentTurnRefusal ? { code: error.code } : {}),
        }
      }
    }, `prompt:${conversationId}`)
  }

  confirm(conversationId: string, toolCallId: string, confirmed: boolean): { success: boolean } {
    const session = this.sessions.get(conversationId)
    if (!session) return { success: false }
    session.confirm(toolCallId, confirmed)
    return { success: true }
  }

  abort(conversationId: string): { success: boolean } {
    const childId = this.delegatedChildren.get(conversationId)
    if (childId) {
      this.sessions.get(childId)?.abort()
      this.queues.get(childId)?.abortPending('父会话已终止委派任务')
    }
    this.queues.get(conversationId)?.abortPending('会话已终止生成')
    const session = this.sessions.get(conversationId)
    if (!session) return { success: false }
    session.abort()
    return { success: true }
  }

  private createDelegateHandler(parentConversationId: string): AssistantDelegateHandler {
    return (params) => this.delegateTask(params, parentConversationId)
  }

  /**
   * 向专门领域助手（架构助手、章节蓝图助手或审稿助手）委派任务。
   * 目标助手在自身独立会话中执行，完成后返回生成文本，并把设定/蓝图/审稿报告更新写入项目。
   * 引入消息排队机制（Mailbox Queue）：
   * - 优先复用目标助手的已有会话；
   * - 若目标助手已有会话处于忙碌状态，任务平滑压入其消息队列排队等待，严禁并发新建碎片会话；
   * - 仅在完全不存在任何历史会话时，才创建初始会话。
   */
  async delegateTask(
    params: {
      target: DelegatableAssistantType
      task: string
      chapter_number?: number
      instructions?: string
      context?: string
    },
    parentConversationId?: string,
  ): Promise<{
    success: boolean
    result?: string
    conversationId?: string
    error?: string
  }> {
    const store = this.options.resolveConversationStore?.() ?? null
    if (!store) {
      return { success: false, error: '打开项目后助手才可用' }
    }

    try {
      // 1. 查找或创建目标助手的会话
      const convs = await store.listConversations()
      const targetConvs = convs.filter(c => c.assistantType === params.target)
      let targetConvId: string

      if (targetConvs.length > 0) {
        // 优先复用目标助手的已有会话（取最近活跃会话）
        targetConvId = targetConvs[0].id
      } else {
        // 仅在目标助手完全不存在任何已有会话时，才创建初始新会话
        const uid = randomUUID().slice(0, 8)
        targetConvId = `${params.target}-${uid}`
        const session = await store.open(targetConvId, { create: true })
        if (session) {
          const shortTitle = params.task.trim().slice(0, 18)
          await session.setName(`[委派] ${shortTitle}`, BACKGROUND_CONTEXT)
        }
      }

      if (parentConversationId) {
        this.delegatedChildren.set(parentConversationId, targetConvId)
      }

      const queue = this.getQueue(targetConvId)
      const isQueued = queue.isBusy()
      if (isQueued) {
        logInfo('Agent', 'target assistant is busy, queuing delegated message in mailbox', {
          target: params.target,
          conversationId: targetConvId,
          pendingTasks: queue.pendingCount,
        })
      }

      // 2. 将委派任务推入消息接收队列（FIFO 保证顺序与排队执行，杜绝并发冲突与多开会话）
      return await queue.enqueue(async () => {
        const language = this.options.resolveLanguage(targetConvId)
        const chapterPart = typeof params.chapter_number === 'number'
          ? writingLanguageText(language, `\n目标章节：第 ${params.chapter_number} 章`, `\nTarget Chapter: Chapter ${params.chapter_number}`)
          : ''
        const instructionText = params.instructions || params.context
        const instructionPart = instructionText
          ? writingLanguageText(language, `\n关注重点与指示：\n${instructionText}`, `\nSpecific Instructions & Focus:\n${instructionText}`)
          : ''

        let targetGuidance = ''
        if (params.target === 'review') {
          targetGuidance = writingLanguageText(
            language,
            `\n【重要交付规约】\n1. 请直接调用专属工具读取权威事实（manage_drafts 读取正文，read_blueprint、read_continuity_facts 核验事实）。\n2. 审查结论必须调用 submit_chapter_review 工具落盘生成审稿报告（系统会自动在主编辑区展开全屏审稿看板，供作者交互勾选与一键修稿）。严禁仅在对话框用纯文本输出审查清单而不落盘！\n3. submit_chapter_review 提交完成后，你的文字回复只需提供极简的定性总结（150字以内），引导作者移步主界面的审稿看板查阅详情与勾选，绝不要在对话框中重复罗列清单。`,
            `\n[Crucial Deliverable Contract]\n1. Directly call your dedicated tools (manage_drafts to read prose, read_blueprint and read_continuity_facts to verify facts).\n2. You MUST call the submit_chapter_review tool to persist the review report (the system automatically opens the interactive review dashboard in the main editor area for checkbox confirmation and revision). NEVER reply only with plain text without calling submit_chapter_review!\n3. After calling submit_chapter_review, your text response should only provide a concise qualitative summary (under 150 words) directing the author to the main review report tab, without duplicating the whole checklist in text.`,
          )
        } else if (params.target === 'blueprint') {
          targetGuidance = writingLanguageText(
            language,
            `\n【重要交付规约】\n1. 请调用 read_blueprint、read_continuity_facts、read_architecture 获取前文事实与设定。\n2. 推演确定的细纲必须调用 propose_chapter_blueprint 工具持久化写入项目。\n3. 文字回复保持清晰精炼，侧重场景节拍与冲突设计。`,
            `\n[Crucial Deliverable Contract]\n1. Call read_blueprint, read_continuity_facts, and read_architecture for established facts.\n2. Persist the finalized blueprint using propose_chapter_blueprint.\n3. Keep text response concise and focused on beats and dramatic conflict.`,
          )
        } else {
          targetGuidance = writingLanguageText(
            language,
            `\n【重要交付规约】\n1. 充分使用架构与设定读取工具理解当前事实。\n2. 推演确定的世界观、大纲或人物设定必须调用相应工具（story_architecture、novel_config、manage_characters 等）持久化写入项目。\n3. 文字回复保持清晰精炼。`,
            `\n[Crucial Deliverable Contract]\n1. Utilize architecture and lore tools to understand current facts.\n2. Persist agreed settings, outlines, or characters with appropriate tools (story_architecture, novel_config, manage_characters, etc.).\n3. Keep text response clear and concise.`,
          )
        }

        const input = writingLanguageText(
          language,
          `【来自项目助手的任务委派】\n\n核心任务：\n${params.task}${chapterPart}${instructionPart}\n${targetGuidance}`,
          `[Task Delegated from Project Assistant]\n\nTask:\n${params.task}${chapterPart}${instructionPart}\n${targetGuidance}`,
        )

        // 获取或创建目标助手会话
        const session = await this.getOrCreate(
          targetConvId,
          undefined, // 自动解析规划模型
          undefined,
          undefined,
          undefined,
          params.target,
        )

        // 委派执行强制使用 writing 模式（自动执行领域工具落盘，避免弹窗阻断委派流）
        session.setExecutionMode('writing')
        session.setSystemPrompt(this.options.resolveSystemPrompt(targetConvId, undefined, params.target))
        const tools = buildToolsForAssistantType(params.target, language, this.options.rendererAction)
        await session.setTools(tools)

        // 执行提示词生成并获取结果
        await session.prompt(input)
        const resultText = session.getFullText()

        return {
          success: true,
          result: resultText,
          conversationId: targetConvId,
        }
      }, `delegate:${params.target}`)
    } catch (error) {
      logFailure('Agent', 'delegated task failed', error, { target: params.target })
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    } finally {
      if (parentConversationId) {
        this.delegatedChildren.delete(parentConversationId)
      }
    }
  }

  /**
   * 丢弃一个对话：内存会话与 Pi 会话存档一起删。用户删除会话时才调用，
   * 切书走 `abortAll`（保留存档，下次打开还在）。
   */
  async discard(conversationId: string): Promise<{ success: boolean }> {
    await this.closeSession(conversationId)
    const store = this.options.resolveConversationStore?.() ?? null
    if (store) {
      try {
        await store.delete(conversationId)
      } catch (error) {
        logFailure('Agent', 'failed to delete conversation session', error, { conversationId })
      }
    }
    return { success: true }
  }

  async listConversations(): Promise<{
    conversations: PersistedAgentConversation[]
    activeConversationId: string | null
  }> {
    const store = this.options.resolveConversationStore?.() ?? null
    if (!store) return { conversations: [], activeConversationId: null }
    try {
      const conversations = await store.listConversations()
      const activeConversationId = conversations[0]?.id ?? null
      return { conversations, activeConversationId }
    } catch (error) {
      logFailure('Agent', 'failed to list conversations from store', error)
      return { conversations: [], activeConversationId: null }
    }
  }

  async renameConversation(conversationId: string, title: string): Promise<{ success: boolean }> {
    const store = this.options.resolveConversationStore?.() ?? null
    if (!store) return { success: false }
    try {
      const success = await store.renameConversation(conversationId, title)
      return { success }
    } catch (error) {
      logFailure('Agent', 'failed to rename conversation in store', error, { conversationId })
      return { success: false }
    }
  }

  /** Abort every Agent session and every one-shot stream. Sessions are dropped. */
  abortAll(): void {
    for (const [conversationId, session] of [...this.sessions]) {
      session.abort()
      void this.closeSession(conversationId)
    }
    abortAllPiInFlight()
  }

  /** 关掉内存里的 harness，并让 store 忘掉这个已关闭的会话。 */
  private async closeSession(conversationId: string): Promise<boolean> {
    this.queues.get(conversationId)?.clear()
    this.queues.delete(conversationId)
    const session = this.sessions.get(conversationId)
    const store = this.stores.get(conversationId) ?? null
    this.sessions.delete(conversationId)
    this.stores.delete(conversationId)
    this.runtimeKeys.delete(conversationId)
    if (!session) return true
    const closed = await session.close()
    store?.forget(conversationId)
    return closed
  }

  private async getOrCreate(
    conversationId: string,
    modelId?: string,
    history?: readonly AgentPromptHistoryTurn[],
    skills?: readonly AgentSkillCatalogEntry[],
    requestedThinkingLevel?: AssistantThinkingLevel,
    assistantType: AssistantType = assistantTypeFromConversationId(conversationId),
  ): Promise<AgentSession> {
    const existing = this.sessions.get(conversationId)
    const profile = this.options.resolveModel(modelId, assistantType)
    // 档案被删掉时不让老会话跟着失效：沿用现有运行时，一个会话都没有才报错。
    if (!profile) {
      if (existing) return existing
      throw new AgentTurnRefusal('model-missing', '模型未找到')
    }

    const thinkingLevel = requestedThinkingLevel ?? 'off'
    const runtimeKey = agentRuntimeKey(profile, thinkingLevel)
    if (existing) {
      if (this.runtimeKeys.get(conversationId) === runtimeKey) return existing
      await this.rebuildSession(conversationId, existing)
    }

    // 助手只在项目内工作：没有项目就没有存档，这一轮直接拒绝，不做内存兜底。
    const store = this.options.resolveConversationStore?.() ?? null
    if (!store) {
      throw new AgentTurnRefusal('no-project', '打开项目后助手才可用')
    }

    // 与工作流同一条生成参数策略：架构/蓝图助手走 planning，审稿助手走 review，通用助手走 general。
    const sampling = resolveGenerationParameters(profile, {
      creativeStrategy: this.options.resolveCreativeStrategy?.(),
      reasoningStage: assistantType === 'review'
        ? 'review'
        : assistantType === 'architect' || assistantType === 'blueprint'
          ? 'planning'
          : 'general',
    })
    const { models, model } = createPiModels(profile, {
      modelSamplingParams: toPiModelSamplingParams(sampling),
    })
    const language = this.options.resolveLanguage(conversationId)
    const harnessSession = await store.open(conversationId, { create: true })
    if (!harnessSession) {
      throw new AgentTurnRefusal('session-store-unavailable', '会话存档不可用')
    }

    // 架构/蓝图/审稿助手不挂载底层 bash/write/edit 沙箱工具：
    // 审稿必须只读，才能保证审查与创作互不污染。
    const executionEnv = assistantType === 'architect' || assistantType === 'blueprint' || assistantType === 'review'
      ? null
      : (this.options.resolveToolEnvironment?.() ?? null)
    const tools = buildToolsForAssistantType(assistantType, language, this.options.rendererAction, {
      skills,
      skillRoots: this.options.resolveSkillRoots?.() ?? [],
      delegateHandler: this.createDelegateHandler(conversationId),
    })

    const session = await AgentSession.create({
      models,
      model,
      modelIdentity: {
        modelId: profile.id,
        modelName: profile.modelName,
      },
      systemPrompt: this.options.resolveSystemPrompt(conversationId, skills, assistantType),
      tools,
      confirmationToolNames: confirmationToolNames(),
      ...(executionEnv ? { executionEnv } : {}),
      sampling,
      thinkingLevel,
      assistantType,
      // 用户没显式选等级时，产品侧的思考预算补丁照旧生效。
      applySamplingThinking: requestedThinkingLevel === undefined,
      language,
      emit: (event) => this.options.emit(conversationId, event),
      session: harnessSession,
      conversationId,
    })
    logInfo('Agent', 'agent session opened', {
      conversationId,
      durable: true,
      modelName: profile.modelName,
      thinkingLevel,
    })

    // Pi 会话为空（首次运行、旧数据、文件被删）才用渲染层发来的纯文本历史播种。
    if (history && history.length > 0 && await session.transcriptLength() === 0) {
      await session.seedHistory(history)
    }

    this.sessions.set(conversationId, session)
    this.stores.set(conversationId, store)
    this.runtimeKeys.set(conversationId, runtimeKey)
    registerPiInFlight(`agent:${conversationId}`, session)
    return session
  }

  /**
   * 换模型 / 换思考等级就地重建会话。
   *
   * 这两项都是 harness 的创建期配置（`Models` 集合与请求选项都绑在创建时），
   * 重建比原地改更不容易出错：对话正文在 store 的存档里，重开的会话照样带着
   * 完整历史，只是上下文缓存会重新建立。
   */
  private async rebuildSession(conversationId: string, existing: AgentSession): Promise<void> {
    if (existing.isBusy()) {
      throw new AgentTurnRefusal('session-busy', '这一轮还在生成，结束后再切换模型或思考等级')
    }
    logInfo('Agent', 'agent runtime changed, rebuilding session', {
      conversationId,
      previous: this.runtimeKeys.get(conversationId),
    })
    const closed = await this.closeSession(conversationId)
    if (!closed) throw new AgentTurnRefusal('switch-failed', '会话未能安全关闭，稍后再试')
  }
}
