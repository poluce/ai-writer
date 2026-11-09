/**
 * 最近项目列表项 — 启动页的数据形状。
 *
 * 主进程在项目打开/保存时写入一份轻量写作快照，启动页无需打开项目库
 * 就能展示「上次写到哪、写了多少、进度」。快照缺失时按旧格式渲染。
 */
export interface RecentProjectSnapshot {
  /** 最近一次编辑的章节号 */
  lastChapterNumber: number
  /** 最近一次编辑的章节名（定稿标题或蓝图标题） */
  lastChapterTitle?: string
  /** 各章最新草稿字数之和 */
  totalWords: number
  /** 已定稿章节数 */
  finalizedChapters: number
  /** 计划总章数（来自小说配置） */
  totalChapters?: number
  /** 最近编辑正文的短摘录，用于「上次写到」 */
  excerpt?: string
}

export interface RecentProjectEntry {
  name: string
  path: string
  updatedAt: string
  snapshot?: RecentProjectSnapshot
}

/** 把正文压成启动页可用的一行摘录；不引入 Markdown 解析。 */
export function recentProjectExcerpt(content: string, maxChars = 72): string | undefined {
  const normalized = content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return undefined
  return normalized.length > maxChars
    ? `${normalized.slice(0, maxChars).trimEnd()}…`
    : normalized
}
