import { describe, expect, it } from 'vitest'

import {
  filterAgentSkillCatalog,
  isAgentSkillVisibleToAssistant,
  type AgentSkillCatalogEntry,
} from '../../../shared/agent-skills'

function entry(overrides: Partial<AgentSkillCatalogEntry>): AgentSkillCatalogEntry {
  return {
    name: 'skill',
    description: 'desc',
    location: 'managed://skills/skill/SKILL.md',
    source: 'user',
    ...overrides,
  }
}

describe('assistant skill visibility', () => {
  it('shows planning skills to the architect, blueprint, and general assistants', () => {
    const skill = entry({ stage: 'planning' })
    expect(isAgentSkillVisibleToAssistant(skill, 'general')).toBe(true)
    expect(isAgentSkillVisibleToAssistant(skill, 'architect')).toBe(true)
    expect(isAgentSkillVisibleToAssistant(skill, 'blueprint')).toBe(true)
    expect(isAgentSkillVisibleToAssistant(skill, 'writer')).toBe(false)
    expect(isAgentSkillVisibleToAssistant(skill, 'review')).toBe(false)
  })

  it('shows review skills only to the review and general assistants', () => {
    const skill = entry({ stage: 'review' })
    expect(isAgentSkillVisibleToAssistant(skill, 'review')).toBe(true)
    expect(isAgentSkillVisibleToAssistant(skill, 'general')).toBe(true)
    expect(isAgentSkillVisibleToAssistant(skill, 'architect')).toBe(false)
    expect(isAgentSkillVisibleToAssistant(skill, 'blueprint')).toBe(false)
    expect(isAgentSkillVisibleToAssistant(skill, 'writer')).toBe(false)
  })

  it('shows drafting and refinement skills only to the writer and general assistants', () => {
    for (const stage of ['drafting', 'refinement'] as const) {
      const skill = entry({ stage })
      expect(isAgentSkillVisibleToAssistant(skill, 'writer')).toBe(true)
      expect(isAgentSkillVisibleToAssistant(skill, 'general')).toBe(true)
      expect(isAgentSkillVisibleToAssistant(skill, 'architect')).toBe(false)
      expect(isAgentSkillVisibleToAssistant(skill, 'blueprint')).toBe(false)
      expect(isAgentSkillVisibleToAssistant(skill, 'review')).toBe(false)
    }
  })

  it('shows unmarked skills to every assistant', () => {
    const skill = entry({})
    for (const assistantType of ['general', 'architect', 'blueprint', 'writer', 'review'] as const) {
      expect(isAgentSkillVisibleToAssistant(skill, assistantType)).toBe(true)
    }
  })

  it('lets an explicit audience override the stage mapping', () => {
    const reviewOnly = entry({ stage: 'planning', audience: 'review' })
    expect(isAgentSkillVisibleToAssistant(reviewOnly, 'review')).toBe(true)
    expect(isAgentSkillVisibleToAssistant(reviewOnly, 'architect')).toBe(false)

    const writerOnly = entry({ stage: 'planning', audience: 'writer' })
    expect(isAgentSkillVisibleToAssistant(writerOnly, 'writer')).toBe(true)
    expect(isAgentSkillVisibleToAssistant(writerOnly, 'general')).toBe(false)

    const all = entry({ stage: 'review', audience: 'all' })
    for (const assistantType of ['general', 'architect', 'blueprint', 'writer', 'review'] as const) {
      expect(isAgentSkillVisibleToAssistant(all, assistantType)).toBe(true)
    }
  })

  it('filters catalogs per assistant', () => {
    const catalog = [
      entry({ name: 'plan', stage: 'planning' }),
      entry({ name: 'review', stage: 'review' }),
      entry({ name: 'free', audience: 'all' }),
    ]
    expect(filterAgentSkillCatalog(catalog, 'review').map(item => item.name)).toEqual(['review', 'free'])
    expect(filterAgentSkillCatalog(catalog, 'architect').map(item => item.name)).toEqual(['plan', 'free'])
  })
})
