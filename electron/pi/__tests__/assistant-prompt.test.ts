import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { ProjectCoreData } from '../../repositories/project-core-repository'
import { buildAssistantPromptPreview } from '../assistant-prompt'

const roots: string[] = []

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-assistant-prompt-'))
  roots.push(root)
  return root
}

afterEach(() => {
  while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true })
})

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

describe('buildAssistantPromptPreview', () => {
  it('returns ordered blocks with labels, sources, and editability', () => {
    const preview = buildAssistantPromptPreview({
      assistantType: 'general',
      language: 'zh-CN',
      core: core(),
    })
    expect(preview.blocks.map(block => block.kind)).toEqual([
      'hard_rules', 'identity', 'work_rules', 'skill_catalog', 'project_facts',
    ])
    expect(preview.blocks.map(block => block.editable)).toEqual([true, true, true, false, false])
    expect(preview.blocks.map(block => block.label)).toEqual([
      '软件硬规则', '助手身份', '工作规范', '技能目录', '项目信息',
    ])
    expect(preview.blocks[0]?.source).toBe('builtin')
    expect(preview.blocks[3]?.source).toBe('auto')
    expect(preview.prompt).toContain('【不可变系统合同】')
    expect(preview.prompt).toContain('项目名称: 潮门')
    // 预览文本与正式装配完全一致。
    expect(preview.prompt).toContain(preview.blocks[0]!.text)
  })

  it('treats an empty hard-rules override as "clear the block"', () => {
    const globalPromptsDir = tempRoot()
    fs.writeFileSync(path.join(globalPromptsDir, 'assistant_hard_rules.zh-CN.json'), JSON.stringify({
      key: 'assistant_hard_rules',
      writingLanguage: 'zh-CN',
      name: '软件硬规则',
      description: '',
      content: '',
      variables: {},
    }))

    const preview = buildAssistantPromptPreview({
      assistantType: 'general',
      language: 'zh-CN',
      core: core(),
      globalPromptsDir,
    })
    const hardRules = preview.blocks[0]!
    expect(hardRules.source).toBe('global')
    expect(hardRules.chars).toBe(0)
    expect(preview.prompt).not.toContain('【不可变系统合同】')
    expect(preview.prompt.startsWith('你是一位经验丰富的长篇小说统筹与创作主助手')).toBe(true)
  })

  it('prefers a project override and reports its source', () => {
    const projectPath = tempRoot()
    const promptsDir = path.join(projectPath, '.vela', 'prompts')
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(path.join(promptsDir, 'assistant_writing_work_rules.zh-CN.json'), JSON.stringify({
      key: 'assistant_writing_work_rules',
      writingLanguage: 'zh-CN',
      name: '主助手工作规范',
      description: '',
      content: '项目级工作规范。',
      variables: {},
    }))

    const preview = buildAssistantPromptPreview({
      assistantType: 'general',
      language: 'zh-CN',
      core: core(),
      projectPath,
    })
    const workRules = preview.blocks[2]!
    expect(workRules.source).toBe('project')
    expect(workRules.text).toBe('项目级工作规范。')
  })
})
