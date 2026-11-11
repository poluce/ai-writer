import { describe, expect, it } from 'vitest'

import { getBuiltinPromptTemplate, getPromptTemplate } from '../prompt-templates'

describe('reference style imitation prompt contract', () => {
  it('turns imported novel samples into actionable imitation guidance', () => {
    const template = getPromptTemplate('analyze_writing_style')

    expect(template?.content).toContain('风格档案')
    expect(template?.content).toContain('仿写指南')
    expect(template?.content).toContain('句式')
    expect(template?.content).toContain('场景推进')
    expect(template?.content).not.toMatch(/Qwen|量化模型/i)
    expect(template?.content).toContain('禁止复述')
    expect(template?.content).toContain('不要复制')
  })

  it('extracts only a small set of optional transferable techniques in both writing languages', () => {
    const zhCN = getBuiltinPromptTemplate('analyze_writing_style', 'zh-CN')
    const enUS = getBuiltinPromptTemplate('analyze_writing_style', 'en-US')

    expect(`${zhCN?.systemRole}\n${zhCN?.content}`).toContain('少量、简短、可选')
    expect(zhCN?.content).toContain('样本缺点')
    expect(zhCN?.content).toContain('动作或物件的出现次数')
    expect(zhCN?.content).toContain('样本文长')
    expect(zhCN?.content).not.toContain('每项 2-4 条')
    expect(zhCN?.content).not.toContain('适合注入 Prompt 的硬性约束')

    expect(`${enUS?.systemRole}\n${enUS?.content}`).toContain('small set of concise, optional')
    expect(enUS?.content).toContain('sample flaws')
    expect(enUS?.content).toContain('action or object quotas')
    expect(enUS?.content).toContain('sample length')
    expect(enUS?.content).not.toContain('two to four concise items per field')
    expect(enUS?.content).not.toContain('Hard constraints for drafting prompts')
  })
})
