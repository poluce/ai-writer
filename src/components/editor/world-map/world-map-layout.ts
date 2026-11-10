/**
 * 世界地图构图 — 从区域方位/相邻关系推出稳定的示意图。
 *
 * 只依赖领域数据，不依赖 React；同一个项目每次渲染得到同一张图。
 * AI 不提供像素坐标，避免不同模型把地图画得无法校对。
 */
import type {
  WorldDirection,
  WorldMapData,
  WorldMapFaction,
  WorldMapRegion,
  WorldMapRelation,
} from '../../../shared/world-map'

export const WORLD_MAP_VIEWBOX = { width: 960, height: 620 } as const

const DIRECTION_ANGLES: Record<WorldDirection, number | null> = {
  center: null,
  north: -Math.PI / 2,
  northeast: -Math.PI / 4,
  east: 0,
  southeast: Math.PI / 4,
  south: Math.PI / 2,
  southwest: (3 * Math.PI) / 4,
  west: Math.PI,
  northwest: (-3 * Math.PI) / 4,
}

const REGION_FILLS = ['#EEF2E6', '#F3EADF', '#E7F0EE', '#EDEBF2', '#F1EEE3', '#E8EEF3'] as const

export interface MapPoint {
  x: number
  y: number
}

export interface RegionShape {
  region: WorldMapRegion
  center: MapPoint
  radius: number
  path: string
  fill: string
  label: MapPoint
}

export interface ContinentShape {
  name: string
  path: string
  label: MapPoint
}

export interface FactionPin {
  faction: WorldMapFaction
  region: WorldMapRegion
  point: MapPoint
  tierRank: number
  label: MapPoint
}

export interface RelationLine {
  relation: WorldMapRelation
  from: MapPoint
  to: MapPoint
}

export interface WorldMapLayout {
  regions: RegionShape[]
  continents: ContinentShape[]
  factions: FactionPin[]
  relations: RelationLine[]
  regionById: Map<string, RegionShape>
  factionById: Map<string, FactionPin>
}

function hashSeed(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function polar(center: MapPoint, angle: number, distance: number): MapPoint {
  return {
    x: center.x + Math.cos(angle) * distance,
    y: center.y + Math.sin(angle) * distance,
  }
}

/** 不规则但有边界的区域轮廓；seed 让同一区域在重绘时保持同一形状。 */
function regionBlobPath(center: MapPoint, radius: number, seedText: string): string {
  const random = mulberry32(hashSeed(seedText))
  const count = 9
  const points: MapPoint[] = []
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2
    const jitter = 0.82 + random() * 0.3
    points.push(polar(center, angle, radius * jitter))
  }

  let path = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`
  for (let index = 0; index < count; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % count]
    const afterNext = points[(index + 2) % count]
    const control1 = polar(current, Math.atan2(next.y - current.y, next.x - current.x), 0)
    const mid = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 }
    const towardAfter = { x: afterNext.x - next.x, y: afterNext.y - next.y }
    const length = Math.hypot(towardAfter.x, towardAfter.y) || 1
    const control2 = {
      x: mid.x + (towardAfter.x / length) * radius * 0.18,
      y: mid.y + (towardAfter.y / length) * radius * 0.18,
    }
    path += ` Q${control1.x.toFixed(1)},${control1.y.toFixed(1)} ${mid.x.toFixed(1)},${mid.y.toFixed(1)}`
    path += ` Q${control2.x.toFixed(1)},${control2.y.toFixed(1)} ${next.x.toFixed(1)},${next.y.toFixed(1)}`
  }
  return `${path}Z`
}

function convexHull(points: MapPoint[]): MapPoint[] {
  if (points.length <= 2) return points
  const sorted = [...points].sort((left, right) => left.x - right.x || left.y - right.y)
  const cross = (origin: MapPoint, a: MapPoint, b: MapPoint) => (
    (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
  )
  const lower: MapPoint[] = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop()
    lower.push(point)
  }
  const upper: MapPoint[] = []
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop()
    upper.push(point)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function smoothHullPath(points: MapPoint[], padding: number): string {
  if (points.length === 0) return ''
  const center = points.reduce((acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }), { x: 0, y: 0 })
  const expanded = points.map(point => {
    const dx = point.x - center.x
    const dy = point.y - center.y
    const length = Math.hypot(dx, dy) || 1
    return { x: point.x + (dx / length) * padding, y: point.y + (dy / length) * padding }
  })
  if (expanded.length === 1) {
    return regionBlobPath(expanded[0], padding * 2.2, `continent-${expanded[0].x}-${expanded[0].y}`)
  }
  if (expanded.length === 2) {
    const [left, right] = expanded
    const mid = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }
    const vertical = { x: -(right.y - left.y), y: right.x - left.x }
    const length = Math.hypot(vertical.x, vertical.y) || 1
    const top = { x: mid.x + (vertical.x / length) * padding, y: mid.y + (vertical.y / length) * padding }
    const bottom = { x: mid.x - (vertical.x / length) * padding, y: mid.y - (vertical.y / length) * padding }
    return `M${left.x},${left.y} Q${top.x},${top.y} ${right.x},${right.y} Q${bottom.x},${bottom.y} ${left.x},${left.y}Z`
  }
  let path = ''
  for (let index = 0; index < expanded.length; index += 1) {
    const current = expanded[index]
    const next = expanded[(index + 1) % expanded.length]
    const after = expanded[(index + 2) % expanded.length]
    if (index === 0) path = `M${current.x.toFixed(1)},${current.y.toFixed(1)}`
    const mid = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 }
    const towardAfter = { x: after.x - next.x, y: after.y - next.y }
    const length = Math.hypot(towardAfter.x, towardAfter.y) || 1
    const control = {
      x: mid.x + (towardAfter.x / length) * padding * 0.6,
      y: mid.y + (towardAfter.y / length) * padding * 0.6,
    }
    path += ` Q${control.x.toFixed(1)},${control.y.toFixed(1)} ${next.x.toFixed(1)},${next.y.toFixed(1)}`
  }
  return `${path}Z`
}

function initialAnchors(regions: WorldMapRegion[]): Map<WorldMapRegion, MapPoint> {
  const center = { x: WORLD_MAP_VIEWBOX.width / 2, y: WORLD_MAP_VIEWBOX.height / 2 - 4 }
  const centerRegions = regions.filter(region => region.direction === 'center')
  const others = regions.filter(region => region.direction !== 'center')
  const anchors = new Map<WorldMapRegion, MapPoint>()
  if (centerRegions.length > 0) {
    centerRegions.forEach((region, index) => {
      anchors.set(region, index === 0 ? center : polar(center, (index / centerRegions.length) * Math.PI * 2, 58))
    })
  } else if (others.length > 0) {
    anchors.set(others[0], center)
    others.shift()
  }

  const ringCount = Math.max(1, others.length)
  const ringRadius = ringCount <= 5 ? 200 : ringCount <= 8 ? 218 : 238
  const angleGroups = new Map<number, WorldMapRegion[]>()
  for (const region of others) {
    const angle = DIRECTION_ANGLES[region.direction] ?? 0
    const group = angleGroups.get(angle) ?? []
    group.push(region)
    angleGroups.set(angle, group)
  }
  for (const [angle, group] of angleGroups) {
    const spread = group.length <= 2 ? Math.PI / 5 : Math.PI / 3
    group.forEach((region, index) => {
      const offset = group.length === 1 ? 0 : (index - (group.length - 1) / 2) * spread
      anchors.set(region, polar(center, angle + offset, ringRadius))
    })
  }
  return anchors
}

function resolveRegionPositions(
  regions: WorldMapRegion[],
  radiusByRegion: Map<string, number>,
): Map<WorldMapRegion, MapPoint> {
  const anchors = initialAnchors(regions)
  const positions = new Map<WorldMapRegion, MapPoint>()
  for (const region of regions) positions.set(region, { ...(anchors.get(region) ?? { x: WORLD_MAP_VIEWBOX.width / 2, y: WORLD_MAP_VIEWBOX.height / 2 }) })

  const adjacentPairs: Array<[WorldMapRegion, WorldMapRegion]> = []
  for (const region of regions) {
    for (const adjacentId of region.adjacentRegionIds) {
      const target = regions.find(candidate => candidate.id === adjacentId)
      if (target) adjacentPairs.push([region, target])
    }
  }

  for (let iteration = 0; iteration < 90; iteration += 1) {
    const damping = 1 - iteration / 130
    for (let leftIndex = 0; leftIndex < regions.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < regions.length; rightIndex += 1) {
        const left = regions[leftIndex]
        const right = regions[rightIndex]
        const leftPoint = positions.get(left)!
        const rightPoint = positions.get(right)!
        const dx = rightPoint.x - leftPoint.x
        const dy = rightPoint.y - leftPoint.y
        const distance = Math.hypot(dx, dy) || 0.001
        const minimum = (radiusByRegion.get(left.id) ?? 60) + (radiusByRegion.get(right.id) ?? 60) + 18
        if (distance >= minimum) continue
        const push = ((minimum - distance) / 2) * 0.54 * damping
        const ux = dx / distance
        const uy = dy / distance
        leftPoint.x -= ux * push
        leftPoint.y -= uy * push
        rightPoint.x += ux * push
        rightPoint.y += uy * push
      }
    }
    for (const [left, right] of adjacentPairs) {
      const leftPoint = positions.get(left)!
      const rightPoint = positions.get(right)!
      const dx = rightPoint.x - leftPoint.x
      const dy = rightPoint.y - leftPoint.y
      const distance = Math.hypot(dx, dy) || 0.001
      const target = (radiusByRegion.get(left.id) ?? 60) + (radiusByRegion.get(right.id) ?? 60) + 24
      const pull = (target - distance) * 0.024 * damping
      const ux = dx / distance
      const uy = dy / distance
      leftPoint.x -= ux * pull
      leftPoint.y -= uy * pull
      rightPoint.x += ux * pull
      rightPoint.y += uy * pull
    }
    for (const region of regions) {
      const point = positions.get(region)!
      const anchor = anchors.get(region) ?? point
      point.x += (anchor.x - point.x) * 0.018 * damping
      point.y += (anchor.y - point.y) * 0.018 * damping
      point.x = clamp(point.x, 88, WORLD_MAP_VIEWBOX.width - 88)
      point.y = clamp(point.y, 80, WORLD_MAP_VIEWBOX.height - 72)
    }
  }
  return positions
}

export function buildWorldMapLayout(data: WorldMapData): WorldMapLayout {
  const regions = data.regions
  const radiusByRegion = new Map<string, number>()
  const centerCount = regions.filter(region => region.direction === 'center').length
  for (const region of regions) {
    const base = regions.length <= 4 ? 82 : regions.length <= 7 ? 70 : regions.length <= 10 ? 60 : 52
    radiusByRegion.set(region.id, region.direction === 'center' && centerCount === 1 ? base + 18 : base)
  }
  const positions = resolveRegionPositions(regions, radiusByRegion)
  const tierRank = new Map(data.tiers.map(tier => [tier.id, tier.order]))
  const regionById = new Map<string, RegionShape>()
  const regionShapes = regions.map((region, index) => {
    const center = positions.get(region)!
    const radius = radiusByRegion.get(region.id) ?? 60
    const worldCenter = { x: WORLD_MAP_VIEWBOX.width / 2, y: WORLD_MAP_VIEWBOX.height / 2 }
    const outwardX = center.x - worldCenter.x
    const outwardY = center.y - worldCenter.y
    const outwardLength = Math.hypot(outwardX, outwardY)
    const label = outwardLength < 1
      ? { x: center.x, y: center.y + radius * 0.72 }
      : {
          x: center.x + (outwardX / outwardLength) * radius * 0.68,
          y: center.y + (outwardY / outwardLength) * radius * 0.68,
        }
    const shape: RegionShape = {
      region,
      center,
      radius,
      path: regionBlobPath(center, radius, `${region.id}:${region.name}`),
      fill: REGION_FILLS[index % REGION_FILLS.length],
      label,
    }
    regionById.set(region.id, shape)
    return shape
  })

  const continents: ContinentShape[] = []
  const byContinent = new Map<string, RegionShape[]>()
  for (const shape of regionShapes) {
    const group = byContinent.get(shape.region.continent) ?? []
    group.push(shape)
    byContinent.set(shape.region.continent, group)
  }
  for (const [name, group] of byContinent) {
    const hull = convexHull(group.map(shape => shape.center))
    const path = smoothHullPath(hull, 36)
    const label = group.reduce((acc, shape) => ({ x: acc.x + shape.center.x / group.length, y: acc.y + shape.center.y / group.length }), { x: 0, y: 0 })
    continents.push({
      name,
      path,
      label: { x: label.x, y: Math.max(42, label.y - 58) },
    })
  }

  const factionsByRegion = new Map<string, WorldMapFaction[]>()
  for (const faction of data.factions) {
    const group = factionsByRegion.get(faction.regionId) ?? []
    group.push(faction)
    factionsByRegion.set(faction.regionId, group)
  }
  const factionPins: FactionPin[] = []
  for (const shape of regionShapes) {
    const factions = factionsByRegion.get(shape.region.id) ?? []
    factions.sort((left, right) => (tierRank.get(left.tierId) ?? 99) - (tierRank.get(right.tierId) ?? 99))
    const baseRadius = Math.min(shape.radius * 0.38, 30)
    factions.forEach((faction, index) => {
      const count = factions.length
      const angle = count === 1 ? -Math.PI / 2 : (index / count) * Math.PI * 2 - Math.PI / 2
      const distance = count === 1 ? 0 : baseRadius
      const point = polar(shape.center, angle, distance)
      factionPins.push({
        faction,
        region: shape.region,
        point,
        tierRank: tierRank.get(faction.tierId) ?? 99,
        label: { x: point.x, y: point.y - 13 },
      })
    })
  }

  const factionById = new Map(factionPins.map(pin => [pin.faction.id, pin]))
  const relations: RelationLine[] = []
  for (const relation of data.relations) {
    const from = factionById.get(relation.fromFactionId)
    const to = factionById.get(relation.toFactionId)
    if (!from || !to) continue
    relations.push({ relation, from: from.point, to: to.point })
  }

  return {
    regions: regionShapes,
    continents,
    factions: factionPins,
    relations,
    regionById,
    factionById,
  }
}

export function factionTierColor(rank: number | undefined, tierCount: number): string {
  if (rank === undefined) return 'var(--color-text-muted)'
  if (tierCount <= 1) return 'var(--color-accent)'
  const ratio = (rank - 1) / Math.max(1, tierCount - 1)
  if (ratio <= 0.16) return '#8C3B2E'
  if (ratio <= 0.42) return 'var(--color-accent)'
  if (ratio <= 0.7) return '#5F7A52'
  return '#8A6A3B'
}
