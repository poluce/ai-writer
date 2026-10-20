import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('v0.1.0 release metadata', () => {
  it('uses the release version in package metadata', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
    expect(pkg.version).toBe('0.1.0')
  })

  it('resolves the release tag and exact seven-asset contract from the package version', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
    const profile = JSON.parse(readFileSync('.release/release-profile.json', 'utf8')) as {
      releaseAssets: Array<{ name: string }>
    }

    expect(`v${pkg.version}`).toBe('v0.1.0')
    expect(profile.releaseAssets.map(({ name }) => name.replaceAll('{version}', pkg.version))).toEqual([
      'ai-writer-setup-0.1.0.exe',
      'ai-writer-setup-0.1.0.exe.blockmap',
      'latest.yml',
      'ai-writer-mac-arm64-0.1.0-installer.dmg',
      'ai-writer-mac-arm64-0.1.0-installer.dmg.sha256',
      'ai-writer-mac-x64-0.1.0-installer.dmg',
      'ai-writer-mac-x64-0.1.0-installer.dmg.sha256',
    ])
  })

  it('documents the bilingual 0.1.0 scope, independence, and signing disclosure', () => {
    const notes = readFileSync('.release/notes/v0.1.0.md', 'utf8')
    const chineseReadme = readFileSync('README.md', 'utf8')
    const englishReadme = readFileSync('README_en.md', 'utf8')

    for (const expected of [
      '独立发行线',
      '应用身份',
      '七项资产',
      '尚未进行代码签名',
      'ad-hoc 签名',
      '未使用 Developer ID 签名或公证',
      '委派',
      '分卷',
    ]) expect(notes).toContain(expected)

    for (const expected of [
      'independent line',
      'app identity',
      'Seven-asset contract',
      'not code-signed',
      'ad-hoc signed',
      'not notarized',
      'delegate',
    ]) expect(notes).toContain(expected)

    expect(chineseReadme).toContain('v0.1.0')
    expect(englishReadme).toContain('v0.1.0')
    expect(chineseReadme).not.toContain('v1.1.0')
    expect(englishReadme).not.toContain('v1.1.0')
  })

  it('documents current desktop downloads and signing disclosures in both READMEs', () => {
    const chineseReadme = readFileSync('README.md', 'utf8')
    const englishReadme = readFileSync('README_en.md', 'utf8')

    // Current release metadata is checked above; README wording can evolve.
    for (const readme of [chineseReadme, englishReadme]) {
      for (const expected of [
        'Windows x64',
        'Apple Silicon',
        'Intel',
        'https://github.com/poluce/ai-writer/releases/latest',
      ]) expect(readme).toContain(expected)

      for (const installer of [
        /ai-writer-setup-<[^>\r\n]+>\.exe/u,
        /ai-writer-mac-arm64-<[^>\r\n]+>-installer\.dmg/u,
        /ai-writer-mac-x64-<[^>\r\n]+>-installer\.dmg/u,
      ]) expect(readme).toMatch(installer)
    }

    for (const expected of [
      '尚未进行代码签名',
      'ad-hoc 签名',
      '未使用 Developer ID 签名或公证',
    ]) expect(chineseReadme).toContain(expected)

    for (const expected of [
      'not code-signed',
      'ad-hoc signed',
      'no Developer ID signature',
      'not notarized',
    ]) expect(englishReadme).toContain(expected)
  })

  it('keeps stale Mythpen branding out of release metadata', () => {
    const releaseConfig = readFileSync('package.json', 'utf8')
    expect(releaseConfig.toLowerCase()).not.toContain('mythpen')
  })

  it('lets the Windows smoke command discover the current release executable', () => {
    const smokeScript = readFileSync('scripts/smoke-win-app.ps1', 'utf8')
    expect(smokeScript).toContain('package.json')
    expect(smokeScript).toContain('AI Writer.exe')
  })
})
