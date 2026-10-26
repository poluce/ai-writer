import { describe, expect, it } from 'vitest'

import {
  buildReviewDocument,
  countDraftCharacters,
  splitInlineMarkdown,
  splitReviewBlocks,
  splitReviewSegments,
  type ReviewAnnotationItem,
} from '../review-annotations'

function item(overrides: Partial<ReviewAnnotationItem> & { id: string }): ReviewAnnotationItem {
  return {
    category: '情节逻辑',
    severity: 'warning',
    ...overrides,
  }
}

describe('splitReviewBlocks', () => {
  it('把非空行切成段落并去掉首尾空白', () => {
    const blocks = splitReviewBlocks('第一段。\n\n  第二段。  \n')
    expect(blocks).toEqual([
      { index: 0, kind: 'text', text: '第一段。' },
      { index: 1, kind: 'text', text: '第二段。' },
    ])
  })

  it('围栏代码块标记为 code，围栏本身不渲染，保留代码缩进', () => {
    const blocks = splitReviewBlocks('开头。\n```c\nint main(void) {\n  return 0;\n}\n```\n结尾。')
    expect(blocks.map(block => [block.kind, block.text])).toEqual([
      ['text', '开头。'],
      ['code', 'int main(void) {'],
      ['code', '  return 0;'],
      ['code', '}'],
      ['text', '结尾。'],
    ])
    expect(blocks.map(block => block.index)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('buildReviewDocument', () => {
  const content = [
    '2026年，初秋的夜里十一点。',
    '“第四次了。我让代码智能体按需求重构接口，结果陷进死循环里了。”',
    '大平层工位区里，零星响起几声叹息。',
    '他拉开工作台下层那个带防磁保护的小抽屉，取出了一枚三防U盘。',
  ].join('\n')

  it('按正文顺序编号并给出行内偏移', () => {
    const document = buildReviewDocument([
      item({ id: 'later', severity: 'error', quote: '取出了一枚三防U盘' }),
      item({ id: 'earlier', quote: '陷进死循环里了' }),
    ], content)

    expect(document.annotations).toHaveLength(2)
    expect(document.annotations.map(annotation => [annotation.itemId, annotation.number, annotation.blockIndex]))
      .toEqual([['earlier', 1, 1], ['later', 2, 3]])
    const later = document.annotations[1]
    expect(document.blocks[later.blockIndex].text.slice(later.from, later.to)).toBe('取出了一枚三防U盘')
  })

  it('跳过通过项、缺少 quote 或 quote 无法命中的意见', () => {
    const document = buildReviewDocument([
      item({ id: 'pass', severity: 'pass', quote: '2026年' }),
      item({ id: 'no-quote' }),
      item({ id: 'missing', quote: '这段原文不存在' }),
      item({ id: 'hit', quote: '零星响起几声叹息' }),
    ], content)

    expect(document.annotations.map(annotation => annotation.itemId)).toEqual(['hit'])
    expect(document.annotationByItemId.get('hit')?.number).toBe(1)
    expect(document.annotationByItemId.has('pass')).toBe(false)
  })

  it('同一 quote 出现多次时只取第一处，并允许同一段多批注', () => {
    const repeated = '重复句子。中间内容。重复句子。'
    const document = buildReviewDocument([
      item({ id: 'dup', quote: '重复句子。' }),
      item({ id: 'middle', quote: '中间内容。' }),
    ], repeated)

    expect(document.annotations.map(annotation => annotation.itemId)).toEqual(['dup', 'middle'])
    expect(document.annotations[0].from).toBe(0)
    expect(document.annotations[1].blockIndex).toBe(0)
    expect(document.annotations[1].from).toBeGreaterThanOrEqual(document.annotations[0].to)
  })

  it('统计字数时忽略空白', () => {
    expect(countDraftCharacters('一二 三\n四')).toBe(4)
  })
})

describe('splitReviewSegments', () => {
  it('把一段正文切成普通文本与批注片段', () => {
    const blocks = splitReviewBlocks('前面。命中片段。后面。')
    const document = buildReviewDocument([item({ id: 'a', quote: '命中片段。' })], '前面。命中片段。后面。')
    const segments = splitReviewSegments(blocks[0], document.annotations)

    expect(segments.map(segment => [segment.text, segment.annotation?.itemId ?? null])).toEqual([
      ['前面。', null],
      ['命中片段。', 'a'],
      ['后面。', null],
    ])
  })
})

describe('splitInlineMarkdown', () => {
  it('还原加粗与行内代码，不残留 Markdown 标记', () => {
    expect(splitInlineMarkdown('按下 `Ctrl + C`，进入**智能体驱动**时代。')).toEqual([
      { kind: 'text', text: '按下 ' },
      { kind: 'code', text: 'Ctrl + C' },
      { kind: 'text', text: '，进入' },
      { kind: 'bold', text: '智能体驱动' },
      { kind: 'text', text: '时代。' },
    ])
  })

  it('没有标记时返回单个文本 token', () => {
    expect(splitInlineMarkdown('普通正文')).toEqual([{ kind: 'text', text: '普通正文' }])
  })
})
