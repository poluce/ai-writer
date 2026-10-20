import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  expectedReleaseProvenance,
  parseQualificationRuns,
  validatePromotionProfile,
} from '../../.release/scripts/github-desktop-promotion.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..')
const profile = JSON.parse(readFileSync(path.join(repositoryRoot, '.release', 'release-profile.json'), 'utf8'))

describe('desktop promotion qualification entities', () => {
  it('prefixes the frozen bilingual release notes before generated provenance', () => {
    const provenance = expectedReleaseProvenance(
      'v1.0.0',
      'a'.repeat(40),
      new Map([['installer', { name: 'app.exe', sha256: 'b'.repeat(64) }]]),
      [{ platform: 'windows', signing: { status: 'unsigned', validationResult: 'not signed', unsignedDistributionImpact: 'SmartScreen may warn' } }],
      '# 中文\n\nEnglish',
    )

    expect(provenance.body).toContain('# 中文\n\nEnglish\n\n---\n\nQualified desktop release v1.0.0')
    expect(provenance.body).toContain(`Source: ${'a'.repeat(40)}`)
    expect(provenance.body).toContain(`- app.exe: sha256:${'b'.repeat(64)}`)
  })

  it('requires the Windows qualification run identity declared by the profile', () => {
    const validated = validatePromotionProfile(profile)
    const entities = Object.keys(validated.platforms).sort()
    expect(entities).toEqual(['windows'])

    const runs = parseQualificationRuns(JSON.stringify({
      windows: { runId: 101, attempt: 1, artifactId: 201 },
    }), entities)

    expect(runs).toEqual({ windows: { runId: 101, attempt: 1, artifactId: 201 } })
    expect(validated.releaseAssets.map(asset => asset.name)).toEqual([
      'ai-writer-setup-{version}.exe',
      'ai-writer-setup-{version}.exe.blockmap',
      'latest.yml',
    ])
  })

  it('rejects an unsupported platform or a run mapping with unknown keys', () => {
    const genericMacos = structuredClone(profile)
    genericMacos.platforms.macos = genericMacos.platforms.windows
    expect(() => validatePromotionProfile(genericMacos)).toThrow('Unsupported platform: macos')

    expect(() => parseQualificationRuns(JSON.stringify({
      windows: { runId: 101, attempt: 1, artifactId: 201 },
      macos: { runId: 102, attempt: 1, artifactId: 202 },
    }), ['windows'])).toThrow('qualification run mapping keys must be exactly')
  })
})
