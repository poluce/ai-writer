import { describe, expect, it } from 'vitest'
import { normalizeLegacyReceipt } from '../../.release/scripts/legacy-qualification-adapter.mjs'

const windowsSigning = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  accepted: true,
  observations: ['Authenticode observed an unsigned installer'],
  platform: 'windows',
  status: 'unsigned',
  validationResult: 'NotSigned',
  unsignedDistributionImpact: 'SmartScreen may require manual confirmation.',
  direct: { authenticodeStatus: 'NotSigned' },
  ...overrides,
})

describe('legacy qualification receipt adapter', () => {
  it('retains raw provenance while normalizing a Windows signing receipt', () => {
    const normalized = normalizeLegacyReceipt({
      platform: 'windows',
      relativePath: 'acceptance/signing.json',
      rawBytes: Buffer.from(JSON.stringify(windowsSigning())),
    })

    expect(normalized).toMatchObject({
      platform: 'windows',
      status: 'unsigned',
      validationResult: 'NotSigned',
      observations: ['Authenticode observed an unsigned installer'],
    })
    expect(normalized.sourceReceiptRawBytesSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(normalized.sourceClassification).toEqual({})
  })

  it('rejects an unknown platform classification', () => {
    expect(() => normalizeLegacyReceipt({
      platform: 'windows',
      relativePath: 'acceptance/signing.json',
      rawBytes: Buffer.from(JSON.stringify(windowsSigning({ platform: 'darwin' }))),
    })).toThrow()
  })

  it.each([
    ['unknown signing status', windowsSigning({ status: 'mystery' })],
    ['missing observations', windowsSigning({ observations: [] })],
    ['missing validation result', windowsSigning({ validationResult: '' })],
  ])('fails closed for %s', (_case, receipt) => {
    expect(() => normalizeLegacyReceipt({
      platform: 'windows',
      relativePath: 'acceptance/signing.json',
      rawBytes: Buffer.from(JSON.stringify(receipt)),
    })).toThrow()
  })
})
