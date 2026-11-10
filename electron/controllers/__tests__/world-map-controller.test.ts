import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorldMapData } from '../../../src/shared/world-map'

vi.mock('electron', () => ({
  app: { getLocale: () => 'zh-CN' },
  ipcMain: { handle: vi.fn() },
}))

vi.mock('../../i18n', () => ({
  mainText: (_locale: string, zh: string) => zh,
}))

vi.mock('../../database', () => ({
  getCurrentProjectPath: () => null,
}))

vi.mock('../../services/project-access', () => ({
  projectAccess: {
    assertCurrentProjectContext: () => ({ rootPath: 'C:\\unused' }),
  },
}))

vi.mock('../../utils/app-log', () => ({
  appendVelaLog: vi.fn(),
}))

import { readWorldMapFile, writeWorldMapFile } from '../world-map-controller'

function sample(): WorldMapData {
  return {
    version: 1,
    worldName: '九域',
    premise: '五域以灵脉为界。',
    tiers: [
      { id: 'tier-1', name: '超一流', order: 1 },
      { id: 'tier-2', name: '一流', order: 2 },
    ],
    realms: [
      { id: 'realm-1', name: '练气', order: 1 },
      { id: 'realm-2', name: '筑基', order: 2 },
    ],
    regions: [
      { id: 'region-1', name: '中原', continent: '玄洲', direction: 'center', terrain: '平原', summary: '灵脉中心。', adjacentRegionIds: ['region-2'] },
      { id: 'region-2', name: '东海', continent: '玄洲', direction: 'east', terrain: '群岛', summary: '外海航路。', adjacentRegionIds: ['region-1'] },
    ],
    factions: [
      { id: 'faction-1', name: '天枢宗', kind: 'sect', regionId: 'region-1', tierId: 'tier-1', resource: '灵脉', summary: '垄断飞升。' },
      { id: 'faction-2', name: '太一宫', kind: 'sect', regionId: 'region-2', tierId: 'tier-2', resource: '航路', summary: '掌握外海。' },
    ],
    relations: [{ id: 'relation-1', fromFactionId: 'faction-1', toFactionId: 'faction-2', kind: 'enemy' }],
    generatedAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
  }
}

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-world-map-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('world map project file', () => {
  it('round-trips a valid map through .vela/world-map.json', () => {
    expect(readWorldMapFile(root)).toEqual({ success: true, data: null })

    const written = writeWorldMapFile(root, sample())
    expect(written.success).toBe(true)
    expect(fs.existsSync(path.join(root, '.vela', 'world-map.json'))).toBe(true)

    const loaded = readWorldMapFile(root)
    expect(loaded.success).toBe(true)
    expect(loaded.data?.worldName).toBe('九域')
    expect(loaded.data?.factions).toHaveLength(2)
  })

  it('rejects broken references and leaves the previous file untouched', () => {
    expect(writeWorldMapFile(root, sample()).success).toBe(true)
    const filePath = path.join(root, '.vela', 'world-map.json')
    const before = fs.readFileSync(filePath, 'utf8')
    const broken = sample()
    broken.factions[0].tierId = 'missing-tier'

    const result = writeWorldMapFile(root, broken)
    expect(result.success).toBe(false)
    expect(fs.readFileSync(filePath, 'utf8')).toBe(before)
  })

  it('reports corrupt JSON instead of crashing the editor', () => {
    fs.mkdirSync(path.join(root, '.vela'), { recursive: true })
    fs.writeFileSync(path.join(root, '.vela', 'world-map.json'), '{not-json', 'utf8')
    const result = readWorldMapFile(root)
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
