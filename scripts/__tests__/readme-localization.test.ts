import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('README language variants', () => {
  it('keeps Chinese README as the repository default and marks screenshots as pending', () => {
    const readme = readFileSync('README.md', 'utf8')
    expect(readme).toMatch(/\[English\]\(README_en\.md\)\s*\|\s*\*\*中文\*\*/)
    // v0.8.5 时期的界面截图与当前版本不一致，已从 README 撤下；
    // 重新截图之前只保留「待更新」说明，避免文档把过期界面当作现状。
    expect(readme).not.toContain('ui-zh-v085-project-config.png')
    expect(readme).toContain('界面截图待更新')
  })

  it('keeps the English README independent and free of stale hero art', () => {
    const readme = readFileSync('README_en.md', 'utf8')
    expect(readme).toMatch(/\*\*English\*\*\s*\|\s*\[中文\]\(README\.md\)/)
    expect(readme).not.toContain('hero-zh-v2.png')
    expect(readme).not.toContain('hero-en-v2.png')
    expect(readme).toContain('Interface screenshots are pending an update')
  })
})
