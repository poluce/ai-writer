/**
 * 渠道与模型设置的共享纯逻辑 — 行档案、能力合并、连通性状态与发现提示文案。
 * 从 GenerationModelSettings 拆出：表单、渠道卡片与弹层共用，便于单测与复用。
 */

import type {
  DiscoveredModel,
  ModelDiscoveryErrorCode,
  ModelProfile,
} from '../../shared/ipc-channels'
import type { ModelCapabilities } from '../../shared/provider-presets'
import type { ModelProviderResourceId } from '../../shared/model-provider-resources'
import { ipc } from '../../services/ipc-client'
import { alertError } from '../ui/AlertDialog'

export function discoveredModelOptionLabel(candidate: DiscoveredModel): string {
  if (candidate.name === candidate.id) return candidate.id
  return `${candidate.name} (${candidate.id})`
}

export function advancedSettingsToggleClass(expanded: boolean): string {
  if (expanded) {
    return 'bg-[var(--color-hover)] text-[var(--color-accent)] font-medium border-[var(--color-accent)]'
  }
  return 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-hover)]'
}

export function advancedSettingsIconStyle(expanded: boolean): { color: string } | undefined {
  if (expanded) return { color: 'var(--color-accent)' }
  return undefined
}

export type ChannelModelRow = {
  id: string
  modelName: string
  name: string
  temperature?: number
  contextWindowTokens?: number | null
  maxOutputTokens?: number
}

export function channelModelRowFromProfile(
  profile: ModelProfile,
  presetCaps: ModelCapabilities | undefined,
  channelTitle: string,
): ChannelModelRow {
  const displayName = (profile.name ?? '').trim()
  const modelName = (profile.modelName ?? '').trim()
  const profileChannel = (profile.channelName ?? '').trim()
  const isChannelTitle = Boolean(displayName && (
    displayName === profileChannel || displayName === channelTitle
  ))
  let customAlias = ''
  if (displayName && displayName !== modelName && !isChannelTitle) customAlias = displayName
  return {
    id: profile.id,
    modelName: profile.modelName || '',
    name: customAlias,
    temperature: typeof profile.temperature === 'number' ? profile.temperature : 0.7,
    contextWindowTokens: profile.capabilities?.contextWindowTokens ?? presetCaps?.contextWindowTokens ?? null,
    maxOutputTokens: profile.capabilities?.maxOutputTokens ?? profile.maxTokens ?? presetCaps?.maxOutputTokens ?? 4096,
  }
}

export function channelSaveDisabled(saving: boolean, model: ModelProfile): boolean {
  if (saving) return true
  if (!(model.baseUrl ?? '').trim()) return true
  if (model.provider === 'ollama') return false
  return !(model.apiKey ?? '').trim()
}

export function thrownMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function mergedModelCapabilities(
  presetCaps: ModelCapabilities | undefined,
  model: ModelProfile,
  row: ChannelModelRow,
  maxOutputTokens: number,
): ModelCapabilities | undefined {
  const hasCapabilities = Boolean(
    model.capabilities
    || presetCaps
    || (row.contextWindowTokens !== null && row.contextWindowTokens !== undefined),
  )
  if (!hasCapabilities) return undefined
  let contextWindowTokens = model.capabilities?.contextWindowTokens ?? null
  if (row.contextWindowTokens !== undefined) contextWindowTokens = row.contextWindowTokens
  return {
    reasoning: presetCaps?.reasoning ?? model.capabilities?.reasoning ?? false,
    structuredOutput: presetCaps?.structuredOutput ?? model.capabilities?.structuredOutput ?? false,
    usage: presetCaps?.usage ?? model.capabilities?.usage ?? false,
    ...pickDefinedCapability(presetCaps, model.capabilities, 'toolCalling'),
    ...pickDefinedCapability(presetCaps, model.capabilities, 'reasoningAdapter'),
    contextWindowTokens,
    maxOutputTokens,
  }
}

export function channelModelDisplayName(
  row: ChannelModelRow,
  model: ModelProfile,
  isMultiModelChannel: boolean,
): string {
  const rowName = (row.name ?? '').trim()
  if (rowName !== '') return rowName
  const rowModelName = (row.modelName ?? '').trim()
  if (isMultiModelChannel) return rowModelName
  if (model.name !== undefined) return model.name
  return rowModelName
}

export function savedProfileTemperature(row: ChannelModelRow, model: ModelProfile): number {
  if (typeof row.temperature === 'number') return row.temperature
  return model.temperature ?? 0.7
}

export function pickDefinedCapability<K extends 'toolCalling' | 'reasoningAdapter'>(
  presetCaps: ModelCapabilities | undefined,
  modelCaps: ModelCapabilities | undefined,
  key: K,
): Partial<Pick<ModelCapabilities, K>> {
  if (presetCaps?.[key] !== undefined) return { [key]: presetCaps[key] } as Pick<ModelCapabilities, K>
  if (modelCaps?.[key] !== undefined) return { [key]: modelCaps[key] } as Pick<ModelCapabilities, K>
  return {}
}

export type LocalizedText = (zhCNText: string, enUSText: string) => string

export function busyActionLabel(
  busy: boolean,
  text: LocalizedText,
  busyZh: string,
  busyEn: string,
  idleZh: string,
  idleEn: string,
): string {
  if (busy) return text(busyZh, busyEn)
  return text(idleZh, idleEn)
}
export type ModelTestStatus = { status: 'idle' | 'testing' | 'success' | 'error'; error?: string }
export function modelTestStatusPresentation(
  testInfo: ModelTestStatus,
  text: LocalizedText,
): { dotClass: string; statusText: string } {
  if (testInfo.status === 'testing') {
    return {
      dotClass: 'bg-amber-400 animate-pulse ring-2 ring-amber-400/30',
      statusText: text('正在测试连接...', 'Testing...'),
    }
  }
  if (testInfo.status === 'success') {
    return {
      dotClass: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]',
      statusText: text('测试通过：连接正常可用', 'Passed: Available'),
    }
  }
  if (testInfo.status === 'error') {
    return {
      dotClass: 'bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]',
      statusText: text(`测试未通过：${testInfo.error || '无法连接'}`, `Failed: ${testInfo.error || 'Cannot connect'}`),
    }
  }
  return {
    dotClass: 'bg-neutral-300 dark:bg-neutral-600',
    statusText: text('未测试连通性（点击可单独测试）', 'Not tested (click to test)'),
  }
}

/** Open only an allowlisted provider resource through the trusted main-process IPC boundary. */
export async function openModelProviderResource(resource: ModelProviderResourceId, text: LocalizedText): Promise<void> {
  try {
    const result = await ipc.invoke('model-provider-resource:open', resource)
    if (!result.success) throw new Error(result.error || text('无法打开服务商页面', 'Unable to open provider page'))
  } catch (error) {
    alertError(String(error), { title: text('打开链接失败', 'Unable to open link') })
  }
}

export function discoveryNoticeMessage(
  notice: ModelDiscoveryErrorCode | null,
  text: LocalizedText,
): string | null {
  switch (notice) {
    case 'auth':
      return text('鉴权失败：请检查 API Key。手工模型 ID 仍可使用。', 'Authentication failed. Check the API key. Manual model IDs remain available.')
    case 'unsupported':
      return text('该端点不支持标准模型列表接口。请继续手工填写模型 ID。', 'This endpoint does not support the standard model-list API. Continue with a manual model ID.')
    case 'network':
      return text('网络请求失败，请检查端点或网络后重试。手工模型 ID 仍可使用。', 'The network request failed. Check the endpoint or network and retry. Manual model IDs remain available.')
    case 'invalid_response':
      return text('端点返回了无法识别的模型列表。请继续手工填写模型 ID。', 'The endpoint returned an invalid model list. Continue with a manual model ID.')
    case 'empty':
      return text('端点返回了空模型列表。请继续手工填写模型 ID。', 'The endpoint returned an empty model list. Continue with a manual model ID.')
    default:
      return null
  }
}
