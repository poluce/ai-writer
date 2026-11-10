/**
 * 世界地图球面投影。
 *
 * 数据层仍然只有方位与相邻关系；这里把平面布局的稳定中心点映射成
 * 经纬度，再投影到球面。球体只是另一种视图，不改变生成合同。
 */
import type { WorldDirection, WorldMapData, WorldMapFaction, WorldMapRegion } from '../../../shared/world-map'
import {
  buildWorldMapLayout,
  factionTierColor,
  WORLD_MAP_VIEWBOX,
} from './world-map-layout'

export const WORLD_MAP_GLOBE = {
  width: WORLD_MAP_VIEWBOX.width,
  height: WORLD_MAP_VIEWBOX.height,
  center: { x: WORLD_MAP_VIEWBOX.width / 2, y: WORLD_MAP_VIEWBOX.height / 2 },
  radius: 236,
} as const

export interface GlobeVector {
  x: number
  y: number
  z: number
}

export interface GlobeRotation {
  longitude: number
  latitude: number
}

export interface GlobeProjectedPoint {
  x: number
  y: number
  depth: number
}

export interface GlobeRegionShape {
  region: WorldMapRegion
  center: GlobeVector
  label: GlobeVector
  polygon: GlobeVector[]
  fill: string
}

export interface GlobeFactionPin {
  faction: WorldMapFaction
  region: WorldMapRegion
  point: GlobeVector
  tierRank: number
  color: string
}

export interface GlobeRelation {
  from: GlobeVector
  to: GlobeVector
  kind: 'ally' | 'enemy' | 'neutral'
}

export interface GlobeLayout {
  regions: GlobeRegionShape[]
  factions: GlobeFactionPin[]
  relations: GlobeRelation[]
  graticuleLat: GlobeVector[][]
  graticuleLon: GlobeVector[][]
  regionById: Map<string, GlobeRegionShape>
  factionById: Map<string, GlobeFactionPin>
}

const DEG = Math.PI / 180

/** 方位到球面中心：纬度 / 经度（弧度）。 */
const DIRECTION_COORDS: Record<WorldDirection, readonly [number, number]> = {
  center: [0.12, 0],
  north: [0.98, 0],
  northeast: [0.7, 0.75],
  east: [0.1, 0.9],
  southeast: [-0.7, 0.75],
  south: [-0.98, 0],
  southwest: [-0.7, -0.75],
  west: [0.1, -0.9],
  northwest: [0.7, -0.75],
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function hashSeed(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

function seededNoise(seed: number): number {
  let state = seed >>> 0
  state += 0x6d2b79f5
  let value = state
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}

/** 经纬度转球面单位向量。经度 0 位于球心朝向观察者的位置。 */
export function vectorFromLatLon(latitude: number, longitude: number): GlobeVector {
  const lat = clamp(latitude, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02)
  const cosLat = Math.cos(lat)
  return {
    x: cosLat * Math.sin(longitude),
    y: Math.sin(lat),
    z: cosLat * Math.cos(longitude),
  }
}

/** 从起点沿大圆走指定角距离。 */
function destination(latitude: number, longitude: number, bearing: number, distance: number): GlobeVector {
  const lat1 = latitude
  const lon1 = longitude
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distance)
    + Math.cos(lat1) * Math.sin(distance) * Math.cos(bearing),
  )
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(distance) * Math.cos(lat1),
    Math.cos(distance) - Math.sin(lat1) * Math.sin(lat2),
  )
  return vectorFromLatLon(lat2, lon2)
}

/** 球面两点之间的大圆插值。 */
export function interpolateGreatCircle(from: GlobeVector, to: GlobeVector, t: number): GlobeVector {
  const dot = clamp(from.x * to.x + from.y * to.y + from.z * to.z, -1, 1)
  const omega = Math.acos(dot)
  if (omega < 0.0001) {
    return { x: from.x, y: from.y, z: from.z }
  }
  const sinOmega = Math.sin(omega)
  const left = Math.sin((1 - t) * omega) / sinOmega
  const right = Math.sin(t * omega) / sinOmega
  return {
    x: from.x * left + to.x * right,
    y: from.y * left + to.y * right,
    z: from.z * left + to.z * right,
  }
}

/** 将世界旋转到观察坐标系；z > 0 为可见半球。 */
export function rotateGlobeVector(point: GlobeVector, rotation: GlobeRotation): GlobeVector {
  const cosLon = Math.cos(rotation.longitude)
  const sinLon = Math.sin(rotation.longitude)
  const x = point.x * cosLon - point.z * sinLon
  const z = point.x * sinLon + point.z * cosLon
  const cosLat = Math.cos(rotation.latitude)
  const sinLat = Math.sin(rotation.latitude)
  return {
    x,
    y: point.y * cosLat - z * sinLat,
    z: point.y * sinLat + z * cosLat,
  }
}

export function projectGlobeVector(
  point: GlobeVector,
  rotation: GlobeRotation,
  zoom: number,
): GlobeProjectedPoint {
  const rotated = rotateGlobeVector(point, rotation)
  const radius = WORLD_MAP_GLOBE.radius * zoom
  return {
    x: WORLD_MAP_GLOBE.center.x + rotated.x * radius,
    y: WORLD_MAP_GLOBE.center.y - rotated.y * radius,
    depth: rotated.z,
  }
}

/** 裁剪到可见半球，避免背面顶点被镜像投影到球面正面。 */
function clipToFront(points: GlobeVector[]): GlobeVector[] {
  const clipped: GlobeVector[] = []
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const currentInside = current.z >= 0
    const nextInside = next.z >= 0
    if (currentInside) clipped.push(current)
    if (currentInside !== nextInside) {
      const t = current.z / (current.z - next.z)
      const x = current.x + (next.x - current.x) * t
      const y = current.y + (next.y - current.y) * t
      const length = Math.hypot(x, y)
      clipped.push({ x: x / length, y: y / length, z: 0 })
    }
  }
  return clipped
}

export function globePolygonPath(
  points: GlobeVector[],
  rotation: GlobeRotation,
  zoom: number,
): string | null {
  const rotated = points.map(point => rotateGlobeVector(point, rotation))
  const visible = clipToFront(rotated)
  if (visible.length < 3) return null
  const radius = WORLD_MAP_GLOBE.radius * zoom
  return visible.map((point, index) => {
    const x = WORLD_MAP_GLOBE.center.x + point.x * radius
    const y = WORLD_MAP_GLOBE.center.y - point.y * radius
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ') + ' Z'
}

/** 将球面折线投影为若干可见路径；跨越背面时断开。 */
export function globeLinePaths(
  points: GlobeVector[],
  rotation: GlobeRotation,
  zoom: number,
): string[] {
  const radius = WORLD_MAP_GLOBE.radius * zoom
  const paths: string[] = []
  let current: string[] = []
  for (const point of points) {
    const rotated = rotateGlobeVector(point, rotation)
    if (rotated.z >= 0) {
      const x = WORLD_MAP_GLOBE.center.x + rotated.x * radius
      const y = WORLD_MAP_GLOBE.center.y - rotated.y * radius
      current.push(`${current.length === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    } else if (current.length > 1) {
      paths.push(current.join(' '))
      current = []
    } else {
      current = []
    }
  }
  if (current.length > 1) paths.push(current.join(' '))
  return paths
}

function buildRegionPolygon(
  latitude: number,
  longitude: number,
  angularRadius: number,
  seed: string,
): GlobeVector[] {
  const count = 30
  const points: GlobeVector[] = []
  for (let index = 0; index < count; index += 1) {
    const bearing = (index / count) * Math.PI * 2
    const jitter = 0.84 + seededNoise(hashSeed(`${seed}:${index}`)) * 0.24
    points.push(destination(latitude, longitude, bearing, angularRadius * jitter))
  }
  return points
}

export function buildWorldMapGlobe(data: WorldMapData): GlobeLayout {
  const flat = buildWorldMapLayout(data)
  const byDirection = new Map<WorldDirection, WorldMapRegion[]>()
  for (const region of data.regions) {
    const group = byDirection.get(region.direction) ?? []
    group.push(region)
    byDirection.set(region.direction, group)
  }

  const regionById = new Map<string, GlobeRegionShape>()
  const regions: GlobeRegionShape[] = []
  const angularRadius = clamp(0.44 - data.regions.length * 0.02, 0.22, 0.38)
  for (const [direction, group] of byDirection) {
    const base = DIRECTION_COORDS[direction]
    group.forEach((region, index) => {
      const stackOffset = group.length > 1
        ? (index - (group.length - 1) / 2) * 0.34
        : 0
      const latitude = clamp(base[0] + (group.length > 1 ? (index % 2 === 0 ? -0.06 : 0.06) : 0), -1.12, 1.12)
      const longitude = base[1] + stackOffset
      const center = vectorFromLatLon(latitude, longitude)
      const shape: GlobeRegionShape = {
        region,
        center,
        label: destination(latitude, longitude, Math.PI, angularRadius * 0.62),
        polygon: buildRegionPolygon(latitude, longitude, angularRadius, `${region.id}:${region.name}`),
        fill: flat.regionById.get(region.id)?.fill ?? '#E8EDF3',
      }
      regionById.set(region.id, shape)
      regions.push(shape)
    })
  }

  const factionsByRegion = new Map<string, WorldMapFaction[]>()
  for (const faction of data.factions) {
    const group = factionsByRegion.get(faction.regionId) ?? []
    group.push(faction)
    factionsByRegion.set(faction.regionId, group)
  }
  const tierOrder = new Map(data.tiers.map(tier => [tier.id, tier.order]))
  const factionById = new Map<string, GlobeFactionPin>()
  const factions: GlobeFactionPin[] = []
  for (const shape of regions) {
    const group = factionsByRegion.get(shape.region.id) ?? []
    const latitude = Math.asin(shape.center.y)
    const longitude = Math.atan2(shape.center.x, shape.center.z)
    group.forEach((faction, index) => {
      const bearing = group.length === 1
        ? -Math.PI / 2
        : (-Math.PI / 2) + (index / group.length) * Math.PI * 2
      const angularOffset = angularRadius * (group.length === 1 ? 0.32 : 0.5)
      const point = destination(latitude, longitude, bearing, angularOffset)
      const tierRank = tierOrder.get(faction.tierId) ?? 99
      const pin: GlobeFactionPin = {
        faction,
        region: shape.region,
        point,
        tierRank,
        color: factionTierColor(tierRank, data.tiers.length),
      }
      factionById.set(faction.id, pin)
      factions.push(pin)
    })
  }

  const relations: GlobeRelation[] = []
  for (const relation of data.relations) {
    const from = factionById.get(relation.fromFactionId)
    const to = factionById.get(relation.toFactionId)
    if (!from || !to) continue
    relations.push({ from: from.point, to: to.point, kind: relation.kind })
  }

  const graticuleLat: GlobeVector[][] = []
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const line: GlobeVector[] = []
    for (let longitude = -180; longitude <= 180; longitude += 4) {
      line.push(vectorFromLatLon(latitude * DEG, longitude * DEG))
    }
    graticuleLat.push(line)
  }
  const graticuleLon: GlobeVector[][] = []
  for (let longitude = -180; longitude < 180; longitude += 30) {
    const line: GlobeVector[] = []
    for (let latitude = -80; latitude <= 80; latitude += 4) {
      line.push(vectorFromLatLon(latitude * DEG, longitude * DEG))
    }
    graticuleLon.push(line)
  }

  return { regions, factions, relations, graticuleLat, graticuleLon, regionById, factionById }
}

/** 关系线中间点，用于把势力连接成球面弧。 */
export function globeRelationPoints(from: GlobeVector, to: GlobeVector): GlobeVector[] {
  const points: GlobeVector[] = []
  for (let index = 0; index <= 28; index += 1) {
    points.push(interpolateGreatCircle(from, to, index / 28))
  }
  return points
}
