import type { WorldMapData } from '../../../shared/world-map'

export function sampleWorldMap(): WorldMapData {
  return {
    version: 1,
    worldName: '九域',
    premise: '灵气自天裂涌入，五域以灵脉为界；人人求飞升，而飞升是旧仙的回收场。',
    tiers: [
      { id: 'tier-1', name: '超一流', order: 1 },
      { id: 'tier-2', name: '一流', order: 2 },
      { id: 'tier-3', name: '二流', order: 3 },
      { id: 'tier-4', name: '三流', order: 4 },
    ],
    realms: [
      { id: 'realm-1', name: '练气', order: 1 },
      { id: 'realm-2', name: '筑基', order: 2 },
      { id: 'realm-3', name: '金丹', order: 3 },
      { id: 'realm-4', name: '元婴', order: 4 },
      { id: 'realm-5', name: '化神', order: 5 },
      { id: 'realm-6', name: '渡劫', order: 6 },
    ],
    regions: [
      { id: 'region-1', name: '中原', continent: '玄洲', direction: 'center', terrain: '平原与灵脉', summary: '五域灵脉交汇之地。', adjacentRegionIds: ['region-2', 'region-3'], controllingFactionId: 'faction-1' },
      { id: 'region-2', name: '北境', continent: '玄洲', direction: 'north', terrain: '雪山与剑冢', summary: '旧仙战场。', adjacentRegionIds: ['region-1'], controllingFactionId: 'faction-3' },
      { id: 'region-3', name: '东海', continent: '玄洲', direction: 'east', terrain: '群岛与外海', summary: '旧仙航路。', adjacentRegionIds: ['region-1'], controllingFactionId: 'faction-2' },
      { id: 'region-4', name: '西荒', continent: '荒洲', direction: 'west', terrain: '荒漠与地下城', summary: '地下煞脉。', adjacentRegionIds: ['region-1'], controllingFactionId: 'faction-4' },
    ],
    factions: [
      { id: 'faction-1', name: '天枢宗', kind: 'sect', regionId: 'region-1', tierId: 'tier-1', resource: '中州灵脉', summary: '垄断飞升名额。', leader: '陆沉舟', realmId: 'realm-4' },
      { id: 'faction-2', name: '太一宫', kind: 'sect', regionId: 'region-3', tierId: 'tier-1', resource: '外海航路', summary: '掌握旧仙航路。', leader: '裴照', realmId: 'realm-4' },
      { id: 'faction-3', name: '北冥剑阁', kind: 'sect', regionId: 'region-2', tierId: 'tier-3', resource: '剑冢遗藏', summary: '守墓三百年。', leader: '沈孤鸿', realmId: 'realm-4' },
      { id: 'faction-4', name: '玄阴教', kind: 'sect', regionId: 'region-4', tierId: 'tier-2', resource: '地下煞脉', summary: '以死煞炼体。', leader: '阴无咎', realmId: 'realm-3' },
    ],
    relations: [
      { id: 'relation-1', fromFactionId: 'faction-1', toFactionId: 'faction-2', kind: 'enemy', note: '飞升名额之争' },
      { id: 'relation-2', fromFactionId: 'faction-1', toFactionId: 'faction-3', kind: 'ally', note: '旧盟' },
    ],
    generatedAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
  }
}
