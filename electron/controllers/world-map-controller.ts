/**
 * 世界地图项目文件 — 受控读写 `.vela/world-map.json`。
 *
 * 世界地图是有版本的领域数据，不进入 NovelConfig，也不由模型直接写盘。
 * 生成结果先由渲染层预览，确认后才通过这个通道提交。
 */
import fs from 'node:fs'
import path from 'node:path'
import { app, ipcMain } from 'electron'

import type { ProjectSessionContext } from '../../src/shared/ipc-channels'
import {
  validateWorldMapData,
  type WorldMapLoadResult,
  type WorldMapSaveResult,
} from '../../src/shared/world-map'
import { getCurrentProjectPath } from '../database'
import { projectAccess } from '../services/project-access'
import { mainText } from '../i18n'
import {
  assertProjectFilePath,
  assertRequiredExpectedProjectPath,
} from '../utils/project-context'
import { appendVelaLog } from '../utils/app-log'
import { writeJsonFile } from '../utils/config-utils'

const WORLD_MAP_RELATIVE_PATH = path.join('.vela', 'world-map.json')
const MAX_WORLD_MAP_FILE_BYTES = 1024 * 1024

function text(zhCNText: string, enUSText: string): string {
  return mainText(app.getLocale(), zhCNText, enUSText)
}

function worldMapPath(projectRoot: string): string {
  return path.join(projectRoot, WORLD_MAP_RELATIVE_PATH)
}

/** 读文件并按领域校验；供 IPC 与测试共用。 */
export function readWorldMapFile(projectRoot: string): WorldMapLoadResult {
  const filePath = worldMapPath(projectRoot)
  if (!fs.existsSync(filePath)) return { success: true, data: null }
  assertProjectFilePath(filePath, projectRoot, 'existing')
  const stat = fs.statSync(filePath)
  if (!stat.isFile() || stat.size > MAX_WORLD_MAP_FILE_BYTES) {
    throw new Error(text('世界地图文件大小不受支持', 'The world map file is not a supported size'))
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
  } catch {
    return { success: false, error: text('世界地图文件已损坏，无法解析', 'The world map file is corrupt and could not be parsed') }
  }
  const validated = validateWorldMapData(parsed)
  if (!validated.ok) return { success: false, error: validated.error }
  return { success: true, data: validated.data }
}

/** 原子写文件并回读；不负责项目会话授权。 */
export function writeWorldMapFile(projectRoot: string, data: unknown): WorldMapSaveResult {
  const validated = validateWorldMapData(data)
  if (!validated.ok) return { success: false, error: validated.error }
  const filePath = worldMapPath(projectRoot)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  assertProjectFilePath(filePath, projectRoot, 'writable')
  writeJsonFile(filePath, validated.data)
  return { success: true, data: validated.data }
}

export function registerWorldMapController(): void {
  ipcMain.handle(
    'world-map:load',
    async (
      _event,
      expectedProjectPath: string,
      context: ProjectSessionContext,
    ): Promise<WorldMapLoadResult> => {
      try {
        const active = projectAccess.assertCurrentProjectContext(context, getCurrentProjectPath())
        assertRequiredExpectedProjectPath(active.rootPath, expectedProjectPath)
        return readWorldMapFile(active.rootPath)
      } catch (error) {
        appendVelaLog({
          ts: new Date().toISOString(),
          level: 'error',
          scope: 'WorldMap',
          event: 'load-failed',
          error: { message: error instanceof Error ? error.message : String(error) },
        })
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  )

  ipcMain.handle(
    'world-map:save',
    async (
      _event,
      expectedProjectPath: string,
      data: unknown,
      context: ProjectSessionContext,
    ): Promise<WorldMapSaveResult> => {
      try {
        const active = projectAccess.assertCurrentProjectContext(context, getCurrentProjectPath())
        assertRequiredExpectedProjectPath(active.rootPath, expectedProjectPath)
        return writeWorldMapFile(active.rootPath, data)
      } catch (error) {
        appendVelaLog({
          ts: new Date().toISOString(),
          level: 'error',
          scope: 'WorldMap',
          event: 'save-failed',
          error: { message: error instanceof Error ? error.message : String(error) },
        })
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  )
}
