import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function strictJson(rawBytes, label) {
  const bytes = Buffer.from(rawBytes)
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  const normalized = hasBom ? text.slice(1) : text
  assert(!normalized.includes('\uFEFF'), `${label} contains a duplicate or misplaced BOM`)
  return JSON.parse(normalized)
}

export function normalizeLegacyReceipt({ platform, relativePath, rawBytes }) {
  assert(platform === 'windows', 'platform must equal windows')
  const receipt = strictJson(rawBytes, relativePath)
  assert(receipt && typeof receipt === 'object' && !Array.isArray(receipt), `${relativePath} must contain an object`)
  assert(receipt.accepted === true, `${relativePath} must have accepted=true`)
  assert(Array.isArray(receipt.observations) && receipt.observations.length > 0 && receipt.observations.every(value => typeof value === 'string' && value.trim()), `${relativePath} observations are invalid`)

  const normalized = structuredClone(receipt)
  const sourceClassification = {}
  if (receipt.platform !== undefined) {
    assert(receipt.platform === 'windows', `${relativePath} platform classification is invalid`)
  }

  if (relativePath.replaceAll('\\', '/').endsWith('/signing.json')) {
    assert(receipt.status === 'signed' || receipt.status === 'unsigned', 'Windows signing status must be signed or unsigned')
    assert(typeof receipt.validationResult === 'string' && receipt.validationResult.trim(), `${relativePath} validationResult is required`)
    assert(typeof receipt.unsignedDistributionImpact === 'string' && receipt.unsignedDistributionImpact.trim(), `${relativePath} unsignedDistributionImpact is required`)
  }

  normalized.sourceReceiptRawBytesSha256 = sha256(rawBytes)
  normalized.sourceClassification = sourceClassification
  return normalized
}

function parseArguments(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    assert(key?.startsWith('--') && value !== undefined, `Invalid argument: ${key}`)
    options[key.slice(2)] = value
  }
  return options
}

function main() {
  const options = parseArguments(process.argv.slice(2))
  for (const key of ['platform', 'relative-path', 'input', 'output']) assert(options[key], `--${key} is required`)
  const normalized = normalizeLegacyReceipt({
    platform: options.platform,
    relativePath: options['relative-path'],
    rawBytes: readFileSync(path.resolve(options.input)),
  })
  writeFileSync(path.resolve(options.output), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try { main() } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
