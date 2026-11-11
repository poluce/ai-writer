import type { BlueprintData } from '../shared/blueprint'
import type { ProjectSessionContext } from '../shared/ipc-channels'
import { ipc } from './ipc-client'

export type ChapterBlueprint = BlueprintData

export {
  parseTextBlueprints,
  parseTextBlueprintsStrict,
  commitDirectoryBlueprintRange,
} from './workflows/blueprint-persistence'

export function assertBlueprintCoverage(
  blueprints: ChapterBlueprint[],
  startChapter: number,
  endChapter: number,
): void {
  const chapterSet = new Set(blueprints.map((item) => item.chapterNumber))
  const missing: number[] = []
  for (let chapter = startChapter; chapter <= endChapter; chapter++) {
    if (!chapterSet.has(chapter)) missing.push(chapter)
  }

  if (missing.length > 0) {
    throw new Error(`蓝图缺少目标章节：第 ${missing.join('、')} 章`)
  }
}

export async function loadDirectoryBlueprints(
  expectedProjectPath: string,
  projectSession: ProjectSessionContext,
): Promise<ChapterBlueprint[]> {
  const blueprints = await ipc.invokeWithProjectSession(projectSession, 'db:blueprint-get-all', expectedProjectPath)
  return blueprints.sort((a, b) => a.chapterNumber - b.chapterNumber)
}

function assertIpcSuccess(result: { success: boolean; error?: string }, action: string): void {
  if (!result.success) {
    throw new Error(result.error || `${action}失败`)
  }
}

export async function saveChapterBlueprint(
  blueprint: ChapterBlueprint,
  expectedProjectPath: string,
  projectSession: ProjectSessionContext,
): Promise<void> {
  const result = await ipc.invokeWithProjectSession(projectSession, 'db:blueprint-upsert', blueprint, expectedProjectPath)
  assertIpcSuccess(result, '保存章节蓝图')
}

export async function saveAllBlueprints(
  blueprints: ChapterBlueprint[],
  expectedProjectPath: string,
  projectSession: ProjectSessionContext,
): Promise<void> {
  const result = await ipc.invokeWithProjectSession(projectSession, 'db:blueprint-upsert-many', blueprints, expectedProjectPath)
  assertIpcSuccess(result, '保存章节蓝图')
}

export async function verifyBlueprintsPersisted(
  blueprints: ChapterBlueprint[],
  expectedProjectPath: string,
  expectedRange?: { startChapter: number; endChapter: number },
  projectSession?: ProjectSessionContext,
): Promise<void> {
  if (!projectSession) throw new Error('验证章节蓝图时缺少冻结项目会话')
  if (expectedRange) {
    assertBlueprintCoverage(blueprints, expectedRange.startChapter, expectedRange.endChapter)
  }

  for (const blueprint of blueprints) {
    const saved = await ipc.invokeWithProjectSession(projectSession, 'db:blueprint-get', blueprint.chapterNumber, expectedProjectPath)
    if (!saved) {
      throw new Error(`蓝图保存后验证失败：第 ${blueprint.chapterNumber} 章未写入数据库`)
    }
    if (
      saved.title !== blueprint.title ||
      saved.role !== blueprint.role ||
      saved.purpose !== blueprint.purpose ||
      saved.keyEvents !== blueprint.keyEvents ||
      saved.suspenseHook !== blueprint.suspenseHook
    ) {
      throw new Error(`蓝图保存后验证失败：第 ${blueprint.chapterNumber} 章内容与预期不一致`)
    }
  }
}

export async function getBlueprintCount(
  expectedProjectPath: string,
  projectSession: ProjectSessionContext,
): Promise<number> {
  try {
    const blueprints = await ipc.invokeWithProjectSession(projectSession, 'db:blueprint-get-all', expectedProjectPath)
    return blueprints.length
  } catch {
    return 0
  }
}
