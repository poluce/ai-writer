import { describe, expect, it } from 'vitest'

import { sampleWorldMap } from '../../__tests__/world-map-fixture'
import {
  buildWorldMapGlobe,
  globeLinePaths,
  globePolygonPath,
  projectGlobeVector,
  vectorFromLatLon,
} from '../world-map-globe'

describe('world map globe projection', () => {
  it('derives unit-sphere region and faction geometry from the saved map', () => {
    const globe = buildWorldMapGlobe(sampleWorldMap())
    expect(globe.regions).toHaveLength(4)
    expect(globe.factions).toHaveLength(4)
    for (const region of globe.regions) {
      expect(region.polygon).toHaveLength(30)
      for (const point of region.polygon) {
        expect(Math.hypot(point.x, point.y, point.z)).toBeCloseTo(1, 5)
      }
    }
    for (const faction of globe.factions) {
      expect(Math.hypot(faction.point.x, faction.point.y, faction.point.z)).toBeCloseTo(1, 5)
    }
  })

  it('projects the front hemisphere and clips a globe polygon at the horizon', () => {
    const front = vectorFromLatLon(0, 0)
    expect(projectGlobeVector(front, { longitude: 0, latitude: 0 }, 1).depth).toBeCloseTo(1, 5)
    expect(projectGlobeVector(front, { longitude: Math.PI, latitude: 0 }, 1).depth).toBeCloseTo(-1, 5)

    const globe = buildWorldMapGlobe(sampleWorldMap())
    const region = globe.regions[0]
    expect(globePolygonPath(region.polygon, { longitude: 0, latitude: 0 }, 1)).toContain('M')
    expect(globePolygonPath(region.polygon, { longitude: Math.PI, latitude: 0 }, 1)).toBeNull()
  })

  it('splits a line at the visible horizon instead of drawing through the sphere', () => {
    const across = [
      vectorFromLatLon(0, -Math.PI / 2),
      vectorFromLatLon(0, 0),
      vectorFromLatLon(0, Math.PI / 2),
    ]
    const paths = globeLinePaths(across, { longitude: 0, latitude: 0 }, 1)
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.every(path => path.startsWith('M'))).toBe(true)
  })
})
