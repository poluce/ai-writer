/**
 * synopsis-outline-nodes — 把整份情节大纲拆成「章节区间节点」，供左右双栏编辑。
 *
 * 大纲正文由模型按结构拐点组织（如 `第1–20章：核对记录`、`第21章：破门`、
 * `## 第一卷` + `第22–100章：反噬`），这里做的是纯文本切分：
 * - 保留原文偏移，保存时只替换被编辑节点的正文，其余字节不变；
 * - 批次提示行（`> 本大纲已覆盖至第 N 章…`）与一级标题不属于任何节点；
 * - 标题与首个节点之间的总览文字、以及完全没有章节标注的整篇大纲，
 *   都会各自成为可编辑节点，保证全文都能改。
 */

export interface SynopsisNode {
  id: string
  /** 起始章（1 起）；总览 / 整篇兜底节点为 null。 */
  startChapter: number | null
  endChapter: number | null
  /** 归一化标签：`第1–20章` / `总览` / `全文`。 */
  label: string
  title: string
  /** 紧邻其上的卷标题（若存在）。 */
  volume?: string
  /** 原始正文切片（含首尾空白，用于原样回填）。 */
  rawBody: string
  bodyStart: number
  bodyEnd: number
}

export interface ParsedSynopsis {
  /** 一级标题文本（无则空串）。 */
  title: string
  nodes: SynopsisNode[]
  /** 批次提示行起始偏移（无则 null）。 */
  markerStart: number | null
  /** 是否存在带章节标注的节点（false 表示走了整篇兜底）。 */
  hasChapterLabels: boolean
}

interface Line {
  start: number
  end: number
  text: string
}

interface DraftNode {
  headingStart: number
  bodyStart: number
  bodyEnd?: number
  from: number
  to: number
  title: string
  volume?: string
}

const CHINESE_DIGITS: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9,
}
const CHINESE_UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }

const NUMBER_SOURCE = '[0-9]+|[零一二两三四五六七八九十百千]+'
const RANGE_SEPARATOR = '[–—~～至到]|-{1,2}'
/** 标题前必须出现分隔符或空白，避免把「第3章里主角…」这类正文当成节点。 */
const TITLE_PART = '(?:[\\s:：、.．,，\\-–—]+([\\s\\S]*))?$'
const WITH_UNIT_RANGE = new RegExp(
  `^第\\s*(${NUMBER_SOURCE})\\s*[章回节]\\s*(?:${RANGE_SEPARATOR})\\s*(?:第\\s*)?(${NUMBER_SOURCE})\\s*[章回节]?${TITLE_PART}`,
)
const BEFORE_UNIT_RANGE = new RegExp(
  `^第\\s*(${NUMBER_SOURCE})\\s*(?:${RANGE_SEPARATOR})\\s*(?:第\\s*)?(${NUMBER_SOURCE})\\s*[章回节]${TITLE_PART}`,
)
const SINGLE_CHAPTER = new RegExp(`^第\\s*(${NUMBER_SOURCE})\\s*[章回节]${TITLE_PART}`)
/** 结构节点行：范围型（带「第N章」单位）与单章型。 */
const LABEL_PATTERNS: ReadonlyArray<{ pattern: RegExp; ranged: boolean }> = [
  { pattern: WITH_UNIT_RANGE, ranged: true },
  { pattern: BEFORE_UNIT_RANGE, ranged: true },
  { pattern: SINGLE_CHAPTER, ranged: false },
]
const DOC_TITLE = /^#\s+(.+?)\s*$/
const BATCH_MARKER = /^(?:>\s*)?(?:本大纲已覆盖至第|本大纲未完成|This outline covers chapters|This outline is incomplete)/

export interface ParsedVolumeHeading {
  rawText: string
  volumeName: string
  title: string
  startChapter: number | null
  endChapter: number | null
}

/** 解析形如 `## 第一卷：车库里的硅基火种（第1-25章）` 的分卷标题 */
export function parseVolumeHeadingInfo(line: string): ParsedVolumeHeading | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('#')) return null
  const match = trimmed.match(/^#{1,6}\s*(?:第\s*([0-9零一二两三四五六七八九十百千]+)\s*卷|卷\s*([0-9零一二两三四五六七八九十百千]+))(.*)$/)
  if (!match) return null

  const numStr = match[1] || match[2]
  const volumeName = `第${numStr}卷`
  const rest = (match[3] || '').trim().replace(/^[:：\s]+/, '')

  let startChapter: number | null = null
  let endChapter: number | null = null
  let title = rest

  // 匹配括号里的章节范围：(第1-25章) 或 (1-25) 或 （第26–50章）
  const rangePattern = new RegExp(`[（(]\\s*(?:第\\s*)?(${NUMBER_SOURCE})\\s*(?:${RANGE_SEPARATOR})\\s*(?:第\\s*)?(${NUMBER_SOURCE})\\s*[章回节]?\\s*[)）]`)
  const rangeMatch = rest.match(rangePattern)
  if (rangeMatch) {
    startChapter = parseChapterNumber(rangeMatch[1])
    endChapter = parseChapterNumber(rangeMatch[2])
    title = rest.replace(rangeMatch[0], '').trim().replace(/^[:：\s–—~～-]+|[:：\s–—~～-]+$/g, '')
  }

  return {
    rawText: match[0],
    volumeName,
    title: title || volumeName,
    startChapter,
    endChapter: endChapter !== null && startChapter !== null ? Math.max(startChapter, endChapter) : endChapter,
  }
}

/** 中文数字 / 阿拉伯数字 → number；无法解析返回 null。 */
export function parseChapterNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^[0-9]+$/.test(trimmed)) {
    const parsed = Number(trimmed)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
  }
  let section = 0
  let number = 0
  for (const char of trimmed) {
    const digit = CHINESE_DIGITS[char]
    if (digit !== undefined) {
      number = digit
      continue
    }
    const unit = CHINESE_UNITS[char]
    if (unit === undefined) return null
    section += (number === 0 ? 1 : number) * unit
    number = 0
  }
  const total = section + number
  return total > 0 ? total : null
}

/**
 * 行匹配「第N章 / 第N–M章：标题」时返回章节区间与标题，否则 null。
 * 引用行属于批次提示，不参与结构识别。
 */
export function matchChapterLabel(line: string): { from: number; to: number; title: string } | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('>')) return null
  const withoutHeading = trimmed
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/\*\*/g, '')
  for (const { pattern, ranged } of LABEL_PATTERNS) {
    const match = pattern.exec(withoutHeading)
    if (!match) continue
    const from = parseChapterNumber(match[1])
    if (from === null) continue
    const to = ranged && match[2] ? parseChapterNumber(match[2]) : null
    const title = (match[match.length - 1] ?? '').trim()
    return { from, to: to === null ? from : Math.max(from, to), title }
  }
  return null
}

function toLines(text: string): Line[] {
  const lines: Line[] = []
  let start = 0
  while (start <= text.length) {
    const newline = text.indexOf('\n', start)
    if (newline === -1) {
      if (start < text.length) lines.push({ start, end: text.length, text: text.slice(start) })
      break
    }
    lines.push({ start, end: newline, text: text.slice(start, newline) })
    start = newline + 1
  }
  return lines
}

function sliceNode(text: string, draft: DraftNode, bodyEnd: number, id: string): SynopsisNode {
  return {
    id,
    startChapter: draft.from,
    endChapter: draft.to,
    label: draft.from === draft.to ? `第${draft.from}章` : `第${draft.from}–${draft.to}章`,
    title: draft.title,
    ...(draft.volume ? { volume: draft.volume } : {}),
    rawBody: text.slice(draft.bodyStart, bodyEnd),
    bodyStart: draft.bodyStart,
    bodyEnd,
  }
}

export function parseSynopsis(text: string): ParsedSynopsis {
  const lines = toLines(text)
  let title = ''
  let titleEnd = 0
  let markerStart: number | null = null
  const drafts: DraftNode[] = []
  let pendingVolume: {
    start: number
    bodyStart: number
    volumeName: string
    title: string
    from: number | null
    to: number | null
    hasChildChapters: boolean
  } | null = null
  let activeVolumeLabel: string | undefined = undefined
  let sawFirstContent = false

  const flushPendingVolume = (endPos: number) => {
    if (!pendingVolume || pendingVolume.hasChildChapters) return
    const prevTo = drafts.length > 0 && drafts[drafts.length - 1].to > 0 ? drafts[drafts.length - 1].to : 0
    const from = pendingVolume.from ?? (prevTo > 0 ? prevTo + 1 : 1)
    const to = pendingVolume.to ?? (from + 19)
    drafts.push({
      headingStart: pendingVolume.start,
      bodyStart: pendingVolume.bodyStart,
      bodyEnd: endPos,
      from,
      to,
      title: pendingVolume.title || pendingVolume.volumeName,
      volume: pendingVolume.volumeName,
    })
    pendingVolume = null
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.text.trim()
    const nextLineStart = index + 1 < lines.length ? lines[index + 1].start : text.length

    if (markerStart === null && BATCH_MARKER.test(trimmed)) {
      markerStart = line.start
      break
    }

    if (!sawFirstContent && !trimmed) continue
    if (!sawFirstContent) {
      sawFirstContent = true
      const docTitle = DOC_TITLE.exec(trimmed)
      if (docTitle) {
        title = docTitle[1]
        titleEnd = nextLineStart
        continue
      }
    }

    const vol = parseVolumeHeadingInfo(trimmed)
    if (vol) {
      if (pendingVolume && !pendingVolume.hasChildChapters) {
        flushPendingVolume(line.start)
      } else if (drafts.length > 0) {
        drafts[drafts.length - 1].bodyEnd = line.start
      }
      activeVolumeLabel = vol.volumeName + (vol.title && vol.title !== vol.volumeName ? `：${vol.title}` : '')
      pendingVolume = {
        start: line.start,
        bodyStart: nextLineStart,
        volumeName: activeVolumeLabel,
        title: vol.title,
        from: vol.startChapter,
        to: vol.endChapter,
        hasChildChapters: false,
      }
      continue
    }

    const label = matchChapterLabel(line.text)
    if (label) {
      const firstChildVolumeStart = pendingVolume && !pendingVolume.hasChildChapters ? pendingVolume.start : null
      if (drafts.length > 0) {
        if (firstChildVolumeStart === null) {
          drafts[drafts.length - 1].bodyEnd = line.start
        }
      }
      if (pendingVolume) {
        pendingVolume.hasChildChapters = true
      }
      drafts.push({
        headingStart: firstChildVolumeStart ?? line.start,
        bodyStart: nextLineStart,
        from: label.from,
        to: label.to,
        title: label.title,
        volume: activeVolumeLabel,
      })
      continue
    }
  }

  const bodyEnd = markerStart ?? text.length
  if (pendingVolume && !pendingVolume.hasChildChapters) {
    flushPendingVolume(bodyEnd)
  } else if (drafts.length > 0) {
    drafts[drafts.length - 1].bodyEnd = bodyEnd
  }

  const firstHeadingStart = drafts.length > 0 ? drafts[0].headingStart : (markerStart ?? text.length)
  // 标题与首个结构节点之间的总览文字也要可编辑。
  if (drafts.length > 0 && firstHeadingStart > titleEnd) {
    const rawBody = text.slice(titleEnd, firstHeadingStart)
    if (rawBody.trim()) {
      drafts.unshift({
        headingStart: titleEnd,
        bodyStart: titleEnd,
        bodyEnd: firstHeadingStart,
        from: -1,
        to: -1,
        title: '',
      })
    }
  }

  const nodes = drafts.map((draft, index) => {
    const end = draft.bodyEnd ?? bodyEnd
    if (draft.from === -1) {
      return {
        id: 'intro',
        startChapter: null,
        endChapter: null,
        label: '总览',
        title: '',
        rawBody: text.slice(draft.bodyStart, end),
        bodyStart: draft.bodyStart,
        bodyEnd: end,
      }
    }
    return sliceNode(text, draft, end, `${index}:${draft.from}-${draft.to}`)
  })

  if (nodes.some(node => node.startChapter !== null)) {
    return { title, nodes, markerStart, hasChapterLabels: true }
  }

  // 兜底：没有章节标注时整篇作为一个可编辑节点（标题与批次提示行除外）。
  if (bodyEnd > titleEnd) {
    const rawBody = text.slice(titleEnd, bodyEnd)
    if (rawBody.trim()) {
      return {
        title,
        nodes: [{
          id: 'full',
          startChapter: null,
          endChapter: null,
          label: '全文',
          title: '',
          rawBody,
          bodyStart: titleEnd,
          bodyEnd,
        }],
        markerStart,
        hasChapterLabels: false,
      }
    }
  }
  return { title, nodes: [], markerStart, hasChapterLabels: false }
}

/** 节点正文（去掉首尾空白）。 */
export function synopsisNodeBody(node: SynopsisNode): string {
  return node.rawBody.trim()
}

/** 用新的正文替换节点内容，其余字节原样保留（含首尾空行、批次提示行）。 */
export function replaceSynopsisNodeBody(text: string, node: SynopsisNode, body: string): string {
  const prefix = text.slice(0, node.bodyStart)
  const suffix = text.slice(node.bodyEnd)
  const leading = /^\s*/.exec(node.rawBody)?.[0] ?? ''
  const trailing = /\s*$/.exec(node.rawBody)?.[0] ?? ''
  const trimmed = body.trim()
  let replacement: string
  if (trimmed) {
    // 原始切片的首尾空白就是标题行与下一个标题之间的分隔，优先原样保留。
    let before = leading
    if (!leading.includes('\n')) {
      if (prefix.endsWith('\n') || prefix === '') before = ''
      else before = '\n'
    }
    let after = trailing
    if (!trailing.includes('\n')) {
      if (suffix) after = '\n\n'
      else after = ''
    }
    replacement = `${before}${trimmed}${after}`
  } else {
    // 正文清空时留一个空行，避免相邻标题贴在一起。
    replacement = prefix.endsWith('\n') ? '\n' : ''
  }
  return prefix + replacement + suffix
}

/** 节点覆盖到的最大章号（无带章号节点时为 0）。 */
export function maxCoveredChapter(nodes: readonly SynopsisNode[]): number {
  return nodes.reduce((max, node) => (node.endChapter && node.endChapter > max ? node.endChapter : max), 0)
}

/** 左侧列表按每 10 章折叠成一组。 */
export const SYNOPSIS_GROUP_SPAN = 10
export interface SynopsisNodeGroup {
  id: string
  /** `总览` 或 `第一卷：车库里的硅基火种` 或 `第1–10章`。 */
  label: string
  /** 卷名称（若按卷分组）。 */
  volumeName?: string
  startChapter: number | null
  endChapter: number | null
  nodes: SynopsisNode[]
  /** 拖拽分组的原始卷序号（用于拖拽重排）。 */
  volumeIndex?: number
  /** 是否支持拖拽（总览不支持，分卷支持拖拽）。 */
  draggable?: boolean
}

/** 把结构节点按分卷（Volume）分组；若无分卷标记则回退到每 10 章分组。`总览`/`全文` 单独成组。 */
export function groupSynopsisNodes(
  nodes: readonly SynopsisNode[],
  span: number = SYNOPSIS_GROUP_SPAN,
): SynopsisNodeGroup[] {
  const intro: SynopsisNode[] = []
  const chapterNodes = nodes.filter(n => {
    if (n.startChapter === null) {
      intro.push(n)
      return false
    }
    return true
  })

  const groups: SynopsisNodeGroup[] = []
  if (intro.length > 0) {
    groups.push({
      id: 'intro',
      label: '总览',
      startChapter: null,
      endChapter: null,
      nodes: intro,
      draggable: false,
    })
  }

  // 检查是否包含带 volume 的节点
  const hasVolumes = chapterNodes.some(n => Boolean(n.volume))

  if (hasVolumes) {
    // 按 volume 顺次分层归并（保持文档自然顺序）
    const volumeMap = new Map<string, SynopsisNode[]>()
    const volumeOrder: string[] = []

    for (const node of chapterNodes) {
      const volKey = node.volume || '未分卷'
      if (!volumeMap.has(volKey)) {
        volumeMap.set(volKey, [])
        volumeOrder.push(volKey)
      }
      volumeMap.get(volKey)!.push(node)
    }

    volumeOrder.forEach((volKey, idx) => {
      const groupNodes = volumeMap.get(volKey)!
      const start = Math.min(...groupNodes.map(n => n.startChapter ?? 1))
      const end = Math.max(...groupNodes.map(n => n.endChapter ?? start))
      groups.push({
        id: `vol-${idx}:${start}-${end}`,
        label: volKey,
        volumeName: volKey,
        startChapter: start,
        endChapter: end,
        nodes: groupNodes,
        volumeIndex: idx,
        draggable: volKey !== '未分卷',
      })
    })
    return groups
  }

  // 兜底：无任何分卷标记时，回退到按 10 章机械分桶
  const buckets = new Map<number, SynopsisNode[]>()
  for (const node of chapterNodes) {
    const bucketStart = Math.floor((node.startChapter! - 1) / span) * span + 1
    const bucket = buckets.get(bucketStart)
    if (bucket) bucket.push(node)
    else buckets.set(bucketStart, [node])
  }

  for (const bucketStart of [...buckets.keys()].sort((a, b) => a - b)) {
    groups.push({
      id: `${bucketStart}-${bucketStart + span - 1}`,
      label: `第${bucketStart}–${bucketStart + span - 1}章`,
      startChapter: bucketStart,
      endChapter: bucketStart + span - 1,
      nodes: buckets.get(bucketStart)!,
      draggable: false,
    })
  }
  return groups
}

/**
 * 拖动调整分卷大纲顺序：无损重排 Markdown 文本中的分卷大块。
 */
export function reorderSynopsisVolumes(
  text: string,
  fromVolumeIndex: number,
  toVolumeIndex: number,
): string {
  if (fromVolumeIndex === toVolumeIndex) return text

  const lines = toLines(text)
  const volumeStarts: number[] = []

  let markerStart: number | null = null
  for (const line of lines) {
    const trimmed = line.text.trim()
    if (markerStart === null && BATCH_MARKER.test(trimmed)) {
      markerStart = line.start
      break
    }
    const vol = parseVolumeHeadingInfo(trimmed)
    if (vol) {
      volumeStarts.push(line.start)
    }
  }

  if (volumeStarts.length < 2) return text
  if (fromVolumeIndex < 0 || fromVolumeIndex >= volumeStarts.length) return text
  if (toVolumeIndex < 0 || toVolumeIndex >= volumeStarts.length) return text

  const preambleEnd = volumeStarts[0]
  const contentEnd = markerStart ?? text.length
  const preamble = text.slice(0, preambleEnd)
  const suffix = text.slice(contentEnd)

  const volumeSlices: string[] = []
  for (let i = 0; i < volumeStarts.length; i++) {
    const start = volumeStarts[i]
    const end = i + 1 < volumeStarts.length ? volumeStarts[i + 1] : contentEnd
    let slice = text.slice(start, end)
    if (!slice.endsWith('\n')) slice += '\n'
    volumeSlices.push(slice)
  }

  const [moved] = volumeSlices.splice(fromVolumeIndex, 1)
  volumeSlices.splice(toVolumeIndex, 0, moved)

  return preamble + volumeSlices.join('') + suffix
}

/**
 * 目录高亮：根据右侧文档的滚动位置算出当前所在的段落。
 *
 * `offsets` 是各段落相对滚动容器顶部的距离；滚动到底部时直接取最后一段，
 * 避免最后一段因为不够高而永远无法被选中。
 */
export function pickCurrentNodeId(
  offsets: ReadonlyArray<{ id: string; top: number }>,
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  threshold = 32,
): string | null {
  if (offsets.length === 0) return null
  if (scrollTop + clientHeight >= scrollHeight - 4) return offsets[offsets.length - 1].id
  let current = offsets[0].id
  for (const offset of offsets) {
    if (offset.top <= threshold) current = offset.id
    else break
  }
  return current
}
