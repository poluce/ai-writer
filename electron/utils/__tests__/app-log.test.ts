import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { appendVelaLog, LOG_RETENTION_DAYS, MAX_LOG_BYTES } from '../app-log'
import type { DiagnosticLogRecord } from '../../../src/shared/fail-log'

const roots: string[] = []

function tempHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-log-'))
  roots.push(home)
  return home
}

function record(event: string, extra: Record<string, unknown> = {}): DiagnosticLogRecord {
  return { ts: '2026-10-26T02:00:00.000Z', level: 'error', scope: 'Test', event, ...extra }
}

function readLines(filePath: string): Array<Record<string, unknown>> {
  return fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>)
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('diagnostic log rolling', () => {
  it('writes one file per local day and appends records as newline JSON', () => {
    const home = tempHome()
    const logs = path.join(home, 'logs')

    appendVelaLog(record('first'), { home, now: new Date(2026, 9, 26, 9, 0, 0) })
    appendVelaLog(record('second'), { home, now: new Date(2026, 9, 26, 23, 59, 0) })
    appendVelaLog(record('next-day'), { home, now: new Date(2026, 9, 27, 0, 1, 0) })

    expect(fs.readdirSync(logs).sort()).toEqual([
      'vela-2026-10-26.log',
      'vela-2026-10-27.log',
    ])
    expect(readLines(path.join(logs, 'vela-2026-10-26.log')).map(line => line.event))
      .toEqual(['first', 'second'])
    expect(readLines(path.join(logs, 'vela-2026-10-27.log')).map(line => line.event))
      .toEqual(['next-day'])
  })

  it('splits a too-long day file into numbered segments instead of one huge file', () => {
    const home = tempHome()
    const logs = path.join(home, 'logs')
    const now = new Date(2026, 9, 26, 12, 0, 0)

    for (let index = 0; index < 8; index += 1) {
      appendVelaLog(record(`event-${index}-${'x'.repeat(120)}`), {
        home,
        now,
        maxBytes: 300,
      })
    }

    const files = fs.readdirSync(logs).sort()
    expect(files).toContain('vela-2026-10-26.log')
    expect(files.some(name => /^vela-2026-10-26\.\d+\.log$/u.test(name))).toBe(true)
    expect(files.length).toBeGreaterThan(1)
    // 所有分片加起来不丢记录。
    const events = files.flatMap(name => readLines(path.join(logs, name)).map(line => line.event))
    expect(events).toHaveLength(8)
    for (const file of files) {
      expect(fs.statSync(path.join(logs, file)).size).toBeLessThan(MAX_LOG_BYTES)
    }
  })

  it('prunes daily files older than the retention window', () => {
    const home = tempHome()
    const logs = path.join(home, 'logs')
    fs.mkdirSync(logs, { recursive: true })
    fs.writeFileSync(path.join(logs, 'vela-2020-01-01.log'), '{}\n')
    const keepDate = new Date(2026, 9, 26)
    keepDate.setDate(keepDate.getDate() - LOG_RETENTION_DAYS + 1)
    const keepStamp = `${keepDate.getFullYear()}-${String(keepDate.getMonth() + 1).padStart(2, '0')}-${String(keepDate.getDate()).padStart(2, '0')}`
    fs.writeFileSync(path.join(logs, `vela-${keepStamp}.log`), '{}\n')

    appendVelaLog(record('today'), { home, now: new Date(2026, 9, 26, 8, 0, 0) })

    expect(fs.existsSync(path.join(logs, 'vela-2020-01-01.log'))).toBe(false)
    expect(fs.existsSync(path.join(logs, `vela-${keepStamp}.log`))).toBe(true)
    expect(fs.existsSync(path.join(logs, 'vela-2026-10-26.log'))).toBe(true)
  })

  it('migrates legacy single-file logs into daily files without losing entries', () => {
    const home = tempHome()
    const logs = path.join(home, 'logs')
    fs.mkdirSync(logs, { recursive: true })
    const legacy = path.join(logs, 'vela.log')
    fs.writeFileSync(legacy, `${JSON.stringify(record('legacy-a'))}\n${JSON.stringify(record('legacy-b'))}\n`)
    const legacyDate = new Date(2026, 9, 20, 12, 0, 0)
    fs.utimesSync(legacy, legacyDate, legacyDate)

    appendVelaLog(record('fresh'), { home, now: new Date(2026, 9, 26, 9, 0, 0) })

    expect(fs.existsSync(legacy)).toBe(false)
    expect(readLines(path.join(logs, 'vela-2026-10-20.log')).map(line => line.event))
      .toEqual(['legacy-a', 'legacy-b'])
    expect(readLines(path.join(logs, 'vela-2026-10-26.log')).map(line => line.event))
      .toEqual(['fresh'])
  })

  it('clips oversized fields so one record cannot flood the log file', () => {
    const home = tempHome()
    const logs = path.join(home, 'logs')
    appendVelaLog(record('x'.repeat(10_000), {
      error: { message: 'm'.repeat(10_000), stack: 's'.repeat(60_000) },
      detail: 'd'.repeat(10_000),
    }), { home, now: new Date(2026, 9, 26, 8, 0, 0) })

    const [line] = readLines(path.join(logs, 'vela-2026-10-26.log'))
    const event = line.event as string
    const error = line.error as { stack: string; message: string }
    const detail = line.detail as string
    expect(event.length).toBeLessThan(2_200)
    expect(error.message.length).toBeLessThan(2_200)
    expect(error.stack.length).toBeLessThan(8_200)
    expect(detail.length).toBeLessThan(1_200)
    expect(event).toContain('truncated')
  })
})
