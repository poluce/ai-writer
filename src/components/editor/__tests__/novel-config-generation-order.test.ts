import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { NOVEL_CONFIG_GENERATION_KEYS } from '../../../shared/novel-config-generation'

function source(file: string): string {
  return readFileSync(file, 'utf8').replace(/\r\n?/g, '\n')
}

describe('novel config generation order', () => {
  it('renders the config editor sections in the same order as the generation chain', () => {
    const editor = source('src/components/editor/NovelConfigEditor.tsx')
    const renderedOrder = [...editor.matchAll(/handleFieldGenerate\('(\w+)'\)/g)]
      .map(match => match[1])

    // 上下文的阶梯顺序来自 shared 链条；界面必须保持同一顺序，
    // 否则「上一个已经写好的字段」在视觉上就不再是上一个。
    expect(renderedOrder).toEqual([...NOVEL_CONFIG_GENERATION_KEYS])
  })
})
