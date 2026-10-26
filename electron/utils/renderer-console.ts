import type { DiagnosticLogRecord } from '../../src/shared/fail-log'

const MAX_MESSAGE_CHARS = 4_000

/**
 * Renderer 控制台写入诊断日志的策略：
 * - 只记录 warning / error；info / verbose 属于流水账，直接丢弃；
 * - 应用自身的结构化失败（`[Vela ...]` 前缀）已经通过 logFailure → IPC 落盘，
 *   这里跳过，避免同一个错误在日志里出现两遍；
 * - 超长消息裁剪，防止一段巨型堆栈撑爆日志文件。
 */
export function createRendererConsoleRecord(
  level: number,
  message: string,
  line: number,
  sourceId: string,
  now = new Date(),
): DiagnosticLogRecord | null {
  if (!Number.isFinite(level) || level < 2) return null
  const text = typeof message === 'string' ? message.trim() : ''
  if (!text) return null
  if (text.startsWith('[Vela ')) return null
  return {
    ts: now.toISOString(),
    level: level >= 3 ? 'error' : 'info',
    scope: 'RendererConsole',
    event: text.length > MAX_MESSAGE_CHARS
      ? `${text.slice(0, MAX_MESSAGE_CHARS)}…[truncated ${text.length - MAX_MESSAGE_CHARS} chars]`
      : text,
    line,
    sourceId,
  }
}
