import { workflowResourceKey, type WorkflowDefinition, type WorkflowContext, type StepCallbacks } from '../../stores/workflow-store'
import { useLocaleStore } from '../../stores/locale-store'
import { useProjectStore } from '../../stores/project-store'
import type { NovelConfig } from '../../shared/ipc-channels'
import type { ProjectSessionContext } from '../../shared/ipc-channels'
import {
  projectSessionContextFromProject,
  sameProjectPathKey,
  sameProjectSessionContext,
} from '../../shared/project-session-context'
import { randomUUID } from '../../utils/id'
import { requireWorkflowProjectSession } from './workflow-project-session'
import type { ArchitectureProjectSnapshot } from './commands/architecture.command'
import { localize } from '../../i18n/core'
import type { Locale } from '../../i18n/types'

// ==========================================
// 1. 类型定义
// ==========================================

export interface PartialArchData {
  premise_result?: string
  character_dynamics_result?: string
  character_state_result?: string
  world_building_result?: string
  synopsis_result?: string
  /** 情节大纲在上一次生成中被输出长度中断；synopsis_result 为已完成部分。 */
  synopsis_incomplete?: boolean
}

export interface ArchitectureWorkflowParams {
  /** 启动工作流时所属的项目路径；后续所有步骤均绑定此项目 */
  projectPath: string
  /** UI 在异步确认前冻结的完整项目会话。 */
  projectSession: ProjectSessionContext
  selectedSteps?: Array<'premise' | 'characters' | 'worldbuilding' | 'synopsis'>
  /** 每步的补充指导（如 { premise: "多强调金手指的限制" }） */
  stepGuidance?: Record<string, string>
  /** 情节大纲本次生成范围 [from..to]（缺省 = 第 1 章到全书）。 */
  synopsisRange?: { from: number; to: number } | null
  /** 从上次输出长度中断的检查点续写情节大纲（工作流只包含 synopsis 一步）。 */
  resumeSynopsis?: boolean
}

export interface ConfigGenerationWorkflowParams {
  projectPath: string
  /** UI 在异步确认前冻结的完整项目会话。 */
  projectSession: ProjectSessionContext
  idea: string
  totalChapters: number
  wordsPerChapter: number
  onGenerated: (config: Partial<NovelConfig>) => void
}

// ==========================================
// 2. 工作流定义
// ==========================================

export function createArchitectureWorkflow(
  params: ArchitectureWorkflowParams,
  uiLocale: Locale = useLocaleStore.getState().locale,
): WorkflowDefinition {
  const text = (zhCNText: string, enUSText: string) => localize(uiLocale, zhCNText, enUSText)
  const resumingSynopsis = params.resumeSynopsis === true
  const sel = resumingSynopsis
    ? ['synopsis' as const]
    : params.selectedSteps ?? ['premise', 'worldbuilding', 'synopsis', 'characters']
  const expectedProjectPath = params.projectPath
  const project = useProjectStore.getState().currentProject
  const currentProjectSession = projectSessionContextFromProject(project)
  if (
    !project
    || !currentProjectSession
    || !sameProjectPathKey(project.path, expectedProjectPath)
    || !sameProjectSessionContext(params.projectSession, currentProjectSession)
  ) {
    throw new Error(text('当前项目已切换，无法启动架构生成', 'The project changed, so architecture generation cannot start.'))
  }
  // 工厂在捕获配置快照的同一时刻绑定 lease，防止同路径重新打开后复用旧快照。
  const projectSession = Object.freeze({ ...params.projectSession })
  const projectSnapshot: ArchitectureProjectSnapshot = Object.freeze({
    expectedProjectPath,
    novelConfig: Object.freeze({ ...project.novelConfig }),
  })
  const stepDesc = (key: string, zhCNDesc: string, enUSDesc: string) => sel.includes(key as never)
    ? text(zhCNDesc, enUSDesc)
    : text('（跳过，保留已有内容）', '(Skipped; existing content is retained)')
  // 闭包捕获逐步指导，executor 中注入到 context.data
  const guidance = params.stepGuidance || {}

  const allSteps = [
    {
      name: text('故事前提', 'Story premise'),
      key: 'premise',
      description: stepDesc('premise', '提炼故事前提与核心卖点', 'Refine the story premise and its core appeal'),
      executor: async (step: unknown, context: WorkflowContext, callbacks: StepCallbacks) => {
        context.data.stepGuidance = guidance
        const { GenerateCoreSeedCommand } = await import('./commands/architecture.command')
        return new GenerateCoreSeedCommand(projectSnapshot).execute({ step, context, callbacks })
      },
    },
    {
      name: text('环境', 'World building'),
      key: 'worldbuilding',
      description: stepDesc('worldbuilding', '构建自带冲突引擎的世界观矩阵', 'Build a world matrix with its own conflict engine'),
      executor: async (step: unknown, context: WorkflowContext, callbacks: StepCallbacks) => {
        context.data.stepGuidance = guidance
        const { GenerateWorldBuildingCommand } = await import('./commands/architecture.command')
        return new GenerateWorldBuildingCommand(projectSnapshot).execute({ step, context, callbacks })
      },
    },
    {
      name: text('情节', 'Plot outline'),
      key: 'synopsis',
      description: resumingSynopsis
        ? text('从上次中断点继续生成情节', 'Resume the plot from the interrupted point')
        : stepDesc('synopsis', '整合所有碎片，按选定结构模式生成情节', 'Integrate all inputs into a plot using the selected structure'),
      executor: async (step: unknown, context: WorkflowContext, callbacks: StepCallbacks) => {
        context.data.stepGuidance = guidance
        const { GeneratePlotArchitectureCommand } = await import('./commands/architecture.command')
        return new GeneratePlotArchitectureCommand(sel, projectSnapshot, undefined, {
          resumeSynopsis: params.resumeSynopsis,
          synopsisRange: params.synopsisRange ?? null,
        }).execute({ step, context, callbacks })
      },
    },
    {
      name: text('人物', 'Character dynamics'),
      key: 'characters',
      description: stepDesc('characters', '构建核心角色关系网与角色弧光', 'Build core character relationships and arcs'),
      executor: async (step: unknown, context: WorkflowContext, callbacks: StepCallbacks) => {
        context.data.stepGuidance = guidance
        const { GenerateCharactersCommand } = await import('./commands/architecture.command')
        return new GenerateCharactersCommand(projectSnapshot).execute({ step, context, callbacks })
      },
    },
  ]

  const finalSteps = allSteps.filter(s => sel.includes(s.key as never))

  return {
    type: 'architecture_generation',
    title: resumingSynopsis
      ? text('继续生成情节大纲（断点续写）', 'Continue plot outline (resume)')
      : text('生成故事架构', 'Generate story architecture'),
    projectPath: expectedProjectPath,
    projectSession,
    uiLocale,
    resourceKeys: [
      workflowResourceKey('architecture'),
      ...(sel.includes('characters') ? [workflowResourceKey('character-roster')] : []),
    ],
    readResourceKeys: [workflowResourceKey('novel-config')],
    steps: finalSteps,
    onComplete: { mode: 'silent', message: text('故事架构已生成完成！前往侧边栏「故事架构」查看', 'Story architecture is ready. Open Story Architecture from the sidebar.') },
  }
}

export function createConfigGenerationWorkflow(params: ConfigGenerationWorkflowParams): WorkflowDefinition {
  const text = useLocaleStore.getState().text
  const project = useProjectStore.getState().currentProject
  const currentProjectSession = projectSessionContextFromProject(project)
  if (
    !project
    || !currentProjectSession
    || !sameProjectPathKey(project.path, params.projectPath)
    || !sameProjectSessionContext(params.projectSession, currentProjectSession)
  ) {
    throw new Error(text('当前项目已切换，无法启动配置生成', 'The project changed, so configuration generation cannot start.'))
  }
  const projectSession = Object.freeze({ ...params.projectSession })
  return {
    type: 'config_generation',
    title: text('AI 生成小说配置', 'Generate novel configuration with AI'),
    projectPath: params.projectPath,
    projectSession,
    resourceKeys: [workflowResourceKey('novel-config')],
    steps: [
      {
        name: text('智能分析并填充配置', 'Analyze and fill the configuration'),
        description: text(
          `根据创作脑洞生成小说配置（全书规划约 ${params.totalChapters} 章）`,
          `Generate a novel configuration from the idea (about ${params.totalChapters} chapters total)`,
        ),
        executor: async (step, context, callbacks) => {
          const { GenerateConfigCommand } = await import('./commands/architecture.command')
          const cmd = new GenerateConfigCommand(
            params.idea,
            params.totalChapters,
            params.wordsPerChapter,
            params.onGenerated,
          )
          return cmd.execute({ step, context, callbacks })
        },
      },
    ],
    onComplete: { mode: 'silent', message: text('小说配置已自动生成完毕，请查阅确认。', 'Novel configuration is ready. Please review it.') },
  }
}

// ==========================================
// 3. 工具与指导文本（getPlotStructureGuide / getNarrativePOVLabel 已拆至
//    architecture-prompt-guides.ts，命令层直接消费叶子模块）
// ==========================================

/**
 * 旧角色名单迁移的显式、安全入口。它会根据持久化状态执行“旧 Markdown
 * 迁移”为结构化名单，或“已有角色卡采用”为只读投影；正常角色架构不会
 * 启动 Markdown 提取。唯一写路径是 RepairLegacyCharacterRosterCommand 的
 * 结构化 roster commit。
 */
export async function migrateLegacyCharacterRoster(projectPath: string): Promise<void> {
  const text = useLocaleStore.getState().text
  const project = useProjectStore.getState().currentProject
  const projectSession = projectSessionContextFromProject(project)
  if (!project || !projectSession || !sameProjectPathKey(project.path, projectPath)) {
    throw new Error(text('当前项目已切换，请在原项目中重试', 'The project changed. Return to the original project and try again.'))
  }
  if (!sameProjectSessionContext(
    projectSession,
    projectSessionContextFromProject(useProjectStore.getState().currentProject),
  )) throw new Error(text('当前项目已切换，请在原项目中重试', 'The project changed. Return to the original project and try again.'))

  const { useWorkflowStore } = await import('../../stores/workflow-store')
  const runId = randomUUID()
  const completedRunId = await useWorkflowStore.getState().startWorkflow({
    runId,
    type: 'post_process',
    title: text('修复：旧角色名单', 'Repair: legacy character roster'),
    projectPath,
    projectSession,
    resourceKeys: [workflowResourceKey('character-roster')],
    steps: [{
      name: text('安全修复旧角色图谱', 'Safely repair the legacy character graph'),
      description: text(
        '只将保留的旧图谱原文转换为结构化角色名单；失败时不改动任何角色数据',
        'Convert preserved legacy graph evidence into a structured roster; failures leave all character data unchanged.',
      ),
      executor: async (_step, context, callbacks) => {
        const { RepairLegacyCharacterRosterCommand } = await import('./commands/legacy-character-roster-repair.command')
        const currentProject = useProjectStore.getState().currentProject
        const genre = sameProjectSessionContext(
          requireWorkflowProjectSession(context),
          projectSessionContextFromProject(currentProject),
        ) ? currentProject?.novelConfig.genre ?? '' : ''
        return new RepairLegacyCharacterRosterCommand({
          expectedProjectPath: projectPath,
          genre,
        }).execute({ step: _step, context, callbacks })
      },
    }],
  })
  const completedRun = useWorkflowStore.getState().history.find(run => run.id === completedRunId)
  if (!completedRun || completedRun.status !== 'completed') {
    throw new Error(completedRun?.error || text(
      '旧角色图谱修复未完成；原始图谱和已有角色卡均未被覆盖。',
      'Legacy character-graph repair did not complete; the original graph and existing cards were not overwritten.',
    ))
  }
}
