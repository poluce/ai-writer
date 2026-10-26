import fs from 'node:fs'
import path from 'node:path'

import { ensureVelaHome, VELA_HOME } from './config-utils'
import type { DiagnosticLogRecord } from '../../src/shared/fail-log'

/**
 * 诊断日志落盘策略：
 * - 一天一个文件（vela-YYYY-MM-DD.log），出问题按日期直接定位；
 * - 单文件超过上限自动切分（vela-YYYY-MM-DD.1.log、.2.log…），避免超大文件打不开；
 * - 只保留最近 {LOG_RETENTION_DAYS} 天，超期自动删除；
 * - 单条记录过长时裁剪事件/堆栈/附加字段，保留可排查的关键信息。
 */
export const MAX_LOG_BYTES = 5 * 1024 * 1024
export const LOG_RETENTION_DAYS = 14

const LOG_FILE_PATTERN = /^vela-(\d{4})-(\d{2})-(\d{2})(?:\.(\d+))?\.log$/u
const MAX_EVENT_CHARS = 2_000
const MAX_ERROR_MESSAGE_CHARS = 2_000
const MAX_ERROR_STACK_CHARS = 8_000
const MAX_EXTRA_STRING_CHARS = 1_000
const MAX_LINE_CHARS = 64 * 1024

export interface VelaLogOptions {
  /** 覆盖日志根目录（默认 ~/.vela），测试用。 */
  home?: string
  /** 覆盖当前时间，测试用。 */
  now?: Date
  /** 覆盖单文件切分阈值，测试用。 */
  maxBytes?: number
  /** 覆盖保留天数，测试用。 */
  retentionDays?: number
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 本地日期戳（日志按本地自然日切分，而不是 UTC）。 */
export function localDateStamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function velaLogDirectory(home = VELA_HOME): string {
  return path.join(home, 'logs')
}

/** 当天的活动日志文件（不含分片序号）。 */
export function velaLogFilePath(now = new Date(), home = VELA_HOME): string {
  return path.join(velaLogDirectory(home), `vela-${localDateStamp(now)}.log`)
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…[truncated ${value.length - max} chars]` : value
}

/** 防止一条超长记录（例如巨量堆栈）把日志文件撑爆。 */
function prepareRecord(record: DiagnosticLogRecord): DiagnosticLogRecord {
  const prepared: DiagnosticLogRecord = {
    ...record,
    event: clip(typeof record.event === 'string' ? record.event : String(record.event ?? ''), MAX_EVENT_CHARS),
  }
  if (prepared.error) {
    prepared.error = {
      message: clip(prepared.error.message ?? '', MAX_ERROR_MESSAGE_CHARS),
      ...(prepared.error.stack ? { stack: clip(prepared.error.stack, MAX_ERROR_STACK_CHARS) } : {}),
      ...(prepared.error.code ? { code: prepared.error.code } : {}),
    }
  }
  for (const key of Object.keys(prepared)) {
    if (key === 'ts' || key === 'level' || key === 'scope' || key === 'event' || key === 'error') continue
    const value = prepared[key]
    if (typeof value === 'string') prepared[key] = clip(value, MAX_EXTRA_STRING_CHARS)
  }
  return prepared
}

function serializeRecord(record: DiagnosticLogRecord): string {
  const line = JSON.stringify(prepareRecord(record))
  if (line.length <= MAX_LINE_CHARS) return line
  return JSON.stringify({
    ts: record.ts,
    level: record.level,
    scope: record.scope,
    event: clip(String(record.event ?? ''), 500),
    truncated: true,
  })
}

/** 把旧版单一 vela.log / vela.log.1 合并迁移到按天文件，升级后不丢历史日志。 */
function migrateLegacyLogFiles(directory: string): void {
  for (const name of ['vela.log.1', 'vela.log']) {
    const legacyPath = path.join(directory, name)
    if (!fs.existsSync(legacyPath)) continue
    try {
      const stat = fs.statSync(legacyPath)
      const target = path.join(directory, `vela-${localDateStamp(stat.mtime)}.log`)
      const content = fs.readFileSync(legacyPath)
      if (fs.existsSync(target)) fs.appendFileSync(target, content)
      else fs.writeFileSync(target, content)
      fs.unlinkSync(legacyPath)
    } catch (error) {
      console.error('[Vela Log] 迁移旧日志失败', legacyPath, error)
    }
  }
}

function pruneExpiredLogs(directory: string, now: Date, retentionDays: number): void {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  cutoff.setDate(cutoff.getDate() - retentionDays)
  for (const name of fs.readdirSync(directory)) {
    const match = LOG_FILE_PATTERN.exec(name)
    if (!match) continue
    const fileDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    if (fileDate < cutoff) {
      try {
        fs.unlinkSync(path.join(directory, name))
      } catch (error) {
        console.error('[Vela Log] 清理过期日志失败', name, error)
      }
    }
  }
}

/** 找到当天第一个还没写满的分片；写满自动进入 .1 / .2 … */
function activeLogFile(directory: string, now: Date, maxBytes: number): string {
  const stamp = localDateStamp(now)
  const candidates = [path.join(directory, `vela-${stamp}.log`)]
  for (let index = 1; index <= 999; index += 1) {
    candidates.push(path.join(directory, `vela-${stamp}.${index}.log`))
  }
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) return candidate
    try {
      if (fs.statSync(candidate).size < maxBytes) return candidate
    } catch {
      return candidate
    }
  }
  return candidates[candidates.length - 1]
}

const migratedDirectories = new Set<string>()
const prunedDirectoryDays = new Set<string>()

export function appendVelaLog(record: DiagnosticLogRecord, options: VelaLogOptions = {}): void {
  const home = options.home ?? VELA_HOME
  const directory = velaLogDirectory(home)
  try {
    if (options.home) fs.mkdirSync(directory, { recursive: true })
    else ensureVelaHome()

    if (!migratedDirectories.has(directory)) {
      migrateLegacyLogFiles(directory)
      migratedDirectories.add(directory)
    }

    const now = options.now ?? new Date()
    const pruneKey = `${directory}\u0000${localDateStamp(now)}`
    if (!prunedDirectoryDays.has(pruneKey)) {
      pruneExpiredLogs(directory, now, options.retentionDays ?? LOG_RETENTION_DAYS)
      prunedDirectoryDays.add(pruneKey)
    }

    const filePath = activeLogFile(directory, now, options.maxBytes ?? MAX_LOG_BYTES)
    fs.appendFileSync(filePath, `${serializeRecord(record)}\n`, 'utf8')
  } catch (error) {
    console.error('[Vela Log] 写入日志失败', directory, error)
  }
}
