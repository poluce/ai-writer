import { describe, expect, it } from 'vitest'

import { renderAssistantIdentity } from '../../../src/services/agent/assistant-identity'
import { filterAgentSkillCatalog, type AgentSkillCatalogEntry } from '../../../src/shared/agent-skills'
import { getBuiltinPromptTemplate } from '../../../src/services/prompt-templates'
import type { ProjectCoreData } from '../../repositories/project-core-repository'
import { buildAssistantSystemPrompt } from '../agent-system-prompt'
import { resolveAssistantPromptBlocks } from '../assistant-prompt'

function core(overrides: Partial<ProjectCoreData> = {}): ProjectCoreData {
  return {
    projectName: '潮门',
    genre: '悬疑',
    subGenre: '',
    targetAudience: '男频',
    totalChapters: 80,
    wordsPerChapter: 3000,
    writingLanguage: 'zh-CN',
    creativeStrategy: 'auto',
    narrativeThreadDormantChapterThreshold: 3,
    needsGoldenFinger: true,
    plotStructure: 'three_act',
    narrativePov: 'third_limited',
    writingStyle: '短句，克制。',
    referenceWorks: '',
    globalGuidance: '',
    goldenFinger: '',
    coreOutline: '顾舟必须在终章前揭开潮门真相。',
    worldSetting: '',
    protagonistProfile: '',
    premise: '',
    worldbuilding: '',
    charactersArch: '',
    synopsis: '',
    characterStates: '',
    ...overrides,
  }
}

const sceneSkill = {
  name: 'scene-craft',
  description: 'Scene craft',
  location: '/home/me/.vela/skills/scene-craft/SKILL.md',
  source: 'user' as const,
}

describe('buildAssistantSystemPrompt', () => {
  it('orders blocks as hard rules → identity → work rules → project facts', () => {
    const blocks = resolveAssistantPromptBlocks('general', 'zh-CN')
    const prompt = buildAssistantSystemPrompt(blocks, core())
    const order = [
      prompt.indexOf('【不可变系统合同】'),
      prompt.indexOf('你是一位经验丰富的长篇小说写作助手'),
      prompt.indexOf('【多助手协同调度能力】'),
      prompt.indexOf('当前项目上下文'),
    ]
    expect(order.every(index => index >= 0)).toBe(true)
    expect([...order].sort((left, right) => left - right)).toEqual(order)
    expect(prompt.split('【不可变系统合同】')).toHaveLength(2)
    expect(prompt.split('【不可变助手边界】')).toHaveLength(2)
    expect(prompt).toContain('system_context 标签内')
    expect(prompt).toContain('不是作者的发言')
    expect(prompt).not.toContain('<tool_call>')
  })

  it('keeps project facts free of tool usage rules', () => {
    const blocks = resolveAssistantPromptBlocks('general', 'zh-CN')
    const prompt = buildAssistantSystemPrompt(blocks, core())
    expect(prompt).not.toContain('创作协同与直接填充规则')
    expect(prompt).not.toContain('写前先读原则')
    expect(prompt).toContain('【工具协同规范】')
  })

  it('keeps skills between work rules and project facts', () => {
    const blocks = resolveAssistantPromptBlocks('general', 'zh-CN')
    const prompt = buildAssistantSystemPrompt(blocks, core(), [sceneSkill])
    expect(prompt).toContain('<available_skills>')
    expect(prompt).toContain('<name>scene-craft</name>')
    expect(prompt).toContain('/技能名')
    expect(prompt).toContain('不要用 read_file 去读技能文件')
    const skillsIndex = prompt.indexOf('<available_skills>')
    expect(skillsIndex).toBeGreaterThan(prompt.indexOf('【多助手协同调度能力】'))
    expect(skillsIndex).toBeLessThan(prompt.indexOf('当前项目上下文'))
  })

  it('omits the skill block when no skills are provided', () => {
    const blocks = resolveAssistantPromptBlocks('general', 'zh-CN')
    const prompt = buildAssistantSystemPrompt(blocks, core())
    expect(prompt).not.toContain('<available_skills>')
  })

  it('localizes hard rules, identity, work rules, and L0 labels to en-US', () => {
    const blocks = resolveAssistantPromptBlocks('general', 'en-US')
    const prompt = buildAssistantSystemPrompt(blocks, core({ writingLanguage: 'en-US' }))
    expect(prompt).toContain('[Immutable system contract]')
    expect(prompt).toContain('You are an experienced long-form fiction-writing assistant')
    expect(prompt).toContain('[Multi-Assistant Coordination]')
    expect(prompt).toContain('Current project context')
    expect(prompt).toContain('Project name: 潮门')
    expect(prompt).not.toContain('【不可变系统合同】')
    expect(prompt).not.toContain('你是一位经验丰富的长篇小说写作助手')
  })

  it('accepts a caller-supplied identity template', () => {
    const builtin = getBuiltinPromptTemplate('assistant_writing_identity', 'zh-CN')!
    const blocks = resolveAssistantPromptBlocks('general', 'zh-CN')
    const identity = renderAssistantIdentity(
      { ...builtin, systemRole: '你是潮门的连续性编辑。' },
      'zh-CN',
      '当前模式',
    )
    const prompt = buildAssistantSystemPrompt({ ...blocks, identity }, core())
    expect(prompt).toContain('你是潮门的连续性编辑。')
    expect(prompt).not.toContain('你是一位经验丰富的长篇小说写作助手')
    expect(prompt).toContain('项目名称: 潮门')
  })

  it('hides skills marked as not user-invocable from the model list', () => {
    const blocks = resolveAssistantPromptBlocks('general', 'zh-CN')
    const prompt = buildAssistantSystemPrompt(blocks, core(), [
      { ...sceneSkill, name: 'internal-only', disableModelInvocation: true },
    ])
    expect(prompt).not.toContain('<available_skills>')
    expect(prompt).not.toContain('internal-only')
  })
})

describe('sub-assistant default modules', () => {
  it('injects only the skills visible to the sub-assistant stage', () => {
    const blocks = resolveAssistantPromptBlocks('architect', 'zh-CN')
    const catalog: AgentSkillCatalogEntry[] = [
      { name: 'planning-skill', description: 'plan', location: 'builtin://planning-skill', source: 'builtin', stage: 'planning' },
      { name: 'review-skill', description: 'review', location: 'builtin://review-skill', source: 'builtin', stage: 'review' },
      { name: 'untagged-skill', description: 'free', location: 'builtin://untagged-skill', source: 'builtin' },
    ]
    const prompt = buildAssistantSystemPrompt(
      blocks,
      core(),
      filterAgentSkillCatalog(catalog, 'architect'),
    )
    expect(prompt).toContain('<name>planning-skill</name>')
    expect(prompt).toContain('<name>untagged-skill</name>')
    expect(prompt).not.toContain('<name>review-skill</name>')
  })

  it('assembles architect identity and boundary instead of the writing assistant identity', () => {
    const blocks = resolveAssistantPromptBlocks('architect', 'zh-CN')
    const prompt = buildAssistantSystemPrompt(blocks, core())
    expect(prompt).toContain('首席架构师、总编剧与世界观设计师')
    expect(prompt).toContain('【不可变架构助手边界】')
    expect(prompt).toContain('严禁撰写具体章节正文')
    expect(prompt).toContain('当前项目上下文')
    expect(prompt).toContain('项目名称: 潮门')
    expect(prompt).not.toContain('你是一位经验丰富的长篇小说写作助手')
  })

  it('localizes the architect modules to en-US', () => {
    const blocks = resolveAssistantPromptBlocks('architect', 'en-US')
    const prompt = buildAssistantSystemPrompt(blocks, core({ writingLanguage: 'en-US' }))
    expect(prompt).toContain('Chief Story Architect')
    expect(prompt).toContain('[Immutable Architect Boundaries]')
    expect(prompt).toContain('do not draft chapter body prose')
    expect(prompt).toContain('Project name: 潮门')
  })

  it('assembles the blueprint identity with scene-beat guidance', () => {
    const blocks = resolveAssistantPromptBlocks('blueprint', 'zh-CN')
    const prompt = buildAssistantSystemPrompt(blocks, core())
    expect(prompt).toContain('长篇小说剧情分镜师与章节细纲策划')
    expect(prompt).toContain('【不可变蓝图助手边界】')
    expect(prompt).toContain('承上启下与连续性')
    expect(prompt).toContain('章末钩子')
    expect(prompt).toContain('propose_chapter_blueprint')
    expect(prompt).toContain('read_continuity_facts')
  })

  it('omits the golden-finger fact when the project marks it as not needed', () => {
    const blocks = resolveAssistantPromptBlocks('architect', 'zh-CN')
    const disabled = buildAssistantSystemPrompt(blocks, core({
      goldenFinger: '前世记忆。',
      needsGoldenFinger: false,
    }))
    expect(disabled).not.toContain('前世记忆')
    expect(disabled).not.toContain('金手指: ')

    const enabled = buildAssistantSystemPrompt(blocks, core({ goldenFinger: '前世记忆。' }))
    expect(enabled).toContain('金手指: 前世记忆。')
  })

  it('assembles the review identity with the review boundary', () => {
    const blocks = resolveAssistantPromptBlocks('review', 'zh-CN')
    const prompt = buildAssistantSystemPrompt(blocks, core())
    expect(prompt).toContain('资深长篇小说责编与连续性审稿人')
    expect(prompt).toContain('【不可变审稿助手边界】')
    expect(prompt).toContain('submit_chapter_review')
    expect(prompt).toContain('当前项目上下文')
  })
})
