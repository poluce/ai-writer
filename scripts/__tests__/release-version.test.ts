import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('v0.1.1 release metadata', () => {
  it('uses the release version in package metadata', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
    expect(pkg.version).toBe('0.1.1')
  })

  it('resolves the release tag and exact three-asset contract from the package version', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
    const profile = JSON.parse(readFileSync('.release/release-profile.json', 'utf8')) as {
      releaseAssets: Array<{ name: string }>
    }

    expect(`v${pkg.version}`).toBe('v0.1.1')
    expect(profile.releaseAssets.map(({ name }) => name.replaceAll('{version}', pkg.version))).toEqual([
      'ai-writer-setup-0.1.1.exe',
      'ai-writer-setup-0.1.1.exe.blockmap',
      'latest.yml',
    ])
  })

  it('documents the bilingual 0.1.1 update-reminder scope, independence, and signing disclosure', () => {
    const notes = readFileSync('.release/notes/v0.1.1.md', 'utf8')
    const chineseReadme = readFileSync('README.md', 'utf8')
    const englishReadme = readFileSync('README_en.md', 'utf8')

    for (const expected of [
      '独立发行线',
      '应用身份',
      '三项资产',
      '尚未进行代码签名',
      'macOS',
      '更新提醒',
      '下载更新',
      '重启更新',
      '稍后提醒',
    ]) expect(notes).toContain(expected)

    for (const expected of [
      'independent line',
      'app identity',
      'three-asset contract',
      'not code-signed',
      'macOS',
      'reminder',
      'Download update',
      'Restart and update',
      'Remind me later',
    ]) expect(notes).toContain(expected)

    expect(chineseReadme).toContain('v0.1.1')
    expect(englishReadme).toContain('v0.1.1')
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
        'https://github.com/poluce/ai-writer/releases/latest',
      ]) expect(readme).toContain(expected)

      for (const installer of [
        /ai-writer-setup-<[^>\r\n]+>\.exe/u,
      ]) expect(readme).toMatch(installer)
    }

    expect(chineseReadme).toContain('尚未进行代码签名')
    expect(englishReadme).toContain('not code-signed')
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
