import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const ASSET_EXTENSION = String.raw`(?:svg|png|jpe?g|webp|gif|ico|ttf|woff2?)`
const QUOTED_ABSOLUTE_ASSET = new RegExp(
  String.raw`(?:src|poster)\s*=\s*["']/[^"']+\.${ASSET_EXTENSION}["']`,
  'g',
)
const EXPRESSION_ABSOLUTE_ASSET = new RegExp(
  String.raw`(?:src|poster)\s*=\s*\{\s*["'\`]/[^"'\`]+\.${ASSET_EXTENSION}["'\`]\s*\}`,
  'g',
)

function rendererSources(directory: string, collected: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      rendererSources(fullPath, collected)
      continue
    }
    if (/\.(?:tsx?|jsx?)$/.test(entry.name)) collected.push(fullPath)
  }
  return collected
}

describe('renderer public asset references', () => {
  it('does not hardcode file:// incompatible absolute asset URLs in JSX attributes', () => {
    // 打包后渲染进程以 file:// 加载 dist/index.html（base: './'）；`/logo.svg` 这类
    // 绝对路径会指向文件系统根目录。public 资源必须经 publicAssetUrl() 拼接 BASE_URL。
    const offenders: string[] = []
    for (const file of rendererSources('src')) {
      const source = readFileSync(file, 'utf8')
      const quoted = source.match(QUOTED_ABSOLUTE_ASSET) ?? []
      const expression = source.match(EXPRESSION_ABSOLUTE_ASSET) ?? []
      if (quoted.length > 0 || expression.length > 0) {
        offenders.push(`${file}: ${[...quoted, ...expression].join(', ')}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
