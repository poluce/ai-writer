import type { PromptTemplate } from '../prompt-templates'
import {
  appendRequiredPromptContext,
  composePromptSystemRole,
  getBuiltinPromptTemplate,
  pruneEmptyOptionalPromptSections,
} from '../prompt-templates'
import type { WritingLanguage } from '../../shared/writing-language'

/**
 * 基础抽象 Prompt 建造者
 * 用于安全地拼装 LLM 生成所需的不可变上下文片段，避免漏传变量。
 */
export class BasePromptBuilder {
  protected template: PromptTemplate;
  protected variables: Record<string, string> = {};

  constructor(template: PromptTemplate, private readonly writingLanguage: WritingLanguage) {
    this.template = template;
  }

  /** 获取模板定义的 system role（LLM system message 角色定位） */
  public getSystemRole(): string {
    return composePromptSystemRole(this.template, this.writingLanguage)
  }

  /** 打包输出最终经过所有合法性替换的字符串 */
  public build(): string {
    let result = this.template.content
    for (const [key, value] of Object.entries(this.variables)) {
      // 使用 replaceAll 避免正则注入风险，安全替换所有匹配项
      const safeValue = value || ''
      result = result.replaceAll(`{{${key}}}`, safeValue)
    }

    if (this.template.taskGuidance?.trim()) {
      let taskGuidance = this.template.taskGuidance
      for (const [key, value] of Object.entries(this.variables)) {
        taskGuidance = taskGuidance.replaceAll(`{{${key}}}`, value || '')
      }
      const heading = this.writingLanguage === 'en-US'
        ? '[User-defined creative guidance]'
        : '【用户自定义创作指导】'
      result += `\n\n${heading}\n${taskGuidance.trim()}`
    }

    // 自动追加 systemSuffix（始终从内置模板获取，与 renderPrompt 行为对齐）
    const builtinTemplate = getBuiltinPromptTemplate(this.template.key, this.writingLanguage)
    const suffix = builtinTemplate?.systemSuffix
    if (suffix) {
      let renderedSuffix = suffix
      for (const [key, value] of Object.entries(this.variables)) {
        renderedSuffix = renderedSuffix.replaceAll(`{{${key}}}`, value)
      }
      result = result + '\n\n' + renderedSuffix
    }

    result = appendRequiredPromptContext(result, this.template, this.variables, this.writingLanguage)

    // 空变量段落裁剪：与 renderPrompt 保持同一套规则。
    result = pruneEmptyOptionalPromptSections(result)

    // 防御性校验：检查是否有未处理的模板占位符
    const missing = result.match(/\{\{.*?\}\}/g)
    if (missing) {
      console.warn(`[PromptBuilder] 警告：模板 "${this.template.name}" 中有未赋值的变量残留:`, missing)
    }
    return result
  }
}

/**
 * 审稿/校准专用 Builder
 */
export class ReviewPromptBuilder extends BasePromptBuilder {
  withChapterContent(content: string) {
    this.variables.chapter_content = content;
    return this;
  }

  withCharacterStates(states: string) {
    this.variables.character_states = states;
    return this;
  }

  withGlobalSummary(summary: string) {
    this.variables.global_summary = summary;
    return this;
  }

  withWorldBuilding(world: string) {
    this.variables.world_building = world;
    return this;
  }

  /** 审稿维度侧重点（角色一致性/世界观合理性/剧情逻辑等） */
  withReviewFocus(focus: string) {
    this.variables.review_focus = focus;
    return this;
  }
}

/**
 * 定稿后处理专项 Builder
 */
export class PostProcessPromptBuilder extends BasePromptBuilder {
  withChapterContent(content: string) {
    this.variables.chapter_content = content;
    return this;
  }

  withChapterNumber(num: string | number) {
    this.variables.chapter_number = String(num);
    return this;
  }

  withChapterTitle(title: string) {
    this.variables.chapter_title = title;
    return this;
  }

  withExistingCardsJson(json: string | object) {
    this.variables.existing_cards_json = typeof json === 'string'
      ? json
      : JSON.stringify(json, null, 2);
    return this;
  }
}

/**
 * 导入小说专用 Builder
 * 用于逆向推演（向量采样增强版配置推演 & 单章蓝图推演）
 */
export class ImportPromptBuilder extends BasePromptBuilder {
  /** 向量检索：世界观与力量体系片段 */
  withSampledWorldview(content: string) {
    this.variables.sampled_worldview = content;
    return this;
  }

  /** 向量检索：主角设定与金手指片段 */
  withSampledProtagonist(content: string) {
    this.variables.sampled_protagonist = content;
    return this;
  }

  /** 向量检索：核心矛盾与敌对势力片段 */
  withSampledConflict(content: string) {
    this.variables.sampled_conflict = content;
    return this;
  }

  /** 向量检索：写作风格与叙事视角片段 */
  withSampledStyle(content: string) {
    this.variables.sampled_style = content;
    return this;
  }

  /** 第一章正文 */
  withFirstChapter(content: string) {
    this.variables.first_chapter = content;
    return this;
  }

  /** 最新一章正文 */
  withLatestChapter(content: string) {
    this.variables.latest_chapter = content;
    return this;
  }

  /** 已有总章数 */
  withTotalChapters(num: number | string) {
    this.variables.total_chapters = String(num);
    return this;
  }

  /** 本章正文全文（单章蓝图推演用） */
  withChapterContent(content: string) {
    this.variables.chapter_content = content;
    return this;
  }

  /** 章节序号 */
  withChapterNumber(num: number | string) {
    this.variables.chapter_number = String(num);
    return this;
  }

  /** 章节标题 */
  withChapterTitle(title: string) {
    this.variables.chapter_title = title;
    return this;
  }

  /** 全局配置脱水版 */
  withNovelConfigSummary(summary: string) {
    this.variables.novel_config_summary = summary;
    return this;
  }

  /** 旧版兼容：sample_content（infer_novel_config 原始 Prompt 用） */
  withSampleContent(content: string) {
    this.variables.sample_content = content;
    return this;
  }
}
