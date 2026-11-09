import { BaseWorkflowCommand, CommandExecuteParams, type WorkflowGenerationRuntimeDependencies } from './base-command'
import { useProjectStore } from '../../../stores/project-store'
import type { NovelConfig } from '../../../shared/ipc-channels'
import {
  projectSessionContextFromProject,
  sameProjectSessionContext,
} from '../../../shared/project-session-context'
import { requireWorkflowProjectSession } from '../workflow-project-session'
import { workflowUiText, workflowWritingLanguage } from '../workflow-project-session'
import { composePromptSystemRole, resolvePromptTemplate, renderPrompt } from '../../prompt-templates'
import { promptLanguageText } from '../../prompt-language'
import { localizeNovelConfigFacts } from '../../../shared/novel-config-localization'
import {
  generationFieldLabels,
  generationFieldRequirements,
  isGenerationFieldEnabled,
  previousGenerationSteps,
  type GeneratableField,
} from '../../../shared/novel-config-generation'
import { internalPrompt } from '../../../prompts/internal/load'
import type { WritingLanguage } from '../../../shared/writing-language'
import { GenerationAttemptError, PromptBudgetExceededError } from '../../generation/generation-harness'
import { BoundedCompletionFailure } from '../bounded-completion'
import {
  GENERATED_GLOBAL_GUIDANCE_MAX_CHARS,
  GENERATED_GLOBAL_GUIDANCE_MAX_RULES,
  GENERATED_GLOBAL_GUIDANCE_MIN_RULES,
  isGeneratedGlobalGuidanceValid,
  preserveAuthorText,
} from '../novel-config-expansion'

/**
 * 单字段 AI 生成命令
 * 根据已有的 NovelConfig 上下文，只生成指定字段的内容
 */
export class GenerateFieldCommand extends BaseWorkflowCommand<string> {
  constructor(
    private fieldKey: GeneratableField,
    generationDependencies?: WorkflowGenerationRuntimeDependencies,
  ) {
    super(generationDependencies)
  }

  async execute(params: CommandExecuteParams): Promise<string> {
    return this.executeWithGenerationRuntime('text', params, () => this.executeWithinGeneration(params))
  }

  private async executeWithinGeneration({ context, callbacks }: CommandExecuteParams): Promise<string> {
    const projectSession = requireWorkflowProjectSession(context)
    const project = useProjectStore.getState().currentProject
    if (
      !project
      || !sameProjectSessionContext(
        projectSession,
        projectSessionContextFromProject(project),
      )
    ) {
      throw new Error(workflowUiText(
        context,
        '当前项目已切换，字段生成已停止',
        'The current project changed, so field generation stopped.',
      ))
    }

    const config = project.novelConfig
    if (!isGenerationFieldEnabled(this.fieldKey, config)) {
      throw new Error(workflowUiText(
        context,
        '该字段在本项目中已设为不需要，已跳过生成',
        'This field is marked as not needed for this project, so generation was skipped.',
      ))
    }
    const writingLanguage = workflowWritingLanguage(context)
    const facts = localizeNovelConfigFacts(config, writingLanguage)
    const labelPair = generationFieldLabels(this.fieldKey)
    const label = workflowUiText(context, labelPair[0], labelPair[1])

    callbacks.log(workflowUiText(context, `正在为「${label}」生成内容...`, `Generating “${label}”...`))

    // 阶梯式上下文：标题 + 基础信息 + 本字段之前的已完成字段
    const contextSummary = this.buildContext(
      config,
      project.name,
      writingLanguage,
      this.fieldKey,
      facts,
    )
    // 构建针对性 prompt
    const template = await resolvePromptTemplate(
      'generate_novel_config_field',
      projectSession,
      writingLanguage,
    )
    if (!template) throw new Error(workflowUiText(context, '未找到字段生成提示词', 'Field-generation prompt is unavailable'))
    const prompt = renderPrompt(template, {
      existing_config: contextSummary,
      field_label: promptLanguageText(writingLanguage, labelPair[0], labelPair[1]),
      field_requirements: generationFieldRequirements(this.fieldKey, {
        genre: facts.genre,
        targetAudience: facts.targetAudience,
      }, writingLanguage),
    }, writingLanguage)
    const systemPrompt = composePromptSystemRole(template, writingLanguage)

    const requestFieldCompletion = async (requestPrompt: string, purpose: string): Promise<string> => {
      try {
        return await this.callLLM(
          requestPrompt,
          systemPrompt,
          callbacks,
          { purpose, reasoningStage: 'planning', submitTool: 'submit_field' },
          context,
        )
      } catch (error) {
        if (context.cancelled) this.assertNotCancelled(context)
        if (error instanceof BoundedCompletionFailure || error instanceof PromptBudgetExceededError) {
          throw error
        }
        const safeMessage = workflowUiText(
          context,
          '字段生成失败，请重试。',
          'Field generation failed. Please try again.',
        )
        if (error instanceof GenerationAttemptError) {
          const code = error.code === 'CANCELLED'
            || error.code === 'DEADLINE_EXHAUSTED'
            || error.code === 'PROVIDER_REQUEST_FAILED'
            ? error.code
            : 'PROVIDER_REQUEST_FAILED'
          throw new GenerationAttemptError(code, safeMessage, error.receipt)
        }
        throw new Error(safeMessage)
      }
    }
    let result = await requestFieldCompletion(prompt, `generate-field-${this.fieldKey}`)
    this.assertNotCancelled(context)
    let cleanResult = result.trim()

    if (!cleanResult && this.fieldKey !== 'globalGuidance') {
      callbacks.log(workflowUiText(context, `「${label}」生成返回空结果`, `Generation returned no content for “${label}”.`))
      return ''
    }
    if (this.fieldKey === 'globalGuidance' && !isGeneratedGlobalGuidanceValid(cleanResult)) {
      callbacks.log(workflowUiText(
        context,
        '首轮全局写作要求不符合 4–8 条简短规则合同，正在执行唯一一次字段级完整替代。',
        'The first global-guidance candidate did not satisfy the 4–8 short-rule contract; requesting the single field-level replacement.',
      ))
      result = await requestFieldCompletion(
        `${prompt}\n\n${internalPrompt('global_guidance_correction_contract', writingLanguage, {
            min_rules: GENERATED_GLOBAL_GUIDANCE_MIN_RULES,
            max_rules: GENERATED_GLOBAL_GUIDANCE_MAX_RULES,
            max_chars: GENERATED_GLOBAL_GUIDANCE_MAX_CHARS,
          })}`,
        'generate-field-globalGuidance-replacement',
      )
      this.assertNotCancelled(context)
      cleanResult = result.trim()
      if (!isGeneratedGlobalGuidanceValid(cleanResult)) {
        throw new Error(workflowUiText(
          context,
          `全局写作要求仍不符合 ${GENERATED_GLOBAL_GUIDANCE_MIN_RULES}–${GENERATED_GLOBAL_GUIDANCE_MAX_RULES} 条且不超过 ${GENERATED_GLOBAL_GUIDANCE_MAX_CHARS} 字符的合同，结果未保存。`,
          `The global writing guidance still does not satisfy the ${GENERATED_GLOBAL_GUIDANCE_MIN_RULES}–${GENERATED_GLOBAL_GUIDANCE_MAX_RULES}-rule, ${GENERATED_GLOBAL_GUIDANCE_MAX_CHARS}-character contract, so it was not saved.`,
        ))
      }
    }

    // LLM 返回后再次核对冻结项目，禁止把旧项目上下文写入后来切换的项目。
    let projectState = useProjectStore.getState()
    if (!sameProjectSessionContext(
      projectSession,
      projectSessionContextFromProject(projectState.currentProject),
    )) {
      throw new Error(workflowUiText(
        context,
        '当前项目已切换，字段生成结果未保存',
        'The current project changed, so the generated field was not saved.',
      ))
    }

    // updateNovelConfig 是同步操作，此处检查与修改之间不会让出事件循环。
    this.assertNotCancelled(context)
    const { updateNovelConfig, saveProject } = projectState
    const expandedResult = preserveAuthorText(config[this.fieldKey], cleanResult)
    updateNovelConfig({ [this.fieldKey]: expandedResult }, projectSession)
    if (!sameProjectSessionContext(
      projectSession,
      projectSessionContextFromProject(useProjectStore.getState().currentProject),
    )) {
      throw new Error(workflowUiText(
        context,
        '当前项目已切换，字段生成结果未保存',
        'The current project changed, so the generated field was not saved.',
      ))
    }
    this.assertNotCancelled(context)
    const saved = await saveProject(projectSession)
    this.assertNotCancelled(context)
    projectState = useProjectStore.getState()
    if (!saved) {
      throw new Error(workflowUiText(
        context,
        '字段生成结果保存失败',
        'The generated field could not be saved.',
      ))
    }
    if (!sameProjectSessionContext(
      projectSession,
      projectSessionContextFromProject(projectState.currentProject),
    )) {
      throw new Error(workflowUiText(
        context,
        '当前项目已切换，字段生成已停止',
        'The current project changed, so field generation stopped.',
      ))
    }
    callbacks.log(workflowUiText(context, `「${label}」已生成并保存`, `“${label}” was generated and saved.`))

    return expandedResult
  }

  /** 构建阶梯式上下文摘要：标题 + 基础信息 + 本字段之前的已完成字段 */
  private buildContext(
    config: NovelConfig,
    projectName: string | undefined,
    writingLanguage: WritingLanguage,
    targetField: GeneratableField,
    facts: ReturnType<typeof localizeNovelConfigFacts>,
  ): string {
    const parts: string[] = []
    const line = (zhLabel: string, enLabel: string, value: string | number) => (
      `- ${promptLanguageText(writingLanguage, zhLabel, enLabel)}: ${value}`
    )
    const title = projectName?.trim()
    if (title) parts.push(line('作品名', 'Work title', title))
    if (facts.genre) parts.push(line('类型', 'Genre', facts.genre))
    if (config.subGenre) parts.push(line('细分类型', 'Subgenre', config.subGenre))
    if (facts.targetAudience) parts.push(line('目标受众', 'Target audience', facts.targetAudience))
    if (facts.plotStructure) parts.push(line('故事结构', 'Story structure', facts.plotStructure))
    if (facts.narrativePOV) parts.push(line('叙事视角', 'Point of view', facts.narrativePOV))
    if (config.totalChapters) parts.push(line('总章数', 'Total chapters', config.totalChapters))
    if (config.wordsPerChapter) parts.push(line('每章目标字数', 'Target words per chapter', config.wordsPerChapter))

    for (const step of previousGenerationSteps(targetField, config)) {
      const value = config[step.key as GeneratableField]
      if (typeof value !== 'string' || !value.trim()) continue
      parts.push(line(step.labels[0], step.labels[1], value.trim()))
    }

    return parts.length > 0
      ? parts.join('\n')
      : promptLanguageText(writingLanguage, '（尚未填写任何配置）', '(No configuration has been provided yet.)')
  }
}
