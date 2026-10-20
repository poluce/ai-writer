import { describe, expect, it } from 'vitest'
import {
  parseDynamicArchSections,
  serializeDynamicArchSections,
} from '../arch-structured-sections'

describe('arch-structured-sections', () => {
  it('parses empty document as a single default section without creating arbitrary blocks', () => {
    const res = parseDynamicArchSections('前提概要', '')
    expect(res.sections).toHaveLength(1)
    expect(res.sections[0].title).toBe('前提概要')
    expect(res.sections[0].content).toBe('')
    expect(res.sections[0].hasExplicitHeader).toBe(false)
  })

  it('preserves plain prose without adding arbitrary sections or headers', () => {
    const text = '这是作者直接写的一段故事前提，没有使用任何 markdown 标题。'
    const res = parseDynamicArchSections('前提概要', text)
    expect(res.sections).toHaveLength(1)
    expect(res.sections[0].title).toBe('前提概要')
    expect(res.sections[0].content).toBe(text)

    const serialized = serializeDynamicArchSections(res.sections, res.documentTitle)
    expect(serialized.trim()).toBe(text)
    expect(serialized).not.toContain('##')
  })

  it('strips top document title and keeps subsections (###) inside primary section content', () => {
    const md = `# 故事前提 (Premise)

## 一句话故事前提 (Logline)
全栈工程师穿越千禧年。

---

## 核心冲突链与戏剧推进架构

### 1. 物理代差与初期生存冲突
- **算力荒漠 vs 算法降维**：千禧年的单核奔腾机算力极度匮乏。

### 2. 学科成见与学术震荡冲突
- **外系打杂生 vs 计算机学会**：自动化系学生手搓高精度识别算法。`

    const res = parseDynamicArchSections('前提概要', md)
    expect(res.documentTitle).toBe('故事前提 (Premise)')
    // 应该只有 2 个主卡片，而不是 4 或 5 个零碎卡片，且没有空卡片！
    expect(res.sections).toHaveLength(2)
    expect(res.sections[0].title).toBe('一句话故事前提 (Logline)')
    expect(res.sections[0].content).toBe('全栈工程师穿越千禧年。')

    expect(res.sections[1].title).toBe('核心冲突链与戏剧推进架构')
    // 子标题与列表完整包含在正文中！
    expect(res.sections[1].content).toContain('### 1. 物理代差与初期生存冲突')
    expect(res.sections[1].content).toContain('### 2. 学科成见与学术震荡冲突')
    expect(res.sections[1].content).toContain('算力荒漠 vs 算法降维')

    const serialized = serializeDynamicArchSections(res.sections, res.documentTitle)
    expect(serialized).toContain('# 故事前提 (Premise)')
    expect(serialized).toContain('## 一句话故事前提 (Logline)')
    expect(serialized).toContain('## 核心冲突链与戏剧推进架构')
    expect(serialized).toContain('### 1. 物理代差与初期生存冲突')
  })

  it('handles worldbuilding with Chinese numeral headings and preserves subsections', () => {
    const md = `# 世界观设定

## 一、 时代切片与宏观冷暖
### 1. 互联网泡沫
纳斯达克雪崩。

## 二、 微机硬件与算力荒漠
### 1. 主流PC边界
奔腾III单核。`

    const res = parseDynamicArchSections('环境', md)
    expect(res.documentTitle).toBe('世界观设定')
    expect(res.sections).toHaveLength(2)
    expect(res.sections[0].title).toBe('一、 时代切片与宏观冷暖')
    expect(res.sections[0].content).toContain('### 1. 互联网泡沫')
    expect(res.sections[1].title).toBe('二、 微机硬件与算力荒漠')
    expect(res.sections[1].content).toContain('### 1. 主流PC边界')
  })
})
