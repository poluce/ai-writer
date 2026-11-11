import { describe, expect, it } from 'vitest'

import { BasePromptBuilder, ReviewPromptBuilder } from '../prompts/prompt-builder'
import { BUILTIN_PROMPTS, EDITABLE_PROMPT_KEYS, getBuiltinPromptTemplate, getPromptTemplate, renderPrompt } from '../prompt-templates'

const expectedPromptVariables: Record<string, string[]> = {
  assistant_writing_identity: ['mode_instruction'],
  generate_novel_config_field: ['existing_config', 'field_label', 'field_requirements'],
  consistency_check: ['chapter_content', 'character_states', 'global_summary', 'world_building', 'review_focus'],
  analyze_writing_style: ['sample_text'],
  generate_chapter_notes: ['chapter_content', 'chapter_number', 'chapter_title'],
  update_character_cards: ['chapter_content', 'chapter_number', 'existing_cards_json'],
  infer_novel_config: ['sample_content'],
  infer_single_chapter_blueprint: ['chapter_content', 'chapter_number', 'chapter_title', 'novel_config_summary'],
  infer_novel_config_with_vectors: [
    'sampled_worldview',
    'sampled_protagonist',
    'sampled_conflict',
    'sampled_style',
    'first_chapter',
    'latest_chapter',
    'total_chapters',
  ],
  assistant_hard_rules: [],
  assistant_writing_work_rules: [],
  assistant_architect_identity: ['mode_instruction'],
  assistant_blueprint_identity: ['mode_instruction'],
  assistant_writer_identity: ['mode_instruction'],
  assistant_review_identity: ['mode_instruction'],
  assistant_architect_work_rules: [],
  assistant_blueprint_work_rules: [],
  assistant_writer_work_rules: [],
  assistant_review_work_rules: [],
}

const expectedJsonFields: Record<string, string[]> = {
  consistency_check: ['items', 'category', 'severity', 'quote', 'description', 'summary'],
  update_character_cards: [
    'updates',
    'newCharacters',
    'currentState',
    'location',
    'powerLevel',
    'physicalState',
    'mentalState',
    'keyItems',
    'recentEvents',
    'updatedAtChapter',
  ],
  infer_novel_config: [
    'novelConfig',
    'architectureFiles',
    'characterCards',
    'genre',
    'targetAudience',
    'subGenre',
    'coreOutline',
    'worldSetting',
    'goldenFinger',
    'protagonistProfile',
    'globalGuidance',
    'premise',
    'characters',
    'worldbuilding',
    'synopsis',
    'target',
    'relation',
    'currentState',
  ],
  infer_single_chapter_blueprint: ['chapterNumber', 'title', 'role', 'purpose', 'characters', 'keyEvents', 'suspenseHook'],
  infer_novel_config_with_vectors: [
    'novelConfig',
    'architectureFiles',
    'characterCards',
    'plotStructure',
    'narrativePOV',
    'genre',
    'targetAudience',
    'subGenre',
    'coreOutline',
    'worldSetting',
    'goldenFinger',
    'protagonistProfile',
    'globalGuidance',
    'premise',
    'characters',
    'worldbuilding',
    'synopsis',
    'target',
    'relation',
    'currentState',
  ],
}

class FieldPromptBuilder extends BasePromptBuilder {
  withExistingConfig(value: string) {
    this.variables.existing_config = value
    return this
  }
  withFieldLabel(value: string) {
    this.variables.field_label = value
    return this
  }
  withFieldRequirements(value: string) {
    this.variables.field_requirements = value
    return this
  }
}

const promptText = (key: string) => {
  const template = getPromptTemplate(key)
  expect(template, `missing prompt template: ${key}`).toBeTruthy()
  return [template?.systemRole, template?.content, template?.systemSuffix].filter(Boolean).join('\n')
}

const optionalGuidanceLabels = [
  '【作者补充指导】',
  '【作者节奏/风格指导】',
  '【作者要求重点检查的维度',
]

describe('built-in model-neutral prompt contract', () => {
  it('drops templates that no runtime path consumes and hides offline-only ones from editors', () => {
    const builtinKeys = BUILTIN_PROMPTS.map((template) => template.key)
    const retiredKeys = [
      'edit_selected_text',
      'chapter_blueprint',
      'extract_initial_characters',
      'generate_global_config',
      'premise',
      'character_dynamics',
      'world_building',
      'synopsis',
      'chapter_blueprint_chunk',
      'first_chapter_draft',
      'next_chapter_draft',
      'refine_chapter',
      'refine_from_review',
    ]
    for (const key of retiredKeys) {
      expect(builtinKeys, `${key} must not be registered without a production consumer`).not.toContain(key)
      expect(EDITABLE_PROMPT_KEYS, `${key} must not stay editable`).not.toContain(key)
    }
    // consistency_check 只服务离线续写校准脚本，不再向用户暴露编辑入口
    expect(builtinKeys).toContain('consistency_check')
    expect(EDITABLE_PROMPT_KEYS).not.toContain('consistency_check')
  })

  it('keeps system roles free of overclaiming slogan identities', () => {
    for (const template of BUILTIN_PROMPTS) {
      expect(template.systemRole ?? '', `${template.key} system role`).not.toMatch(/顶尖|白金|爆款|大神/)
    }
  })

  it('keeps every built-in system role model-neutral and focused on fiction work', () => {
    for (const template of BUILTIN_PROMPTS) {
      const role = (template.systemRole ?? '').trim()
      // 规则模块（硬规则 / 工作规范）没有角色段落，不参与角色措辞约束。
      if (!role) continue
      expect(role, `${template.key} must not bind to one provider or prestige identity`).not.toMatch(/Qwen|量化模型|GPT|Claude|DeepSeek|Grok|顶尖|白金|大神|accomplished|top[- ]|web-fiction/i)
      expect(role, `${template.key} should stay focused on writing or structure`).toMatch(/小说|网文|章节|角色|正文|设定|审稿|风格|结构|JSON/)

      const englishRole = getBuiltinPromptTemplate(template.key, 'en-US')?.systemRole ?? ''
      expect(englishRole, `${template.key} English role`).not.toMatch(/Qwen|quantiz|GPT|Claude|DeepSeek|Grok|accomplished|top[- ]|web-fiction/i)
    }
  })

  it('preserves all built-in prompt keys and variable contracts', () => {
    expect(BUILTIN_PROMPTS.map((template) => template.key)).toEqual(Object.keys(expectedPromptVariables))

    for (const template of BUILTIN_PROMPTS) {
      expect(Object.keys(template.variables), `${template.key} variables`).toEqual(expectedPromptVariables[template.key])
    }
  })

  it('preserves JSON output field contracts for structured prompts', () => {
    for (const [key, fields] of Object.entries(expectedJsonFields)) {
      const text = promptText(key)
      for (const field of fields) {
        expect(text, `${key} should preserve JSON field ${field}`).toContain(field)
      }
    }
  })

  it('正文和任务指导算已引用，伪造的自定义后缀不阻止必需事实兜底', () => {
    const builtin = getBuiltinPromptTemplate('generate_novel_config_field', 'zh-CN')!
    const custom = {
      ...builtin,
      content: '自定义正文引用：{{field_label}}',
      taskGuidance: '自定义任务指导引用：{{field_requirements}}',
      systemSuffix: '伪造后缀引用：{{existing_config}}',
    }
    const variables = {
      existing_config: '兜底中的唯一既有小说配置',
      field_label: '正文中的唯一目标字段',
      field_requirements: '任务指导中的唯一字段要求',
    }
    const renderedPrompts = [
      renderPrompt(custom, variables, 'zh-CN'),
      new FieldPromptBuilder(custom, 'zh-CN')
        .withExistingConfig(variables.existing_config)
        .withFieldLabel(variables.field_label)
        .withFieldRequirements(variables.field_requirements)
        .build(),
    ]

    for (const rendered of renderedPrompts) {
      expect(rendered).not.toContain('伪造后缀引用')
      expect(rendered).toContain('【自定义模板未引用但仍必须遵循的权威项目设定】')
      for (const fact of Object.values(variables).filter(Boolean)) {
        expect(rendered.split(fact)).toHaveLength(2)
      }
    }
  })

  it('keeps import and imitation prompts focused on style extraction and reference imitation', () => {
    const stylePrompt = promptText('analyze_writing_style')
    expect(stylePrompt).toContain('风格档案')
    expect(stylePrompt).toContain('仿写指南')
    expect(stylePrompt).not.toMatch(/Qwen|量化模型/i)
    expect(stylePrompt).toContain('禁止复述')
    expect(stylePrompt).toContain('不要复制')

    for (const key of ['infer_novel_config', 'infer_novel_config_with_vectors', 'infer_single_chapter_blueprint']) {
      const text = promptText(key)
      expect(text, `${key} should use the import workflow`).toMatch(/已有小说|已有章节|关键片段/)
      if (key !== 'infer_single_chapter_blueprint') {
        expect(text, `${key} should mark unknown fields`).toContain('待确认')
      }
      expect(text, `${key} should preserve structured output`).toMatch(/JSON|chapterNumber/)
    }
  })

  it('does not add safety, refusal, compliance, or bottom-line policy prompts', () => {
    const allPromptText = BUILTIN_PROMPTS
      .map((template) => [template.systemRole, template.content, template.systemSuffix].filter(Boolean).join('\n'))
      .join('\n')

    expect(allPromptText).not.toMatch(/安全提示|拒绝提示|合规提示|底线提示|写作安全|安全边界|合规边界|政策要求/)
    expect(allPromptText).not.toContain('底线')
  })

  it('prunes empty optional guidance labels from rendered prompts', () => {
    const consistencyCheck = getPromptTemplate('consistency_check')
    expect(consistencyCheck).toBeTruthy()

    const rendered = renderPrompt(consistencyCheck!, {
      chapter_content: '正文',
      character_states: '角色状态',
      global_summary: '摘要',
      world_building: '世界观',
      review_focus: '',
    }, 'zh-CN')

    for (const label of optionalGuidanceLabels) {
      expect(rendered).not.toContain(label)
    }
    expect(rendered).toContain('【交卷方式】')
  })

  it('keeps PromptBuilder pruning aligned with renderPrompt', () => {
    const consistencyCheck = getPromptTemplate('consistency_check')
    expect(consistencyCheck).toBeTruthy()

    const rendered = new ReviewPromptBuilder(consistencyCheck!, 'zh-CN')
      .withChapterContent('正文')
      .withCharacterStates('角色状态')
      .withGlobalSummary('摘要')
      .withWorldBuilding('世界观')
      .withReviewFocus('')
      .build()

    for (const label of optionalGuidanceLabels) {
      expect(rendered).not.toContain(label)
    }
    expect(rendered).toContain('【交卷方式】')
  })
})
