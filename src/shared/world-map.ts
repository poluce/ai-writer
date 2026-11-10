/**
 * 世界地图领域契约 — 生成工具参数、归一化结果与持久化数据共用。
 *
 * 模型不直接写文件：一次性生成由 submit_world_map 工具返回结构化参数，
 * 这里负责校验和补全稳定 ID；应用/校对仍通过项目存储通道写盘。
 */

export const WORLD_MAP_VERSION = 1 as const

export const WORLD_DIRECTIONS = [
  'center',
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
] as const

export type WorldDirection = typeof WORLD_DIRECTIONS[number]

export const WORLD_FACTION_KINDS = ['sect', 'dynasty', 'organization'] as const
export type WorldFactionKind = typeof WORLD_FACTION_KINDS[number]

export const WORLD_RELATION_KINDS = ['ally', 'enemy', 'neutral'] as const
export type WorldRelationKind = typeof WORLD_RELATION_KINDS[number]

export interface WorldMapTier {
  id: string
  name: string
  order: number
}

export interface WorldMapRealm {
  id: string
  name: string
  order: number
  note?: string
}

export interface WorldMapRegion {
  id: string
  name: string
  continent: string
  direction: WorldDirection
  terrain: string
  summary: string
  adjacentRegionIds: string[]
  controllingFactionId?: string
}

export interface WorldMapFaction {
  id: string
  name: string
  kind: WorldFactionKind
  regionId: string
  tierId: string
  resource: string
  summary: string
  leader?: string
  realmId?: string
}

export interface WorldMapRelation {
  id: string
  fromFactionId: string
  toFactionId: string
  kind: WorldRelationKind
  note?: string
}

export interface WorldMapData {
  version: typeof WORLD_MAP_VERSION
  worldName: string
  premise: string
  regions: WorldMapRegion[]
  factions: WorldMapFaction[]
  tiers: WorldMapTier[]
  realms: WorldMapRealm[]
  relations: WorldMapRelation[]
  generatedAt: string
  updatedAt: string
}

/** submit_world_map 工具参数：用名称而不是模型生成的 ID 表达引用。 */
export interface WorldMapArtifact {
  worldName: string
  premise: string
  tiers: Array<{ name: string; order?: number }>
  realms: Array<{ name: string; order?: number; note?: string }>
  regions: Array<{
    name: string
    continent: string
    direction: WorldDirection
    terrain: string
    summary: string
    adjacent: string[]
    controllingFaction?: string
  }>
  factions: Array<{
    name: string
    kind: WorldFactionKind
    region: string
    tier: string
    resource: string
    summary: string
    leader?: string
    realm?: string
  }>
  relations: Array<{
    from: string
    to: string
    kind: WorldRelationKind
    note?: string
  }>
}

export interface WorldMapLoadResult {
  success: boolean
  data?: WorldMapData | null
  error?: string
}

export interface WorldMapSaveResult {
  success: boolean
  data?: WorldMapData
  error?: string
}

const MAX_WORLD_NAME = 40
const MAX_PREMISE = 800
const MAX_REGION_NAME = 30
const MAX_CONTINENT_NAME = 30
const MAX_TERRAIN = 60
const MAX_REGION_SUMMARY = 300
const MAX_FACTION_NAME = 40
const MAX_FACTION_RESOURCE = 120
const MAX_FACTION_SUMMARY = 300
const MAX_TIER_NAME = 20
const MAX_REALM_NAME = 20
const MAX_REALM_NOTE = 120
const MAX_LEADER = 40
const MAX_RELATION_NOTE = 120
const MAX_REGIONS = 24
const MAX_FACTIONS = 40
const MAX_TIERS = 10
const MAX_REALMS = 16
const MAX_RELATIONS = 60

const DIRECTION_ALIASES: Record<string, WorldDirection> = {
  center: 'center',
  central: 'center',
  中: 'center',
  中央: 'center',
  中原: 'center',
  中部: 'center',
  north: 'north',
  北: 'north',
  北境: 'north',
  北方: 'north',
  northeast: 'northeast',
  东北: 'northeast',
  east: 'east',
  东: 'east',
  东海: 'east',
  东方: 'east',
  southeast: 'southeast',
  东南: 'southeast',
  south: 'south',
  南: 'south',
  南疆: 'south',
  南方: 'south',
  southwest: 'southwest',
  西南: 'southwest',
  west: 'west',
  西: 'west',
  西荒: 'west',
  西方: 'west',
  northwest: 'northwest',
  西北: 'northwest',
}

const FACTION_KIND_ALIASES: Record<string, WorldFactionKind> = {
  sect: 'sect',
  clan: 'sect',
  school: 'sect',
  temple: 'sect',
  宗门: 'sect',
  门派: 'sect',
  教派: 'sect',
  王朝: 'dynasty',
  dynasty: 'dynasty',
  kingdom: 'dynasty',
  empire: 'dynasty',
  帝国: 'dynasty',
  organization: 'organization',
  org: 'organization',
  guild: 'organization',
  组织: 'organization',
  势力: 'organization',
  联盟: 'organization',
}

const RELATION_KIND_ALIASES: Record<string, WorldRelationKind> = {
  ally: 'ally',
  allied: 'ally',
  alliance: 'ally',
  盟友: 'ally',
  同盟: 'ally',
  结盟: 'ally',
  enemy: 'enemy',
  hostile: 'enemy',
  敌对: 'enemy',
  仇敌: 'enemy',
  neutral: 'neutral',
  中立: 'neutral',
}

function textValue(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (!normalized || Array.from(normalized).length > max) return null
  return normalized
}

function optionalText(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = textValue(value, max)
  if (!normalized) return undefined
  return normalized
}

function normalizeDirection(value: unknown): WorldDirection | null {
  if (typeof value !== 'string') return null
  const key = value.trim().toLowerCase()
  return DIRECTION_ALIASES[key] ?? null
}

function normalizeFactionKind(value: unknown): WorldFactionKind | null {
  if (typeof value !== 'string') return null
  return FACTION_KIND_ALIASES[value.trim().toLowerCase()] ?? null
}

function normalizeRelationKind(value: unknown): WorldRelationKind | null {
  if (typeof value !== 'string') return null
  return RELATION_KIND_ALIASES[value.trim().toLowerCase()] ?? null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function compareUniqueNames(names: string[]): string | null {
  const seen = new Set<string>()
  for (const raw of names) {
    const name = raw.trim().toLocaleLowerCase()
    if (!name) continue
    if (seen.has(name)) return raw
    seen.add(name)
  }
  return null
}

function parseOrder(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * 将工具参数归一化为可持久化数据。
 *
 * 无效时返回全部问题，而不是抛异常，便于生成命令做一次带错误清单的重试，
 * 也让预览能解释为什么没有落盘。
 */
export function normalizeWorldMapArtifact(
  artifact: unknown,
  options?: { now?: string },
): { ok: true; data: WorldMapData } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!isRecord(artifact)) {
    return { ok: false, errors: ['世界地图工具参数不是对象'] }
  }

  const worldName = textValue(artifact.worldName, MAX_WORLD_NAME)
  if (!worldName) errors.push('worldName 必须是非空短文本')
  const premise = textValue(artifact.premise, MAX_PREMISE)
  if (!premise) errors.push('premise 必须是非空文本')

  const rawTiers = Array.isArray(artifact.tiers) ? artifact.tiers : []
  const rawRealms = Array.isArray(artifact.realms) ? artifact.realms : []
  const rawRegions = Array.isArray(artifact.regions) ? artifact.regions : []
  const rawFactions = Array.isArray(artifact.factions) ? artifact.factions : []
  const rawRelations = Array.isArray(artifact.relations) ? artifact.relations : []

  if (rawTiers.length < 2 || rawTiers.length > MAX_TIERS) errors.push(`tiers 需要 2–${MAX_TIERS} 档`)
  if (rawRealms.length < 2 || rawRealms.length > MAX_REALMS) errors.push(`realms 需要 2–${MAX_REALMS} 阶`)
  if (rawRegions.length < 2 || rawRegions.length > MAX_REGIONS) errors.push(`regions 需要 2–${MAX_REGIONS} 个`)
  if (rawFactions.length < 1 || rawFactions.length > MAX_FACTIONS) errors.push(`factions 需要 1–${MAX_FACTIONS} 个`)
  if (rawRelations.length > MAX_RELATIONS) errors.push(`relations 不能超过 ${MAX_RELATIONS} 条`)

  const tiers: WorldMapTier[] = rawTiers.map((tier, index) => {
    if (!isRecord(tier)) return { id: `tier-${index + 1}`, name: '', order: index + 1 }
    return {
      id: `tier-${index + 1}`,
      name: textValue(tier.name, MAX_TIER_NAME) ?? '',
      order: parseOrder(tier.order, index + 1),
    }
  }).filter((tier) => {
    if (!tier.name) errors.push(`tiers[${tier.order - 1}] 缺少名称`)
    return !!tier.name
  }).sort((left, right) => left.order - right.order).map((tier, index) => ({
    ...tier,
    id: `tier-${index + 1}`,
    order: index + 1,
  }))

  const realms: WorldMapRealm[] = rawRealms.map((realm, index) => {
    if (!isRecord(realm)) return { id: `realm-${index + 1}`, name: '', order: index + 1 }
    return {
      id: `realm-${index + 1}`,
      name: textValue(realm.name, MAX_REALM_NAME) ?? '',
      order: parseOrder(realm.order, index + 1),
      note: optionalText(realm.note, MAX_REALM_NOTE),
    }
  }).filter((realm) => {
    if (!realm.name) errors.push(`realms[${realm.order - 1}] 缺少名称`)
    return !!realm.name
  }).sort((left, right) => left.order - right.order).map((realm, index) => ({
    ...realm,
    id: `realm-${index + 1}`,
    order: index + 1,
  }))

  const tierByName = new Map(tiers.map((tier) => [tier.name.toLowerCase(), tier]))
  const realmByName = new Map(realms.map((realm) => [realm.name.toLowerCase(), realm]))

  type RegionDraft = WorldMapRegion & { _adjacentNames: string[]; _controllingName?: string }
  const regionDrafts: RegionDraft[] = rawRegions.map((region, index): RegionDraft | null => {
    if (!isRecord(region)) {
      errors.push(`regions[${index}] 不是对象`)
      return null
    }
    const name = textValue(region.name, MAX_REGION_NAME)
    const continent = textValue(region.continent, MAX_CONTINENT_NAME)
    const terrain = textValue(region.terrain, MAX_TERRAIN)
    const summary = textValue(region.summary, MAX_REGION_SUMMARY)
    const direction = normalizeDirection(region.direction)
    if (!name) errors.push(`regions[${index}] 缺少 name`)
    if (!continent) errors.push(`regions[${index}] 缺少 continent`)
    if (!terrain) errors.push(`regions[${index}] 缺少 terrain`)
    if (!summary) errors.push(`regions[${index}] 缺少 summary`)
    if (!direction) errors.push(`regions[${index}] 的 direction 无法识别`)
    if (!name || !continent || !terrain || !summary || !direction) return null
    const adjacent = Array.isArray(region.adjacent)
      ? region.adjacent
        .map(value => typeof value === 'string' ? value.trim() : '')
        .filter(Boolean)
      : []
    return {
      id: `region-${index + 1}`,
      name,
      continent,
      direction,
      terrain,
      summary,
      adjacentRegionIds: [],
      _adjacentNames: adjacent,
      _controllingName: typeof region.controllingFaction === 'string'
        ? region.controllingFaction.trim()
        : undefined,
    }
  }).filter((region): region is RegionDraft => region !== null)

  const regionByName = new Map(regionDrafts.map((region) => [region.name.toLowerCase(), region]))
  for (const region of regionDrafts) {
    const seenAdjacent = new Set<string>()
    for (const adjacentName of region._adjacentNames) {
      const target = regionByName.get(adjacentName.toLowerCase())
      if (!target) {
        errors.push(`区域「${region.name}」的相邻区域「${adjacentName}」不存在`)
        continue
      }
      if (target.id === region.id) {
        errors.push(`区域「${region.name}」不能与自己相邻`)
        continue
      }
      if (seenAdjacent.has(target.id)) continue
      seenAdjacent.add(target.id)
      region.adjacentRegionIds.push(target.id)
    }
  }

  const regions: WorldMapRegion[] = regionDrafts.map(region => ({
    id: region.id,
    name: region.name,
    continent: region.continent,
    direction: region.direction,
    terrain: region.terrain,
    summary: region.summary,
    adjacentRegionIds: region.adjacentRegionIds,
    ...(region.controllingFactionId ? { controllingFactionId: region.controllingFactionId } : {}),
  }))

  const factionCandidates: Array<WorldMapFaction | null> = rawFactions.map((faction, index): WorldMapFaction | null => {
    if (!isRecord(faction)) {
      errors.push(`factions[${index}] 不是对象`)
      return null
    }
    const name = textValue(faction.name, MAX_FACTION_NAME)
    const kind = normalizeFactionKind(faction.kind)
    const regionName = typeof faction.region === 'string' ? faction.region.trim() : ''
    const tierName = typeof faction.tier === 'string' ? faction.tier.trim() : ''
    const resource = textValue(faction.resource, MAX_FACTION_RESOURCE)
    const summary = textValue(faction.summary, MAX_FACTION_SUMMARY)
    const region = regionByName.get(regionName.toLowerCase())
    const tier = tierByName.get(tierName.toLowerCase())
    const realmName = typeof faction.realm === 'string' ? faction.realm.trim() : ''
    const realm = realmName ? realmByName.get(realmName.toLowerCase()) : undefined
    if (!name) errors.push(`factions[${index}] 缺少 name`)
    if (!kind) errors.push(`factions[${index}] 的 kind 无法识别`)
    if (!region) errors.push(`势力「${name ?? index}」的所在地「${regionName}」不存在`)
    if (!tier) errors.push(`势力「${name ?? index}」的等级「${tierName}」不存在`)
    if (!resource) errors.push(`势力「${name ?? index}」缺少 resource`)
    if (!summary) errors.push(`势力「${name ?? index}」缺少 summary`)
    if (realmName && !realm) errors.push(`势力「${name ?? index}」的境界「${realmName}」不存在`)
    if (!name || !kind || !region || !tier || !resource || !summary) return null
    return {
      id: `faction-${index + 1}`,
      name,
      kind,
      regionId: region.id,
      tierId: tier.id,
      resource,
      summary,
      leader: optionalText(faction.leader, MAX_LEADER),
      realmId: realm?.id,
    }
  })
  const factions: WorldMapFaction[] = factionCandidates.filter((faction): faction is WorldMapFaction => faction !== null)

  const factionByName = new Map(factions.map((faction) => [faction.name.toLowerCase(), faction]))
  const cleanRegionById = new Map(regions.map((region) => [region.id, region]))
  for (const region of regionDrafts) {
    const controllingName = region._controllingName ?? ''
    if (!controllingName) continue
    const controller = factionByName.get(controllingName.toLowerCase())
    if (!controller) {
      errors.push(`区域「${region.name}」的控制势力「${controllingName}」不存在`)
      continue
    }
    if (controller.regionId !== region.id) {
      errors.push(`控制势力「${controller.name}」的所在地与区域「${region.name}」不一致`)
      continue
    }
    const cleanRegion = cleanRegionById.get(region.id)
    if (cleanRegion) cleanRegion.controllingFactionId = controller.id
  }

  const relationCandidates: Array<WorldMapRelation | null> = rawRelations.map((relation, index): WorldMapRelation | null => {
    if (!isRecord(relation)) {
      errors.push(`relations[${index}] 不是对象`)
      return null
    }
    const fromName = typeof relation.from === 'string' ? relation.from.trim() : ''
    const toName = typeof relation.to === 'string' ? relation.to.trim() : ''
    const kind = normalizeRelationKind(relation.kind)
    const from = factionByName.get(fromName.toLowerCase())
    const to = factionByName.get(toName.toLowerCase())
    if (!from) errors.push(`关系起点「${fromName}」不存在`)
    if (!to) errors.push(`关系终点「${toName}」不存在`)
    if (!kind) errors.push(`relations[${index}] 的 kind 无法识别`)
    if (!from || !to || !kind) return null
    if (from.id === to.id) {
      errors.push(`势力「${from.name}」不能与自己建立关系`)
      return null
    }
    return {
      id: `relation-${index + 1}`,
      fromFactionId: from.id,
      toFactionId: to.id,
      kind,
      note: optionalText(relation.note, MAX_RELATION_NOTE),
    }
  })
  const relations: WorldMapRelation[] = relationCandidates.filter((relation): relation is WorldMapRelation => relation !== null)

  if (factions.length > 1) {
    const seenFactions = compareUniqueNames(factions.map(faction => faction.name))
    if (seenFactions) errors.push(`势力名称重复：「${seenFactions}」`)
  }
  if (regions.length > 1) {
    const seenRegions = compareUniqueNames(regions.map(region => region.name))
    if (seenRegions) errors.push(`区域名称重复：「${seenRegions}」`)
  }

  if (errors.length > 0 || !worldName || !premise) {
    return { ok: false, errors }
  }

  const now = options?.now ?? new Date().toISOString()
  return {
    ok: true,
    data: {
      version: WORLD_MAP_VERSION,
      worldName,
      premise,
      regions,
      factions,
      tiers,
      realms,
      relations,
      generatedAt: now,
      updatedAt: now,
    },
  }
}

/** 读取磁盘数据时的严格校验；不补 ID、不改写用户校对过的字段。 */
export function validateWorldMapData(value: unknown): { ok: true; data: WorldMapData } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: '世界地图数据不是对象' }
  if (value.version !== WORLD_MAP_VERSION) return { ok: false, error: '世界地图数据版本不受支持' }
  const worldName = textValue(value.worldName, MAX_WORLD_NAME)
  const premise = textValue(value.premise, MAX_PREMISE)
  if (!worldName) return { ok: false, error: '世界地图缺少 worldName' }
  if (!premise) return { ok: false, error: '世界地图缺少 premise' }
  if (!Array.isArray(value.tiers) || !Array.isArray(value.realms) || !Array.isArray(value.regions)
    || !Array.isArray(value.factions) || !Array.isArray(value.relations)) {
    return { ok: false, error: '世界地图结构不完整' }
  }
  const ids = new Set<string>()
  const addIds = (items: Array<{ id?: unknown }>, label: string): string | null => {
    for (const item of items) {
      if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim()) return `${label}缺少 id`
      if (ids.has(item.id)) return `${label} id 重复：${item.id}`
      ids.add(item.id)
    }
    return null
  }
  const tierError = addIds(value.tiers, '等级')
  if (tierError) return { ok: false, error: tierError }
  const realmError = addIds(value.realms, '境界')
  if (realmError) return { ok: false, error: realmError }
  const regionError = addIds(value.regions, '区域')
  if (regionError) return { ok: false, error: regionError }
  const factionError = addIds(value.factions, '势力')
  if (factionError) return { ok: false, error: factionError }
  const relationError = addIds(value.relations, '关系')
  if (relationError) return { ok: false, error: relationError }

  const tierIds = new Set(value.tiers.map((tier) => (tier as { id: string }).id))
  const realmIds = new Set(value.realms.map((realm) => (realm as { id: string }).id))
  const regionIds = new Set(value.regions.map((region) => (region as { id: string }).id))
  const factionIds = new Set(value.factions.map((faction) => (faction as { id: string }).id))
  for (const region of value.regions) {
    if (!isRecord(region) || !regionIds.has(region.id as string)) return { ok: false, error: '区域结构不完整' }
    if (region.controllingFactionId !== undefined && !factionIds.has(region.controllingFactionId as string)) {
      return { ok: false, error: '区域控制势力不存在' }
    }
  }
  for (const faction of value.factions) {
    if (!isRecord(faction)) return { ok: false, error: '势力结构不完整' }
    if (!regionIds.has(faction.regionId as string)) return { ok: false, error: '势力所在地不存在' }
    if (!tierIds.has(faction.tierId as string)) return { ok: false, error: '势力等级不存在' }
    if (faction.realmId !== undefined && !realmIds.has(faction.realmId as string)) {
      return { ok: false, error: '势力境界不存在' }
    }
  }
  const directionSet = new Set<string>(WORLD_DIRECTIONS)
  const factionKindSet = new Set<string>(WORLD_FACTION_KINDS)
  const relationKindSet = new Set<string>(WORLD_RELATION_KINDS)
  for (const tier of value.tiers) {
    if (!isRecord(tier) || typeof tier.name !== 'string' || !tier.name.trim() || typeof tier.order !== 'number') {
      return { ok: false, error: '势力等级结构不完整' }
    }
  }
  for (const realm of value.realms) {
    if (!isRecord(realm) || typeof realm.name !== 'string' || !realm.name.trim() || typeof realm.order !== 'number') {
      return { ok: false, error: '境界结构不完整' }
    }
    if (realm.note !== undefined && typeof realm.note !== 'string') {
      return { ok: false, error: '境界说明格式无效' }
    }
  }
  for (const region of value.regions) {
    if (!isRecord(region)
      || typeof region.name !== 'string' || !region.name.trim()
      || typeof region.continent !== 'string' || !region.continent.trim()
      || typeof region.direction !== 'string' || !directionSet.has(region.direction)
      || typeof region.terrain !== 'string'
      || typeof region.summary !== 'string'
      || !Array.isArray(region.adjacentRegionIds)
      || region.adjacentRegionIds.some((id) => typeof id !== 'string' || !regionIds.has(id))
      || (region.controllingFactionId !== undefined && typeof region.controllingFactionId !== 'string')) {
      return { ok: false, error: '区域结构不完整或引用失效' }
    }
  }
  for (const faction of value.factions) {
    if (!isRecord(faction)
      || typeof faction.name !== 'string' || !faction.name.trim()
      || typeof faction.kind !== 'string' || !factionKindSet.has(faction.kind)
      || typeof faction.regionId !== 'string' || !regionIds.has(faction.regionId)
      || typeof faction.tierId !== 'string' || !tierIds.has(faction.tierId)
      || typeof faction.resource !== 'string'
      || typeof faction.summary !== 'string'
      || (faction.leader !== undefined && typeof faction.leader !== 'string')
      || (faction.realmId !== undefined && (typeof faction.realmId !== 'string' || !realmIds.has(faction.realmId)))) {
      return { ok: false, error: '势力结构不完整或引用失效' }
    }
  }
  for (const relation of value.relations) {
    if (!isRecord(relation)
      || typeof relation.kind !== 'string'
      || !relationKindSet.has(relation.kind)
      || typeof relation.fromFactionId !== 'string'
      || typeof relation.toFactionId !== 'string'
      || !factionIds.has(relation.fromFactionId)
      || !factionIds.has(relation.toFactionId)
      || relation.fromFactionId === relation.toFactionId
      || (relation.note !== undefined && typeof relation.note !== 'string')) {
      return { ok: false, error: '势力关系结构不完整或引用失效' }
    }
  }
  return { ok: true, data: value as unknown as WorldMapData }
}

export function worldDirectionLabel(direction: WorldDirection, language: 'zh-CN' | 'en-US'): string {
  const labels: Record<WorldDirection, [string, string]> = {
    center: ['中原', 'Center'],
    north: ['北境', 'North'],
    northeast: ['东北', 'Northeast'],
    east: ['东境', 'East'],
    southeast: ['东南', 'Southeast'],
    south: ['南境', 'South'],
    southwest: ['西南', 'Southwest'],
    west: ['西境', 'West'],
    northwest: ['西北', 'Northwest'],
  }
  return language === 'en-US' ? labels[direction][1] : labels[direction][0]
}
