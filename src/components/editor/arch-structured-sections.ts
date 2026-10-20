export interface ActiveSectionItem {
  id: string
  title: string
  content: string
  placeholder?: string
  hasExplicitHeader: boolean
  level?: number
}

export interface ParsedArchDocument {
  documentTitle?: string
  sections: ActiveSectionItem[]
}

/**
 * 动态将 Markdown 解析为结构化小节，完全忠于原文：
 * 1. 自动识别并剥离文档首部的一级总标题（Document Title，如 "# 故事前提 (Premise)"），避免其生成空卡片；
 * 2. 智能识别主卡片分块层级（优先以二级大标题 "##" 划分卡片）；
 * 3. 三级标题（"###"）、四级标题（"####"）、列表项及段落完整归属于该大节的正文内容；
 * 4. 自动去除小节首尾遗留的独立 "---" 分割线。
 */
export function parseDynamicArchSections(
  defaultTitle: string,
  markdown: string,
): ParsedArchDocument {
  const trimmed = markdown.trim()
  if (!trimmed) {
    return {
      sections: [
        {
          id: 'sec_0',
          title: defaultTitle,
          content: '',
          hasExplicitHeader: false,
          level: 2,
        },
      ],
    }
  }

  const lines = markdown.split(/\r?\n/)

  // 1. 扫描每一行的标题类型及层级
  const lineInfos = lines.map((line, idx) => {
    const l = line.trim()
    const md = l.match(/^(#{1,4})\s+(.+)$/)
    if (md) {
      const cleanTitle = md[2].trim().replace(/^\*\*|\*\*$/g, '').trim()
      return { idx, isHeader: true, level: md[1].length, title: cleanTitle, raw: line }
    }
    const cnNum = l.match(/^[一二三四五六七八九十]+[、.\s]+(.+)$/)
    if (cnNum && l.length < 60) {
      return { idx, isHeader: true, level: 2, title: l.replace(/^\*\*|\*\*$/g, '').trim(), raw: line }
    }
    const bracketNum = l.match(/^[0-9]+[、.\s]+【(.+?)】/)
    if (bracketNum && l.length < 60) {
      return { idx, isHeader: true, level: 2, title: bracketNum[1].trim(), raw: line }
    }
    return { idx, isHeader: false, level: 99, title: '', raw: line }
  })

  // 2. 识别文档首部的 Document Title（例如单个 `# 故事前提` 或 `# 世界观与设定`）
  let startIndex = 0
  let documentTitle: string | undefined = undefined
  const firstNonEmpty = lineInfos.find(li => li.raw.trim().length > 0)
  if (firstNonEmpty && firstNonEmpty.isHeader && firstNonEmpty.level === 1) {
    const subsequentHeaders = lineInfos.slice(firstNonEmpty.idx + 1).filter(li => li.isHeader)
    if (subsequentHeaders.length > 0) {
      documentTitle = firstNonEmpty.title
      startIndex = firstNonEmpty.idx + 1
    }
  }

  // 3. 计算用于分割顶层卡片的 targetLevel
  const availableHeaders = lineInfos.slice(startIndex).filter(li => li.isHeader)
  let targetLevel = 2 // 默认以二级大标题 ## 划分卡片
  if (availableHeaders.length > 0) {
    const levels = availableHeaders.map(h => h.level)
    if (levels.includes(2)) {
      targetLevel = 2
    } else {
      targetLevel = Math.min(...levels)
    }
  }

  // 4. 按 targetLevel 进行分块，子标题（### 等）及内部段落均归入该卡片正文
  const sections: ActiveSectionItem[] = []
  let currentTitle = ''
  let currentLines: string[] = []
  let hasExplicitHeader = false
  let currentLevel = targetLevel
  let secIdx = 0

  for (let i = startIndex; i < lines.length; i++) {
    const info = lineInfos[i]
    const isTargetHeader = info.isHeader && info.level <= targetLevel

    if (isTargetHeader) {
      if (currentTitle || currentLines.length > 0) {
        const body = currentLines.join('\n').trim().replace(/^---+|---+$/g, '').trim()
        if (hasExplicitHeader || body.length > 0) {
          sections.push({
            id: `sec_${secIdx++}`,
            title: currentTitle || defaultTitle,
            content: body,
            hasExplicitHeader,
            level: currentLevel,
          })
        }
      }
      currentTitle = info.title
      hasExplicitHeader = true
      currentLevel = info.level
      currentLines = []
    } else {
      currentLines.push(lines[i])
    }
  }

  if (currentTitle || currentLines.length > 0) {
    const body = currentLines.join('\n').trim().replace(/^---+|---+$/g, '').trim()
    if (hasExplicitHeader || body.length > 0) {
      sections.push({
        id: `sec_${secIdx++}`,
        title: currentTitle || defaultTitle,
        content: body,
        hasExplicitHeader,
        level: currentLevel,
      })
    }
  }

  if (sections.length === 0) {
    sections.push({
      id: 'sec_0',
      title: defaultTitle,
      content: trimmed,
      hasExplicitHeader: false,
      level: 2,
    })
  }

  return { documentTitle, sections }
}

/**
 * 将结构化小节序列化回 Markdown 文本，完全忠于原文：
 * - 保留原文档首部的 Document Title（若存在）；
 * - 若只有单个无显式标题小节，直接输出正文；
 * - 各卡片按原层级前缀（如 ##）规范序列化。
 */
export function serializeDynamicArchSections(
  sections: ActiveSectionItem[],
  documentTitle?: string,
): string {
  if (sections.length === 1 && !sections[0].hasExplicitHeader) {
    const body = sections[0].content.trim()
    if (documentTitle) {
      return `# ${documentTitle}\n\n${body}\n`
    }
    return body ? `${body}\n` : ''
  }

  const parts: string[] = []
  if (documentTitle) {
    parts.push(`# ${documentTitle}`)
  }

  for (const s of sections) {
    const body = s.content.trim()
    if (!s.hasExplicitHeader) {
      if (body) parts.push(body)
      continue
    }
    const prefix = '#'.repeat(s.level ?? 2)
    const title = s.title.trim()
    if (body) {
      parts.push(`${prefix} ${title}\n\n${body}`)
    } else if (title) {
      parts.push(`${prefix} ${title}`)
    }
  }

  return parts.join('\n\n').trim() + '\n'
}
