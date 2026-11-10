/**
 * 世界地图读写 — 渲染层只经项目会话访问 `.vela/world-map.json`。
 */
import { ipc } from './ipc-client'
import type { ProjectSessionContext } from '../shared/ipc-channels'
import type {
  WorldMapData,
  WorldMapLoadResult,
  WorldMapSaveResult,
} from '../shared/world-map'

export async function loadWorldMap(projectSession: ProjectSessionContext): Promise<WorldMapLoadResult> {
  return ipc.invokeWithProjectSession(
    projectSession,
    'world-map:load',
    projectSession.projectPath,
  )
}

export async function saveWorldMap(
  projectSession: ProjectSessionContext,
  data: WorldMapData,
): Promise<WorldMapSaveResult> {
  return ipc.invokeWithProjectSession(
    projectSession,
    'world-map:save',
    projectSession.projectPath,
    data,
  )
}
