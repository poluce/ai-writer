import type { ProjectData, ProjectSessionContext } from '../shared/ipc-channels'
import {
  getActiveProjectSnapshot,
  projectSessionContextFromProject,
  sameProjectPathKey,
  sameProjectSessionContext,
} from '../shared/project-session-context'

/**
 * 「读当前项目」的统一入口 — 只读共享镜像，不依赖任何 Store。
 *
 * project-store 订阅自身提交并在 shared/project-session-context 登记冻结
 * 快照；Store 与 Service 读取当前项目身份时走这里，保持 services 层不
 * 反向依赖 stores 层（单向：project-store → shared ← 其它 Store/Service）。
 * 需要响应式 UI 或可变操作时仍直接使用 useProjectStore。
 */
export function readActiveProject(): ProjectData | null {
  return getActiveProjectSnapshot()
}

export function readActiveProjectSession(): ProjectSessionContext | null {
  return projectSessionContextFromProject(readActiveProject())
}

export function isActiveProjectSession(session: ProjectSessionContext): boolean {
  return sameProjectSessionContext(session, readActiveProjectSession())
}

export function matchActiveProjectSession(
  expectedProjectPath?: string,
  expectedProjectSession?: ProjectSessionContext,
): ProjectSessionContext | null {
  const project = readActiveProject()
  const projectSession = projectSessionContextFromProject(project)
  if (
    !project
    || !projectSession
    || (expectedProjectPath && !sameProjectPathKey(project.path, expectedProjectPath))
    || (expectedProjectSession && !sameProjectSessionContext(expectedProjectSession, projectSession))
  ) return null
  return projectSession
}