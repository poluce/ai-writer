import { describe, expect, it } from 'vitest'

import { publicAssetUrl } from '../public-asset'

describe('publicAssetUrl', () => {
  it('prefixes assets with a relative base so packaged file:// pages resolve them', () => {
    expect(publicAssetUrl('logo.svg', './')).toBe('./logo.svg')
    expect(publicAssetUrl('/logo.svg', './')).toBe('./logo.svg')
    expect(publicAssetUrl('skins/paper.svg', './')).toBe('./skins/paper.svg')
  })

  it('keeps the dev-server root base working with or without a leading slash', () => {
    expect(publicAssetUrl('logo.svg', '/')).toBe('/logo.svg')
    expect(publicAssetUrl('/logo.svg', '/')).toBe('/logo.svg')
  })

  it('normalizes an empty base to the current directory', () => {
    expect(publicAssetUrl('/logo.svg', '')).toBe('./logo.svg')
  })
})
