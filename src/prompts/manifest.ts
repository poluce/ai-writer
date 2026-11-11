/**
 * 内置提示词的结构元数据。
 *
 * 散文正文在 ./zh-CN/*.md 与 ./en-US/*.md；这里只保留形状：
 * 有哪些 key、接受哪些插值变量、以及 Builder 必须补齐的上下文变量。
 * 修改提示词内容请改 markdown，不要在 TypeScript 里写死文案。
 */

export interface BuiltinPromptStructure {
  readonly key: string
  /** 插值变量名 → 设置页展示给作者的说明。 */
  readonly variables: Readonly<Record<string, string>>
  /** 自定义正文删掉占位符后，Builder 仍必须追加的权威上下文变量。 */
  readonly requiredContextVariables?: readonly string[]
}

export const BUILTIN_PROMPT_STRUCTURES: readonly BuiltinPromptStructure[] = [
  {
    key: "assistant_writing_identity",
    variables: {
      "mode_instruction": "当前助手工作模式说明",
    },
  },
  {
    key: "generate_novel_config_field",
    variables: {
      "existing_config": "已有小说配置",
      "field_label": "要生成的字段",
      "field_requirements": "该字段的具体要求",
    },
    requiredContextVariables: ["existing_config"],
  },
  {
    key: "consistency_check",
    variables: {
      "chapter_content": "章节内容",
      "character_states": "角色状态",
      "global_summary": "上下文检索结果",
      "world_building": "世界观设定",
      "review_focus": "审稿维度侧重点（可选）",
    },
  },
  {
    key: "analyze_writing_style",
    variables: {
      "sample_text": "正文采样文本（3-5章拼接）",
    },
  },
  {
    key: "generate_chapter_notes",
    variables: {
      "chapter_content": "章节正文内容",
      "chapter_number": "章节编号",
      "chapter_title": "章节标题",
    },
  },
  {
    key: "update_character_cards",
    variables: {
      "chapter_content": "章节正文内容",
      "chapter_number": "章节编号",
      "existing_cards_json": "现有角色卡 JSON 数组（包含 name/role 等基础信息）",
    },
  },
  {
    key: "infer_novel_config",
    variables: {
      "sample_content": "知识库代表性采样内容（开头+中段+结尾）",
    },
  },
  {
    key: "infer_single_chapter_blueprint",
    variables: {
      "chapter_content": "本章正文全文",
      "chapter_number": "本章序号",
      "chapter_title": "本章标题（来自拆章）",
      "novel_config_summary": "全局配置脱水版",
    },
  },
  {
    key: "infer_novel_config_with_vectors",
    variables: {
      "sampled_worldview": "向量检索：世界观与力量体系相关片段",
      "sampled_protagonist": "向量检索：主角设定与金手指相关片段",
      "sampled_conflict": "向量检索：核心矛盾与敌对势力相关片段",
      "sampled_style": "向量检索：写作风格与叙事视角相关片段",
      "first_chapter": "第一章正文（开局风格参考）",
      "latest_chapter": "最新一章正文（当前进度参考）",
      "total_chapters": "已有总章数",
    },
  },
  {
    key: "assistant_hard_rules",
    variables: {},
  },
  {
    key: "assistant_writing_work_rules",
    variables: {},
  },
  {
    key: "assistant_architect_identity",
    variables: {
      "mode_instruction": "当前助手工作模式说明",
    },
  },
  {
    key: "assistant_blueprint_identity",
    variables: {
      "mode_instruction": "当前助手工作模式说明",
    },
  },
  {
    key: "assistant_writer_identity",
    variables: {
      "mode_instruction": "当前助手工作模式说明",
    },
  },
  {
    key: "assistant_review_identity",
    variables: {
      "mode_instruction": "当前助手工作模式说明",
    },
  },
  {
    key: "assistant_architect_work_rules",
    variables: {},
  },
  {
    key: "assistant_blueprint_work_rules",
    variables: {},
  },
  {
    key: "assistant_writer_work_rules",
    variables: {},
  },
  {
    key: "assistant_review_work_rules",
    variables: {},
  },
]

/** 允许用户自定义编辑的模板 Key 列表（其余为系统模板，不可编辑） */
export const EDITABLE_PROMPT_KEYS: readonly string[] = [
  "generate_novel_config_field",
  "analyze_writing_style",
  "generate_chapter_notes",
  "update_character_cards",
  "infer_novel_config",
  "infer_single_chapter_blueprint",
  "infer_novel_config_with_vectors",
]

/**
 * Built-in templates used by the runtime lifecycle. Every key in this
 * list must provide an English overlay; commands may not silently fall back to
 * the historical Chinese template for an English project.
 */
export const CORE_LOCALIZED_BUILTIN_PROMPT_KEYS: readonly string[] = [
  "generate_novel_config_field",
  "consistency_check",
  "generate_chapter_notes",
  "update_character_cards",
  "analyze_writing_style",
  "infer_novel_config",
  "infer_novel_config_with_vectors",
  "infer_single_chapter_blueprint",
  "assistant_hard_rules",
  "assistant_writing_work_rules",
  "assistant_architect_identity",
  "assistant_blueprint_identity",
  "assistant_writer_identity",
  "assistant_review_identity",
  "assistant_architect_work_rules",
  "assistant_blueprint_work_rules",
  "assistant_writer_work_rules",
  "assistant_review_work_rules",
]

const CORE_LOCALIZED_BUILTIN_PROMPT_KEY_SET = new Set<string>(CORE_LOCALIZED_BUILTIN_PROMPT_KEYS)

export type CoreLocalizedBuiltinPromptKey = typeof CORE_LOCALIZED_BUILTIN_PROMPT_KEYS[number]

export function isCoreLocalizedBuiltinPromptKey(key: string): key is CoreLocalizedBuiltinPromptKey {
  return CORE_LOCALIZED_BUILTIN_PROMPT_KEY_SET.has(key)
}
