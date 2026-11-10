import { BaseWorkflowCommand, type CommandExecuteParams, type WorkflowGenerationRuntimeDependencies } from './base-command'
import { useProjectStore } from '../../../stores/project-store'
import {
  projectSessionContextFromProject,
  sameProjectSessionContext,
} from '../../../shared/project-session-context'
import {
  requireWorkflowProjectSession,
  workflowUiText,
  workflowWritingLanguage,
} from '../workflow-project-session'
import { localizeNovelConfigFacts } from '../../../shared/novel-config-localization'
import { promptLanguageText } from '../../prompt-language'
import { isGoldenFingerEnabled } from '../../../shared/novel-config-generation'
import {
  normalizeWorldMapArtifact,
  type WorldMapData,
} from '../../../shared/world-map'
import type { NovelConfig } from '../../../shared/ipc-channels'
import type { WritingLanguage } from '../../../shared/writing-language'
import { GenerationAttemptError } from '../../generation/generation-harness'
import { BoundedCompletionFailure } from '../bounded-completion'

/**
 * 世界地图生成命令。
 *
 * 模型通过 submit_world_map 工具交付世界图参数；命令只做领域校验和
 * 归一化，不写文件。应用/校对由页面在预览确认后通过项目存储通道提交。
 */
export class GenerateWorldMapCommand extends BaseWorkflowCommand<WorldMapData> {
  constructor(generationDependencies?: WorkflowGenerationRuntimeDependencies) {
    super(generationDependencies)
  }

  async execute(params: CommandExecuteParams): Promise<WorldMapData> {
    return this.executeWithGenerationRuntime(params, () => this.executeWithinGeneration(params))
  }

  private async executeWithinGeneration({ context, callbacks }: CommandExecuteParams): Promise<WorldMapData> {
    const projectSession = requireWorkflowProjectSession(context)
    const project = useProjectStore.getState().currentProject
    if (
      !project
      || !sameProjectSessionContext(projectSession, projectSessionContextFromProject(project))
    ) {
      throw new Error(workflowUiText(context, '当前项目已切换，世界地图生成已停止', 'The current project changed, so world-map generation stopped.'))
    }

    const writingLanguage = workflowWritingLanguage(context)
    const config = project.novelConfig
    const facts = localizeNovelConfigFacts(config, writingLanguage)
    const systemPrompt = this.buildSystemPrompt(writingLanguage)
    const userPrompt = this.buildUserPrompt(project.name, config, facts, writingLanguage)
    const text = (zhCNText: string, enUSText: string) => workflowUiText(context, zhCNText, enUSText)

    callbacks.log(text('正在读取作品设定与世界观...', 'Reading the project settings and worldbuilding...'))
    callbacks.setProgress(8)

    let artifact: Record<string, unknown> | undefined
    let validationErrors: string[] = []
    let attemptPrompt = userPrompt
    for (let attempt = 0; attempt < 2; attempt += 1) {
      this.assertNotCancelled(context)
      callbacks.log(attempt === 0
        ? text('正在推演大陆、区域与势力关系...', 'Deducing continents, regions, and faction relations...')
        : text('世界图参数未通过校验，正在按错误清单重试...', 'The world-map artifact failed validation; retrying with the issue list...'))
      callbacks.setProgress(attempt === 0 ? 24 : 56)

      let completion
      try {
        completion = await this.callLLMResult(
          attemptPrompt,
          systemPrompt,
          callbacks,
          {
            purpose: 'generate-world-map',
            reasoningStage: 'planning',
            submitTool: 'submit_world_map',
          },
          context,
        )
      } catch (error) {
        if (context.cancelled) this.assertNotCancelled(context)
        if (error instanceof BoundedCompletionFailure) throw error
        if (error instanceof GenerationAttemptError) {
          throw new GenerationAttemptError(
            error.code === 'CANCELLED' ? error.code : 'PROVIDER_REQUEST_FAILED',
            text('世界地图生成失败，请重试。', 'World-map generation failed. Please try again.'),
            error.receipt,
          )
        }
        throw new Error(text('世界地图生成失败，请重试。', 'World-map generation failed. Please try again.'))
      }

      this.assertNotCancelled(context)
      if (completion.finishReason !== 'stop') {
        throw new Error(text(
          '世界地图生成未完整结束，结果未应用。',
          'World-map generation did not finish cleanly, so nothing was applied.',
        ))
      }
      artifact = completion.artifact
      if (!artifact) {
        validationErrors = [text('模型没有调用 submit_world_map 工具', 'The model did not call the submit_world_map tool')]
      } else {
        callbacks.log(text('正在校验区域、势力、等级与关系...', 'Validating regions, factions, tiers, and relations...'))
        callbacks.setProgress(78)
        const normalized = normalizeWorldMapArtifact(artifact)
        if (normalized.ok) {
          if (!sameProjectSessionContext(
            projectSession,
            projectSessionContextFromProject(useProjectStore.getState().currentProject),
          )) {
            throw new Error(text('当前项目已切换，世界地图结果未应用', 'The current project changed, so the world map was not applied.'))
          }
          callbacks.setProgress(92)
          callbacks.log(text('世界图已生成，等待预览确认。', 'World map generated and awaiting preview confirmation.'))
          return normalized.data
        }
        validationErrors = normalized.errors
        callbacks.log(text(
          `世界图参数未通过校验：${validationErrors.slice(0, 6).join('；')}`,
          `World-map artifact failed validation: ${validationErrors.slice(0, 6).join('; ')}`,
        ))
      }

      attemptPrompt = `${userPrompt}\n\n${promptLanguageText(
        writingLanguage,
        `上一轮 submit_world_map 的参数未通过校验：\n${validationErrors.slice(0, 12).join('\n')}\n请重新调用 submit_world_map，只修正这些问题；不要输出解释。`,
        `The previous submit_world_map arguments failed validation:\n${validationErrors.slice(0, 12).join('\n')}\nCall submit_world_map again and fix only these issues. Do not output explanations.`,
      )}`
    }

    throw new Error(workflowUiText(
      context,
      `世界地图参数未通过校验：${validationErrors.slice(0, 6).join('；')}`,
      `World-map artifact failed validation: ${validationErrors.slice(0, 6).join('; ')}`,
    ))
  }

  private buildSystemPrompt(writingLanguage: WritingLanguage): string {
    return promptLanguageText(
      writingLanguage,
      [
        '你是长篇小说世界观地图的绘制者。',
        '你的任务不是写设定散文，而是给出一张能被界面画出来的政治地理图。',
        '用户提供的作品设定是唯一事实来源；可以补全细节，但不得改变已有类型、金手指和核心矛盾。',
        '要求：',
        '- 区域必须有方位、地形、相邻关系和实际控制势力，形成可读的地理格局。',
        '- 势力等级是政治/组织实力，不是修行境界；两套阶梯必须分开。',
        '- 至少制造两个核心冲突：资源争夺、飞升名额、旧仇或信仰冲突。',
        '- 名称使用与设定一致的中文；不使用 emoji；不写现代科技词。',
        '- 完成后必须调用 submit_world_map 工具一次，把世界图作为工具参数提交。',
        '- 不要在正文里输出 JSON、Markdown 代码块或解释。',
      ].join('\n'),
      [
        'You are a cartographer of long-form fiction worlds.',
        'Your task is not to write setting prose but to produce a political geography the app can draw.',
        'The project settings are the only source of truth; you may fill gaps but must not change the established genre, golden finger, or central conflict.',
        'Requirements:',
        '- Every region needs a direction, terrain, adjacency, and a controlling faction, forming a readable geography.',
        '- Faction tiers are political/organizational power, not cultivation realms; keep the two ladders separate.',
        '- Create at least two core conflicts: resources, ascension quotas, old feuds, or faith.',
        '- Use names consistent with the project language; no emoji and no modern technology terms.',
        '- When done, call the submit_world_map tool exactly once with the world map as tool arguments.',
        '- Do not output JSON, Markdown code fences, or explanations in visible text.',
      ].join('\n'),
    )
  }

  private buildUserPrompt(
    projectName: string,
    config: NovelConfig,
    facts: ReturnType<typeof localizeNovelConfigFacts>,
    writingLanguage: WritingLanguage,
  ): string {
    const line = (zhLabel: string, enLabel: string, value: string | number) => (
      `- ${promptLanguageText(writingLanguage, zhLabel, enLabel)}: ${value}`
    )
    const parts: string[] = []
    parts.push(promptLanguageText(writingLanguage, '作品名', 'Work title') + `: ${projectName}`)
    if (facts.genre) parts.push(line('类型', 'Genre', facts.genre))
    if (config.subGenre) parts.push(line('细分类型', 'Subgenre', config.subGenre))
    if (facts.targetAudience) parts.push(line('目标受众', 'Target audience', facts.targetAudience))
    if (config.coreOutline?.trim()) parts.push(line('核心大纲', 'Core outline', config.coreOutline.trim()))
    if (config.worldSetting?.trim()) parts.push(line('世界观', 'Worldbuilding', config.worldSetting.trim()))
    if (isGoldenFingerEnabled(config) && config.goldenFinger?.trim()) {
      parts.push(line('金手指', 'Golden finger', config.goldenFinger.trim()))
    }
    if (config.protagonistProfile?.trim()) parts.push(line('主角', 'Protagonist', config.protagonistProfile.trim()))
    if (config.globalGuidance?.trim()) parts.push(line('全局写作要求', 'Global guidance', config.globalGuidance.trim()))

    const scale = promptLanguageText(
      writingLanguage,
      [
        '',
        '地图规模：',
        '- 2–4 个大陆，4–9 个区域；每个区域标注 center/north/east/south/west/等方位。',
        '- 6–12 个势力，覆盖至少 3 个不同势力等级，并落在具体区域。',
        '- 至少 3 条核心关系（同盟/敌对/中立），写明原因。',
        '- 势力等级 3–6 档；修行境界 4–8 阶。',
        '',
        '请基于以上设定，调用 submit_world_map 工具提交完整世界图。',
      ].join('\n'),
      [
        '',
        'Map scale:',
        '- 2–4 continents and 4–9 regions; label each region with center/north/east/south/west/etc.',
        '- 6–12 factions across at least 3 different tiers, each placed in a region.',
        '- At least 3 core relations (ally/enemy/neutral) with reasons.',
        '- 3–6 faction tiers and 4–8 cultivation realms.',
        '',
        'Build the complete world map from these settings and submit it via submit_world_map.',
      ].join('\n'),
    )
    return `${parts.join('\n')}\n${scale}`
  }
}
