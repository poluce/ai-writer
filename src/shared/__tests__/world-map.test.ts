import { describe, expect, it } from 'vitest'

import {
  normalizeWorldMapArtifact,
  validateWorldMapData,
  type WorldMapArtifact,
} from '../world-map'

function validArtifact(): WorldMapArtifact {
  return {
    worldName: '九域',
    premise: '灵气自天裂涌入，五域以灵脉为界。',
    tiers: [
      { name: '超一流', order: 1 },
      { name: '一流', order: 2 },
      { name: '三流', order: 3 },
    ],
    realms: [
      { name: '练气', order: 1 },
      { name: '筑基', order: 2 },
      { name: '金丹', order: 3 },
    ],
    regions: [
      {
        name: '中原',
        continent: '玄洲',
        direction: 'center',
        terrain: '平原',
        summary: '灵脉交汇之地。',
        adjacent: ['东海'],
        controllingFaction: '天枢宗',
      },
      {
        name: '东海',
        continent: '玄洲',
        direction: 'east',
        terrain: '群岛',
        summary: '外海航路。',
        adjacent: ['中原'],
        controllingFaction: '太一宫',
      },
    ],
    factions: [
      {
        name: '天枢宗',
        kind: 'sect',
        region: '中原',
        tier: '超一流',
        resource: '中州灵脉',
        summary: '垄断飞升名额。',
        leader: '陆沉舟',
        realm: '金丹',
      },
      {
        name: '太一宫',
        kind: 'sect',
        region: '东海',
        tier: '一流',
        resource: '外海航路',
        summary: '掌握旧仙航路。',
      },
    ],
    relations: [
      { from: '天枢宗', to: '太一宫', kind: 'enemy', note: '飞升名额之争' },
    ],
  }
}

describe('world map artifact normalization', () => {
  it('resolves names to stable IDs and derives the two ladders separately', () => {
    const result = normalizeWorldMapArtifact(validArtifact(), { now: '2026-11-10T00:00:00.000Z' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.tiers.map(tier => tier.name)).toEqual(['超一流', '一流', '三流'])
    expect(result.data.realms.map(realm => realm.name)).toEqual(['练气', '筑基', '金丹'])
    expect(result.data.regions[0].controllingFactionId).toBe(result.data.factions[0].id)
    expect(result.data.regions[0].adjacentRegionIds).toEqual([result.data.regions[1].id])
    expect(result.data.factions[0].realmId).toBe(result.data.realms[2].id)
    expect(result.data.relations[0]).toMatchObject({
      fromFactionId: result.data.factions[0].id,
      toFactionId: result.data.factions[1].id,
      kind: 'enemy',
    })
    expect(result.data.generatedAt).toBe('2026-11-10T00:00:00.000Z')
  })

  it('reports unresolved references and duplicate names instead of throwing', () => {
    const artifact = validArtifact()
    artifact.regions[0].controllingFaction = '不存在宗'
    artifact.relations = [{ from: '天枢宗', to: '不存在宫', kind: 'enemy' }]
    artifact.factions[1].name = '天枢宗'

    const result = normalizeWorldMapArtifact(artifact)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.join('\n')).toContain('不存在宗')
    expect(result.errors.join('\n')).toContain('不存在宫')
    expect(result.errors.join('\n')).toContain('势力名称重复')
  })

  it('accepts English direction and faction kind aliases', () => {
    const artifact = validArtifact()
    artifact.regions[0].direction = 'north' as never
    artifact.factions[0].kind = 'sect'
    const result = normalizeWorldMapArtifact(artifact)
    expect(result.ok).toBe(true)
  })

  it('rejects a stored map whose references are broken', () => {
    const normalized = normalizeWorldMapArtifact(validArtifact())
    expect(normalized.ok).toBe(true)
    if (!normalized.ok) return
    const broken = {
      ...normalized.data,
      factions: normalized.data.factions.map(faction => ({ ...faction, tierId: 'missing' })),
    }
    const validation = validateWorldMapData(broken)
    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.error).toContain('等级')
  })
})
