export interface NextChapterBlueprint {
  chapterNumber: number
  title: string
  role: string
  purpose: string
  keyEvents: string
  characters: string[]
  userGuidance: string
}

/**
 * 定稿后的自动操作只负责定位紧邻的、尚未开始创作的下一章蓝图，
 * 供调用方打开空白草稿编辑器并带入写作助手上下文；不会直接调用模型。
 */
export function getAutoNextChapterPrefill(
  enabled: boolean,
  completedChapter: number,
  blueprint: NextChapterBlueprint | null,
  hasExistingDraft: boolean,
): NextChapterBlueprint | null {
  if (!enabled || hasExistingDraft || !blueprint || blueprint.chapterNumber !== completedChapter + 1) {
    return null
  }

  return {
    chapterNumber: blueprint.chapterNumber,
    title: blueprint.title,
    role: blueprint.role,
    purpose: blueprint.purpose,
    keyEvents: blueprint.keyEvents,
    characters: [...blueprint.characters],
    userGuidance: blueprint.userGuidance || '',
  }
}
