import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('language controls', () => {
  it('offers both interface languages from the title bar main menu', () => {
    const source = readFileSync('src/components/layout/TitleBar.tsx', 'utf8')

    expect(source).toContain('setLocale')
    expect(source).toContain("text('简体中文', 'Simplified Chinese')")
    expect(source).toContain("'en-US'")
    expect(source).not.toContain('toggleLocale')
  })

  it('provides explicit locale choices in settings', () => {
    const source = readFileSync('src/components/settings/EditorSettings.tsx', 'utf8')

    expect(source).toContain('setLocale')
    expect(source).toContain('<option value="zh-CN">')
    expect(source).toContain('<option value="en-US">')
  })
})
