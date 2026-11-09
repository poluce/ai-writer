/**
 * 小说配置的 AI 单字段生成元数据。
 *
 * 这个数组是生成顺序的唯一事实来源，同时决定两件事：
 * 1. 界面自上而下的字段顺序（核心大纲 → 世界观 → 金手指 → 主角 → 全局要求 → 文风）；
 * 2. 每个字段的生成上下文阶梯：只读取它前面已经写好的字段，后置字段不会倒灌。
 *
 * 想调整生成顺序：只改这个数组的排列，命令与上下文拼装逻辑不需要改动。
 * 想接入新的可生成字段：在数组里加一项并补齐 requirements，
 * TypeScript 会强制 NovelConfig 与调用点保持完整。
 */

export interface NovelConfigGenerationFacts {
  genre: string
  targetAudience: string
}

/** 字段生成要求的文案合同：[中文, 英文]；需要引用基础信息的字段用工厂函数。 */
export type NovelConfigGenerationRequirements =
  | readonly [zhCN: string, enUS: string]
  | ((facts: NovelConfigGenerationFacts) => readonly [zhCN: string, enUS: string])

export interface NovelConfigGenerationStep {
  /** NovelConfig 中的文本字段键 */
  key: string
  /** 字段显示名：[中文, 英文] */
  labels: readonly [zhCN: string, enUS: string]
  /** 该字段的生成要求，随写作语言二选一 */
  requirements: NovelConfigGenerationRequirements
}

export const NOVEL_CONFIG_GENERATION_CHAIN = [
  {
    key: 'coreOutline',
    labels: ['核心大纲', 'Core outline'],
    requirements: [
      '不少于150字，包含主角开局困境、核心目标、主要冲突升级与最终危机，明确故事的差异化吸引力。',
      'Write at least 150 words covering the protagonist’s opening predicament, core objective, escalating conflict, final crisis, and distinctive story appeal.',
    ],
  },
  {
    key: 'worldSetting',
    labels: ['世界观设定', 'World setting'],
    requirements: [
      '描述时代、地点、力量或制度规则、权力结构和稀缺资源；每项设定都应能制造具体冲突。',
      'Describe the era, setting, governing rules or power system, power structure, and scarce resources. Every element should create concrete conflict.',
    ],
  },
  {
    key: 'goldenFinger',
    labels: ['金手指/核心卖点', 'Special advantage / core story engine'],
    requirements: [
      '说明差异化优势的来源、机制、成长路径、限制与代价，使其与世界规则发生冲突而非成为万能能力。',
      'Define the origin, mechanism, growth path, limits, and cost of the protagonist’s special advantage. It must interact with world rules rather than solve everything.',
    ],
  },
  {
    key: 'protagonistProfile',
    labels: ['主角人设', 'Protagonist profile'],
    requirements: [
      '包含外在形象、真实个性、反差弱点、显性目标、深层渴望，以及清晰的成长弧起点和方向。',
      'Include public persona, true personality, a contrasting weakness, visible goal, deeper desire, and a clear starting point and direction for the character arc.',
    ],
  },
  {
    key: 'globalGuidance',
    labels: ['全局写作要求', 'Global writing guidance'],
    requirements: [
      '写 4–8 条跨章节长期有效的简短执行规则，总计不超过 600 字；禁止逐章列大纲、分配章节区间或复述核心大纲。',
      'Write 4–8 short, stable, cross-chapter execution rules within 600 characters. Do not enumerate chapters, allocate chapter ranges, or restate the core outline.',
    ],
  },
  {
    key: 'writingStyle',
    labels: ['文风配置', 'Writing-style guide'],
    requirements: ({ genre, targetAudience }: NovelConfigGenerationFacts) => [
      `提供不少于100字的可执行文风指南，涵盖节奏、场景切换、描写密度、对话、用词、情感基调和标志性手法，并适配${genre || '当前题材'}与${targetAudience || '目标受众'}。`,
      `Provide an actionable style guide of at least 100 words covering pacing, scene transitions, descriptive density, dialogue, diction, emotional tone, and signature techniques, suited to ${genre || 'the genre'} and ${targetAudience || 'the target audience'}.`,
    ],
  },
] as const satisfies readonly NovelConfigGenerationStep[]

/** 可生成的字段键：顺序即生成阶梯顺序，由链条数组唯一派生。 */
export type GeneratableField = (typeof NOVEL_CONFIG_GENERATION_CHAIN)[number]['key']

export const NOVEL_CONFIG_GENERATION_KEYS: readonly GeneratableField[] =
  NOVEL_CONFIG_GENERATION_CHAIN.map(step => step.key)

export function findGenerationStep(field: GeneratableField): NovelConfigGenerationStep | undefined {
  return NOVEL_CONFIG_GENERATION_CHAIN.find(step => step.key === field)
}

/** 生成上下文阶梯：返回该字段之前已经写好的字段（按链条顺序）。 */
export function previousGenerationSteps(field: GeneratableField): readonly NovelConfigGenerationStep[] {
  const index = NOVEL_CONFIG_GENERATION_CHAIN.findIndex(step => step.key === field)
  return index > 0 ? NOVEL_CONFIG_GENERATION_CHAIN.slice(0, index) : []
}

/** 字段显示名：[中文, 英文] */
export function generationFieldLabels(field: GeneratableField): readonly [string, string] {
  const step = findGenerationStep(field)
  if (!step) throw new Error(`Unknown novel-config generation field: ${field}`)
  return step.labels
}

/** 字段生成要求：工厂函数会拿到已本地化的基础信息。 */
export function generationFieldRequirements(
  field: GeneratableField,
  facts: NovelConfigGenerationFacts,
  language: 'zh-CN' | 'en-US',
): string {
  const step = findGenerationStep(field)
  if (!step) throw new Error(`Unknown novel-config generation field: ${field}`)
  const requirement = typeof step.requirements === 'function' ? step.requirements(facts) : step.requirements
  return language === 'en-US' ? requirement[1] : requirement[0]
}
