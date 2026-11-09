import { describe, expect, it } from 'vitest'

import {
  NOVEL_CONFIG_GENERATION_CHAIN,
  NOVEL_CONFIG_GENERATION_KEYS,
  generationFieldLabels,
  generationFieldRequirements,
  goldenFingerForPrompt,
  isGenerationFieldEnabled,
  previousGenerationSteps,
} from '../novel-config-generation'

describe('novel config generation chain', () => {
  it('keeps one ordered chain that covers every generatable field once', () => {
    const chainKeys = NOVEL_CONFIG_GENERATION_CHAIN.map(step => step.key)
    expect([...chainKeys].sort()).toEqual([...NOVEL_CONFIG_GENERATION_KEYS].sort())
    expect(new Set(chainKeys).size).toBe(chainKeys.length)
  })

  it('gives each field exactly the fields before it as context', () => {
    expect(previousGenerationSteps('coreOutline')).toEqual([])
    expect(previousGenerationSteps('worldSetting').map(step => step.key)).toEqual(['coreOutline'])
    expect(previousGenerationSteps('goldenFinger').map(step => step.key))
      .toEqual(['coreOutline', 'worldSetting'])
    expect(previousGenerationSteps('writingStyle').map(step => step.key))
      .toEqual(NOVEL_CONFIG_GENERATION_CHAIN.slice(0, -1).map(step => step.key))
  })

  it('drops the optional golden-finger field from the chain when it is switched off', () => {
    expect(isGenerationFieldEnabled('goldenFinger', {})).toBe(true)
    expect(isGenerationFieldEnabled('coreOutline', { needsGoldenFinger: false })).toBe(true)
    expect(isGenerationFieldEnabled('goldenFinger', { needsGoldenFinger: false })).toBe(false)

    const enabledChain = previousGenerationSteps('protagonistProfile')
      .map(step => step.key)
    expect(enabledChain).toContain('goldenFinger')

    const disabledChain = previousGenerationSteps('protagonistProfile', { needsGoldenFinger: false })
      .map(step => step.key)
    expect(disabledChain).toEqual(['coreOutline', 'worldSetting'])

    expect(goldenFingerForPrompt({ goldenFinger: '万劫道鉴' })).toBe('万劫道鉴')
    expect(goldenFingerForPrompt({ goldenFinger: '万劫道鉴', needsGoldenFinger: false })).toBe('')
  })

  it('resolves labels and requirements per writing language', () => {
    expect(generationFieldLabels('coreOutline')).toEqual(['核心大纲', 'Core outline'])

    const facts = { genre: 'Xianxia', targetAudience: 'Male-oriented' }
    expect(generationFieldRequirements('worldSetting', facts, 'zh-CN')).toContain('时代')
    expect(generationFieldRequirements('worldSetting', facts, 'en-US')).toContain('Describe the era')

    const style = generationFieldRequirements('writingStyle', facts, 'en-US')
    expect(style).toContain('Xianxia')
    expect(style).toContain('Male-oriented')
    expect(style).not.toMatch(/[\u3400-\u9fff]/u)
  })
})
