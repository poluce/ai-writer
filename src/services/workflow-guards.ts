/**
 * 工作流前置校验工具（保留定稿后处理修复校验）。
 */

import { useProjectStore } from '../stores/project-store'
import { ipc } from './ipc-client'
import type { ProjectData, ProjectSessionContext } from '../shared/ipc-channels'
import {
  projectSessionContextFromProject,
  sameProjectPathKey,
  sameProjectSessionContext,
} from '../shared/project-session-context'

export interface GuardResult {
  ok: boolean
  /** 失败时的提示语（给用户看） */
  message?: string
  /** 用于跳转引导的目标动作标识 */
  action?: 'open-config' | 'open-world-building' | 'open-blueprint'
}

function captureGuardProject(
  expectedProjectPath?: string,
  expectedProjectSession?: ProjectSessionContext,
): { project: ProjectData; projectPath: string; projectSession: ProjectSessionContext } | null {
  const project = useProjectStore.getState().currentProject
  const projectSession = projectSessionContextFromProject(project)
  if (
    !project
    || !projectSession
    || (expectedProjectPath && !sameProjectPathKey(project.path, expectedProjectPath))
    || (expectedProjectSession && !sameProjectSessionContext(expectedProjectSession, projectSession))
  ) return null
  return { project, projectPath: expectedProjectPath ?? project.path, projectSession }
}

/**
 * 修复定稿后处理的前置校验：
 * 不变量：后处理只允许在最新定稿章节上执行，
 * 回溯重跑历史章节会覆盖后续章节的角色状态。
 */
export async function guardRepairPostProcess(
  chapterNumber: number,
  expectedProjectPath?: string,
  expectedProjectSession?: ProjectSessionContext,
): Promise<GuardResult> {
  const captured = captureGuardProject(expectedProjectPath, expectedProjectSession)
  if (!captured) {
    return { ok: false, message: '请先打开或新建一个项目。' }
  }

  const maxFinalized = await ipc.invokeWithProjectSession(
    captured.projectSession,
    'db:draft-get-max-finalized-chapter',
    captured.projectPath,
  )

  if (maxFinalized === 0) {
    return { ok: false, message: '尚无已定稿章节，无法执行修复操作。' }
  }

  if (chapterNumber !== maxFinalized) {
    return {
      ok: false,
      message: `只允许修复最新定稿章节（第 ${maxFinalized} 章）的后处理。\n\n回溯修复第 ${chapterNumber} 章会破坏角色状态的线性演化链。`,
    }
  }

  return { ok: true }
}
