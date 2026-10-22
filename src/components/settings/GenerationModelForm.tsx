/**
 * 模型编辑表单 — 渠道字段、渠道内多模型行、连通性测试与模型发现。
 * 从 GenerationModelSettings 拆出；保存/删除由 LLMSection 注入。
 */
import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import {
  Plus, Trash2, Save, X,
  Settings2, Zap, Eye, EyeOff, ChevronDown,
  RefreshCw, ArrowLeft,
} from 'lucide-react'
import type {
  DiscoveredModel,
  ModelDiscoveryErrorCode,
  ModelProfile,
} from '../../shared/ipc-channels'
import { LOW_VRAM_EMBEDDING_OPTIONS, normalizeEmbeddingOptions } from '../../shared/embedding-options'
import type { ModelCapabilities, ProviderPreset } from '../../shared/provider-presets'
import { normalizedModelBaseUrl } from '../../shared/agent-runtime'
import { generationModelLacksToolCalling, toolCallingRequiredMessage } from '../../shared/tool-calling-gate'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Label } from '../ui/Label'
import { NativeSelect } from '../ui/NativeSelect'
import { cn } from '../../lib/utils'
import { useLLMStore } from '../../stores/llm-store'
import { useLocaleStore } from '../../stores/locale-store'
import { randomUUID } from '../../utils/id'
import { toast } from '../ui/Toast'
import {
  type ChannelModelRow,
  advancedSettingsIconStyle,
  advancedSettingsToggleClass,
  busyActionLabel,
  channelModelDisplayName,
  channelModelRowFromProfile,
  channelSaveDisabled,
  discoveredModelOptionLabel,
  discoveryNoticeMessage,
  mergedModelCapabilities,
  openModelProviderResource,
  savedProfileTemperature,
  thrownMessage,
} from './generation-model-settings-shared'
import { ConnectionTestResultBanner, ModelTestStatusButton } from './GenerationModelTestStatus'
import { FetchModelsModal } from './GenerationModelFetchModal'

/** 模型编辑表单 */
export function ModelForm({
  model, onChange, onSave, onCancel, saving, presets, existingModels, onAddModels,
}: {
  model: ModelProfile
  onChange: (m: ModelProfile) => void
  onSave: (modelsToSave?: ModelProfile[], deletedIds?: string[]) => void
  onCancel: () => void
  saving: boolean
  purposeOptions: ModelProfile['purposes']
  /** 服务商预设（来自 BUILTIN_PRESETS 常量） */
  presets: ProviderPreset[]
  /** 已保存的全部档案：用来判断该渠道下哪些模型已经加过。 */
  existingModels: readonly ModelProfile[]
  /** 把发现到的模型批量加成同一渠道下的新档案。 */
  onAddModels: (template: ModelProfile, modelNames: readonly string[]) => Promise<void>
}) {
  const text = useLocaleStore(s => s.text)
  const locale = useLocaleStore(s => s.locale)
  const [showKey, setShowKey] = useState(false)
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false)

  const initialChannelProfiles = useMemo(() => {
    const list: ModelProfile[] = []
    if (model.modelName?.trim()) list.push(model)
    const others = existingModels.filter(m => (
      m.id !== model.id &&
      m.provider === model.provider &&
      m.protocol === model.protocol &&
      normalizedModelBaseUrl(m.baseUrl) === normalizedModelBaseUrl(model.baseUrl) &&
      m.apiKey === model.apiKey
    ))
    for (const other of others) {
      if (other.modelName?.trim()) list.push(other)
    }
    return list
  }, [existingModels, model])

  const initialModelIds = useMemo(() => new Set(initialChannelProfiles.map(p => p.id)), [initialChannelProfiles])

  const isEmbedding = model.purposes?.includes('embedding')
  const embeddingOptions = normalizeEmbeddingOptions(model.embeddingOptions)
  const presetMap = new Map(presets.map((p) => [p.provider, p]))
  const preset = presetMap.get(model.provider)
  function capabilitiesForPresetModel(modelName: string): ModelCapabilities | undefined {
    if (isEmbedding) return preset?.embeddingModelCapabilities?.[modelName]
    return preset?.models.find((candidate) => candidate.name === modelName)?.capabilities
  }

  const initialChannelName = useMemo(() => {
    const modelChannel = model.channelName?.trim()
    if (modelChannel) return modelChannel
    const profileChannel = initialChannelProfiles.find(p => p.channelName?.trim())?.channelName?.trim()
    if (profileChannel) return profileChannel
    const modelNameStr = (model.modelName ?? '').trim()
    const nameStr = (model.name ?? '').trim()
    if (nameStr && nameStr !== modelNameStr) return nameStr
    return ''
  }, [initialChannelProfiles, model])

  const [channelName, setChannelName] = useState(initialChannelName)

  const [channelModels, setChannelModels] = useState<ChannelModelRow[]>(() => (
    initialChannelProfiles.map(profile => (
      channelModelRowFromProfile(
        profile,
        capabilitiesForPresetModel(profile.modelName),
        initialChannelName,
      )
    ))
  ))

  const [expandedModelId, setExpandedModelId] = useState<string | null>(null)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean, error?: string } | null>(null)
  const [modelTestStatuses, setModelTestStatuses] = useState<Record<string, { status: 'idle' | 'testing' | 'success' | 'error'; error?: string }>>({})
  const testConnection = useLLMStore(s => s.testConnection)
  const discoverModels = useLLMStore(s => s.discoverModels)
  const [discovering, setDiscovering] = useState(false)
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([])
  const [discoveryNotice, setDiscoveryNotice] = useState<ModelDiscoveryErrorCode | null>(null)
  const discoveryRevision = useRef(0)
  const currentDiscoveryConfig = useRef({
    id: model.id,
    provider: model.provider,
    protocol: model.protocol,
    baseUrl: model.baseUrl,
    apiKey: model.apiKey,
  })

  useLayoutEffect(() => {
    currentDiscoveryConfig.current = {
      id: model.id,
      provider: model.provider,
      protocol: model.protocol,
      baseUrl: model.baseUrl,
      apiKey: model.apiKey,
    }
  }, [model.apiKey, model.baseUrl, model.id, model.protocol, model.provider])

  useEffect(() => () => {
    discoveryRevision.current += 1
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showDiscoveryModal) {
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, showDiscoveryModal])

  const invalidateDiscovery = () => {
    discoveryRevision.current += 1
    setDiscovering(false)
    setDiscoveredModels([])
    setDiscoveryNotice(null)
    setShowDiscoveryModal(false)
  }

  /** 更新单个字段 */
  const up = <K extends keyof ModelProfile>(key: K, val: ModelProfile[K]) => {
    if (key === 'provider' || key === 'protocol' || key === 'baseUrl' || key === 'apiKey') {
      invalidateDiscovery()
    }
    onChange({ ...model, [key]: val })
  }

  /**
   * 切换服务商：从持久化预设中自动填充 baseUrl / protocol
   * 并将模型名重置为该服务商的第一个预设模型
   */
  const handleProviderChange = (provider: ModelProfile['provider']) => {
    const p = presetMap.get(provider)
    const firstModel = isEmbedding ? null : (p?.models[0] ?? null)
    const defaultModelName = isEmbedding
      ? (p?.embeddingModels[0] ?? '')
      : (firstModel?.name ?? '')
    const capabilities = isEmbedding
      ? p?.embeddingModelCapabilities?.[defaultModelName]
      : firstModel?.capabilities
    invalidateDiscovery()
    onChange({
      ...model,
      provider,
      protocol: (p?.protocol ?? 'openai') as 'openai' | 'gemini',
      baseUrl: p?.baseUrl ?? '',
      modelName: defaultModelName,
      maxTokens: capabilities?.maxOutputTokens ?? firstModel?.maxTokens ?? 4096,
      capabilities: capabilities ? { ...capabilities } : undefined,
    })
  }

  const handleTestSingleModel = async (targetId: string) => {
    const target = channelModels.find(m => m.id === targetId)
    const targetModelName = (target?.modelName ?? '').trim()
    if (!target || !targetModelName) {
      setModelTestStatuses(prev => ({
        ...prev,
        [targetId]: { status: 'error', error: text('模型 ID 不能为空', 'Model ID cannot be empty') },
      }))
      return false
    }

    setModelTestStatuses(prev => ({
      ...prev,
      [targetId]: { status: 'testing' },
    }))

    try {
      const targetName = (target.name ?? '').trim()
      const result = await testConnection({
        ...model,
        modelName: targetModelName,
        name: targetName || targetModelName,
        temperature: target.temperature ?? 0.7,
        maxTokens: target.maxOutputTokens ?? 4096,
        capabilities: {
          reasoning: model.capabilities?.reasoning ?? false,
          structuredOutput: model.capabilities?.structuredOutput ?? false,
          usage: model.capabilities?.usage ?? false,
          ...(model.capabilities?.toolCalling !== undefined ? { toolCalling: model.capabilities.toolCalling } : {}),
          ...(model.capabilities?.reasoningAdapter ? { reasoningAdapter: model.capabilities.reasoningAdapter } : {}),
          contextWindowTokens: target.contextWindowTokens ?? null,
          maxOutputTokens: target.maxOutputTokens ?? 4096,
        },
      })
      setModelTestStatuses(prev => ({
        ...prev,
        [targetId]: {
          status: result.success ? 'success' : 'error',
          error: result.error,
        },
      }))
      return result.success
    } catch (err) {
      setModelTestStatuses(prev => ({
        ...prev,
        [targetId]: {
          status: 'error',
          error: thrownMessage(err),
        },
      }))
      return false
    }
  }

  const handleTestAllModels = async () => {
    const validModels = channelModels.filter(m => (m.modelName ?? '').trim() !== '')
    if (validModels.length === 0) {
      toast.warning(text('请先输入至少一个模型 ID', 'Please enter at least one model ID'))
      return
    }

    setTesting(true)
    setTestResult(null)

    const results = await Promise.all(
      channelModels.map(m => handleTestSingleModel(m.id))
    )

    const passedCount = results.filter(Boolean).length
    const totalCount = channelModels.length
    setTesting(false)

    if (passedCount === totalCount) {
      setTestResult({ success: true })
      toast.success(text(`全部 ${passedCount} 个模型测试通过！`, `All ${passedCount} models connected successfully!`))
    } else if (passedCount > 0) {
      setTestResult({ success: false, error: `${passedCount}/${totalCount} 可用` })
      toast.warning(text(`部分通过：${passedCount}/${totalCount} 个模型连通可用，${totalCount - passedCount} 个失败`, `Partial: ${passedCount}/${totalCount} models available, ${totalCount - passedCount} failed`))
    } else {
      setTestResult({ success: false, error: text('所有模型均测试失败', 'All models failed') })
      toast.error(text('所有模型均连接失败，请检查 API Key、Base URL 或网络代理', 'All models failed. Check your API Key, Base URL, or network'))
    }
    setTimeout(() => setTestResult(null), 4000)
  }

  const handleDiscoverModels = async () => {
    const requestRevision = discoveryRevision.current + 1
    discoveryRevision.current = requestRevision
    const requestConfig = { ...currentDiscoveryConfig.current }
    const isCurrentRequest = () => {
      const current = currentDiscoveryConfig.current
      return discoveryRevision.current === requestRevision
        && current.id === requestConfig.id
        && current.provider === requestConfig.provider
        && current.protocol === requestConfig.protocol
        && current.baseUrl === requestConfig.baseUrl
        && current.apiKey === requestConfig.apiKey
    }
    setDiscovering(true)
    setDiscoveredModels([])
    setDiscoveryNotice(null)
    try {
      const result = await discoverModels({
        provider: model.provider,
        protocol: model.protocol,
        baseUrl: model.baseUrl,
        apiKey: model.apiKey,
      })
      if (!isCurrentRequest()) return
      if (result.success) {
        setDiscoveredModels(result.models)
        setShowDiscoveryModal(true)
      } else {
        setDiscoveryNotice(result.errorCode)
      }
    } catch {
      if (isCurrentRequest()) setDiscoveryNotice('network')
    } finally {
      if (isCurrentRequest()) setDiscovering(false)
    }
  }

  const discoveryNoticeText = discoveryNoticeMessage(discoveryNotice, text)

  return (
    <div
      className="rounded-xl p-5 space-y-4"
      style={{ border: '1.5px solid var(--color-accent)', backgroundColor: 'var(--color-panel)' }}
    >
      <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer py-1 px-2 rounded-md hover:bg-[var(--color-hover)]"
        >
          <ArrowLeft size={14} />
          <span>{text('返回列表', 'Back to list')}</span>
        </button>
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {channelName ? text(`编辑渠道：${channelName}`, `Edit channel: ${channelName}`) : text('新建渠道配置', 'New channel configuration')}
        </span>
        <button
          type="button"
          onClick={onCancel}
          title={text('取消并返回', 'Cancel and return')}
          aria-label={text('返回', 'Back')}
          className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      {generationModelLacksToolCalling(model) && (
        <div className="text-xs rounded-lg px-3 py-2 bg-[var(--color-error)]/10 text-[var(--color-error-text)]">
          {toolCallingRequiredMessage(locale)}
        </div>
      )}

      <div>
        <Label>{text('渠道名称', 'Channel name')}</Label>
        <Input
          value={channelName}
          onChange={(e) => {
            const val = e.target.value
            setChannelName(val)
            up('channelName', val)
          }}
          placeholder={text('如：hajimi / 自定义中转', 'e.g. hajimi / Custom gateway')}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{text('服务商', 'Provider')}</Label>
          <NativeSelect
            value={model.provider}
            onChange={(e) => handleProviderChange(e.target.value as ModelProfile['provider'])}
          >
            {presets.length > 0 ? (
              presets.map((p) => (
                <option key={p.provider} value={p.provider}>
                  {p.displayName || p.provider}
                </option>
              ))
            ) : (
              <>
                <option value="openai">OpenAI</option>
                <option value="deepseek">DeepSeek</option>
                <option value="gemini">Google Gemini</option>
                <option value="xai">xAI</option>
                <option value="siliconflow">SiliconFlow</option>
                <option value="ollama">Ollama</option>
                <option value="bigmodel">BigModel</option>
              </>
            )}
            {!presets.some((p) => p.provider === 'custom') && (
              <option value="custom">{text('自定义', 'Custom')}</option>
            )}
          </NativeSelect>
        </div>
        <div>
          <Label>{text('调用协议', 'Protocol')}</Label>
          <NativeSelect
            value={model.protocol}
            onChange={(e) => up('protocol', e.target.value as 'openai' | 'gemini')}
          >
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
            <option value="anthropic">Anthropic</option>
          </NativeSelect>
        </div>
      </div>

      <div>
        <Label>{text('base_url', 'base_url')}</Label>
        <Input
          value={model.baseUrl}
          onChange={(e) => up('baseUrl', e.target.value)}
          placeholder="https://api.openai.com"
        />
        {model.provider !== 'custom' && (
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {text(`已自动填入 ${model.provider} 官方地址，如使用中转地址可手动修改`, `The official ${model.provider} URL was filled automatically. Edit it when using a gateway.`)}
          </p>
        )}
      </div>

      <div>
        <Label>{text('API Key', 'API Key')}</Label>
        <div className="relative">
          <Input
            type={showKey ? 'text' : 'password'}
            value={model.apiKey}
            onChange={(e) => up('apiKey', e.target.value)}
            placeholder={model.provider === 'ollama' ? text('本地部署可留空', 'Optional for local deployment') : 'sk-...'}
            className="pr-9"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      {isEmbedding && model.provider === 'siliconflow' && (
        <div className="rounded-lg p-3 space-y-2" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover)' }}>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {text('BAAI/bge-m3 当前在 SiliconFlow 提供免费调用。完成实名认证后可使用，仍受固定速率限制约束。', 'BAAI/bge-m3 is currently free on SiliconFlow. Verification is required; fixed rate limits still apply.')}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <button type="button" onClick={() => void openModelProviderResource('siliconflow-invite', text)} className="text-[var(--color-accent)] hover:underline cursor-pointer">
              {text('邀请注册链接', 'Invitation registration link')}
            </button>
            <button type="button" onClick={() => void openModelProviderResource('siliconflow-console', text)} className="text-[var(--color-accent)] hover:underline cursor-pointer">
              {text('官方控制台', 'Official console')}
            </button>
            <button type="button" onClick={() => void openModelProviderResource('siliconflow-docs', text)} className="text-[var(--color-accent)] hover:underline cursor-pointer">
              {text('官方文档', 'Official documentation')}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-lg p-3" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover)' }}>
        <div className="flex items-center justify-between gap-3">
          <Label className="mb-0">
            {text('模型列表', 'Models')}
          </Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleTestAllModels}
              disabled={testing || channelModels.length === 0}
            >
              <Zap size={13} className={testing ? 'animate-pulse text-[var(--color-accent)]' : undefined} />
              {busyActionLabel(testing, text, '测试中...', 'Testing...', '测试连接', 'Test connection')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleDiscoverModels}
              disabled={discovering}
            >
              <RefreshCw size={13} className={discovering ? 'animate-spin' : undefined} />
              {busyActionLabel(discovering, text, '获取中...', 'Refreshing...', '获取模型列表', 'Refresh model list')}
            </Button>
          </div>
        </div>

        {discoveredModels.length > 0 && (
          <NativeSelect
            aria-label={text('端点模型列表', 'Endpoint model list')}
            value=""
            onChange={(event) => {
              const value = event.target.value
              if (!value) return
              const presetCaps = capabilitiesForPresetModel(value)
              setChannelModels(prev => {
                if (prev.length <= 1) {
                  const targetId = prev[0]?.id || model.id
                  return [{
                    id: targetId,
                    modelName: value,
                    name: prev[0]?.name || '',
                    temperature: prev[0]?.temperature ?? model.temperature ?? 0.7,
                    contextWindowTokens: prev[0]?.contextWindowTokens ?? model.capabilities?.contextWindowTokens ?? presetCaps?.contextWindowTokens ?? null,
                    maxOutputTokens: prev[0]?.maxOutputTokens ?? model.capabilities?.maxOutputTokens ?? model.maxTokens ?? presetCaps?.maxOutputTokens ?? 4096,
                  }]
                }
                const emptyIdx = prev.findIndex(m => !(m.modelName ?? '').trim())
                if (emptyIdx >= 0) {
                  return prev.map((m, i) => i === emptyIdx ? {
                    ...m,
                    modelName: value,
                    contextWindowTokens: m.contextWindowTokens ?? presetCaps?.contextWindowTokens ?? null,
                    maxOutputTokens: m.maxOutputTokens ?? presetCaps?.maxOutputTokens ?? 4096,
                  } : m)
                }
                if (prev.some(m => m.modelName === value)) return prev
                return [...prev, {
                  id: randomUUID(),
                  modelName: value,
                  name: '',
                  temperature: 0.7,
                  contextWindowTokens: presetCaps?.contextWindowTokens ?? null,
                  maxOutputTokens: presetCaps?.maxOutputTokens ?? 4096,
                }]
              })
            }}
          >
            <option value="">{text('选择端点返回的模型（快捷填入）', 'Choose a model returned by the endpoint')}</option>
            {discoveredModels.map(candidate => (
              <option key={`${candidate.id}:${candidate.value}`} value={candidate.value}>
                {discoveredModelOptionLabel(candidate)}
              </option>
            ))}
          </NativeSelect>
        )}

        <FetchModelsModal
          open={showDiscoveryModal}
          onClose={() => setShowDiscoveryModal(false)}
          discoveredModels={discoveredModels}
          alreadyAddedModelNames={channelModels.map(m => m.modelName).filter(Boolean)}
          onAddModels={(modelNames) => {
            const toAdd = modelNames.filter(name => !channelModels.some(m => m.modelName === name))
            setChannelModels(prev => [
              ...prev,
              ...toAdd.map(name => ({ id: randomUUID(), modelName: name, name }))
            ])
            void onAddModels(model, modelNames)
          }}
        />

        {discoveryNoticeText && (
          <p role="status" className="text-xs" style={{ color: 'var(--color-error-text)' }}>
            {discoveryNoticeText}
          </p>
        )}

        {channelModels.length === 0 ? (
          <div className="text-xs py-4 px-3 text-center rounded-md border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-bg)]">
            {text('该渠道下暂无模型。点击下方「+ 添加模型」或右侧「获取模型列表」添加。', 'No models in this channel. Click "+ Add model" or fetch from endpoint.')}
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            {channelModels.map((item, index) => (
              <div key={item.id} className="rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] p-2 transition-all">
                <div className="flex items-center gap-2">
                  <Input
                    value={item.modelName}
                    placeholder={text('模型 ID (如 gemini-3.8-flash-high)', 'Model ID (e.g. gemini-3.8-flash-high)')}
                    className="flex-1 text-xs"
                    onChange={(e) => {
                      const val = e.target.value
                      const presetCaps = capabilitiesForPresetModel(val)
                      setChannelModels(prev => prev.map((m, i) => i === index ? {
                        ...m,
                        modelName: val,
                        ...(presetCaps?.contextWindowTokens ? { contextWindowTokens: presetCaps.contextWindowTokens } : {}),
                        ...(presetCaps?.maxOutputTokens ? { maxOutputTokens: presetCaps.maxOutputTokens } : {}),
                      } : m))
                      setModelTestStatuses(prev => ({ ...prev, [item.id]: { status: 'idle' } }))
                    }}
                  />
                  <Input
                    value={item.name}
                    placeholder={text('模型别名 (可选，留空同模型 ID)', 'Model alias (optional, defaults to model ID)')}
                    className="flex-1 text-xs"
                    onChange={(e) => {
                      const val = e.target.value
                      setChannelModels(prev => prev.map((m, i) => i === index ? { ...m, name: val } : m))
                    }}
                  />

                  <button
                    type="button"
                    title={text('高级参数设置（上下文窗口、温度、最大 Token）', 'Advanced settings (Context window, temperature, max tokens)')}
                    aria-label={text('高级设置', 'Advanced settings')}
                    aria-expanded={expandedModelId === item.id}
                    onClick={() => setExpandedModelId(cur => cur === item.id ? null : item.id)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded transition-colors cursor-pointer text-xs border border-[var(--color-border)]',
                      advancedSettingsToggleClass(expandedModelId === item.id),
                    )}
                  >
                    <Settings2 size={13} style={advancedSettingsIconStyle(expandedModelId === item.id)} />
                    <span className="text-[0.72rem] hidden sm:inline">{text('高级设置', 'Advanced settings')}</span>
                    <ChevronDown size={12} className={cn('transition-transform', expandedModelId === item.id && 'rotate-180')} />
                  </button>

                  <ModelTestStatusButton
                    testInfo={modelTestStatuses[item.id] || { status: 'idle' }}
                    text={text}
                    onTest={() => void handleTestSingleModel(item.id)}
                  />

                  <button
                    type="button"
                    title={text('删除模型', 'Remove model')}
                    aria-label={`${text('删除模型', 'Remove model')} ${index + 1}`}
                    onClick={() => {
                      setChannelModels(prev => prev.filter((_, i) => i !== index))
                      setModelTestStatuses(prev => {
                        const next = { ...prev }
                        delete next[item.id]
                        return next
                      })
                      if (expandedModelId === item.id) setExpandedModelId(null)
                    }}
                    className="p-1.5 rounded hover:bg-[var(--color-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-error-text)] transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {expandedModelId === item.id && (
                  <div className="mt-2.5 pt-2.5 border-t border-[var(--color-border)] space-y-2.5" data-model-advanced-settings>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <Label className="text-[0.72rem] mb-1">{text('上下文窗口', 'Context Window')}</Label>
                        <Input
                          aria-label={text('上下文窗口', 'Context Window')}
                          type="number"
                          min={0}
                          value={item.contextWindowTokens ?? ''}
                          placeholder={text('可选 (Tokens)', 'Optional (Tokens)')}
                          className="text-xs h-7"
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : parseInt(e.target.value) || null
                            setChannelModels(prev => prev.map((m, i) => i === index ? { ...m, contextWindowTokens: val } : m))
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-[0.72rem] mb-1">{text('温度', 'Temperature')}</Label>
                        <Input
                          aria-label={text('温度', 'Temperature')}
                          type="number"
                          min={0}
                          max={2}
                          step={0.1}
                          value={item.temperature ?? 0.7}
                          className="text-xs h-7"
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0.7 : parseFloat(e.target.value)
                            setChannelModels(prev => prev.map((m, i) => i === index ? { ...m, temperature: val } : m))
                          }}
                          onBlur={() => {
                            const val = Number(item.temperature)
                            if (Number.isNaN(val)) {
                              setChannelModels(prev => prev.map((m, i) => i === index ? { ...m, temperature: 0.7 } : m))
                            }
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-[0.72rem] mb-1">{text('最大输出 Token', 'Max output tokens')}</Label>
                        <Input
                          aria-label={text('最大输出 Token', 'Max output tokens')}
                          type="number"
                          min={0}
                          value={item.maxOutputTokens ?? 4096}
                          className="text-xs h-7"
                          onChange={(e) => {
                            const val = e.target.value === '' ? 4096 : parseInt(e.target.value) || 4096
                            setChannelModels(prev => prev.map((m, i) => i === index ? { ...m, maxOutputTokens: val } : m))
                          }}
                        />
                      </div>
                    </div>

                    {item.contextWindowTokens && item.maxOutputTokens && item.maxOutputTokens >= item.contextWindowTokens && (
                      <p
                        role="status"
                        className="rounded border px-2 py-1 text-[0.7rem] leading-normal"
                        style={{
                          borderColor: 'var(--color-warning)',
                          backgroundColor: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
                          color: 'var(--color-warning-text)',
                        }}
                      >
                        {text(
                          '最大输出接近或超过上下文窗口，建议预留足够的上下文空间给提示词与历史记录。',
                          'Max output approaches or exceeds the context window. Reserving ample room for prompts is recommended.',
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full mt-2"
          onClick={() => {
            setChannelModels(prev => [...prev, {
              id: randomUUID(),
              modelName: '',
              name: '',
              temperature: 0.7,
              contextWindowTokens: null,
              maxOutputTokens: 4096,
            }])
          }}
        >
          <Plus size={13} />
          {text('添加模型', 'Add model')}
        </Button>
      </div>

      {isEmbedding && (
        <div className="space-y-3 rounded-lg p-3" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label className="mb-0">{text('向量化高级参数', 'Embedding advanced settings')}</Label>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {text('按当前向量模型保存。降低批量数可减少本地显存占用；不会影响生成模型。', 'Saved with this embedding model. Lower batches reduce local VRAM use and do not affect generation models.')}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => up('embeddingOptions', LOW_VRAM_EMBEDDING_OPTIONS)}>
              {text('应用低显存推荐', 'Use low-VRAM preset')}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>{text('分块字符数', 'Chunk characters')}</Label>
              <Input type="number" min={100} max={4000} value={embeddingOptions.chunkSize}
                onChange={(e) => up('embeddingOptions', normalizeEmbeddingOptions({ ...embeddingOptions, chunkSize: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>{text('重叠字符数', 'Overlap characters')}</Label>
              <Input type="number" min={0} max={embeddingOptions.chunkSize - 1} value={embeddingOptions.chunkOverlap}
                onChange={(e) => up('embeddingOptions', normalizeEmbeddingOptions({ ...embeddingOptions, chunkOverlap: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>{text('请求批量', 'Request batch')}</Label>
              <Input type="number" min={1} max={50} value={embeddingOptions.batchSize}
                onChange={(e) => up('embeddingOptions', normalizeEmbeddingOptions({ ...embeddingOptions, batchSize: Number(e.target.value) }))} />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          className="flex-1"
          onClick={() => {
            const validModels = channelModels.filter(m => (m.modelName ?? '').trim() !== '')
            const isMultiModelChannel = validModels.length > 1 || Boolean(model.channelName)
            let finalChannelName: string | undefined
            if (isMultiModelChannel || model.channelName) {
              finalChannelName = channelName.trim() || undefined
            }

            const currentIds = new Set(validModels.map(m => m.id))
            const deletedIds = Array.from(initialModelIds).filter(id => !currentIds.has(id))

            if (validModels.length === 0) {
              const emptyChannelProfile: ModelProfile = {
                ...model,
                id: model.id,
                name: finalChannelName || model.name || '',
                channelName: finalChannelName,
                modelName: '',
              }
              const filteredDeletedIds = deletedIds.filter(id => id !== model.id)
              onSave([emptyChannelProfile], filteredDeletedIds)
              return
            }

            const profilesToSave: ModelProfile[] = validModels.map((row) => {
              const maxOutputTokens = row.maxOutputTokens ?? model.maxTokens ?? 4096
              const capabilities = mergedModelCapabilities(
                capabilitiesForPresetModel(row.modelName),
                model,
                row,
                maxOutputTokens,
              )
              const saved: ModelProfile = {
                ...model,
                id: row.id,
                modelName: (row.modelName ?? '').trim(),
                name: channelModelDisplayName(row, model, isMultiModelChannel),
                temperature: savedProfileTemperature(row, model),
                maxTokens: maxOutputTokens,
              }
              if (finalChannelName) saved.channelName = finalChannelName
              if (capabilities) saved.capabilities = capabilities
              return saved
            })

            onSave(profilesToSave, deletedIds)
          }}
          disabled={channelSaveDisabled(saving, model)}
        >
          <Save size={13} />
          {busyActionLabel(saving, text, '保存中...', 'Saving...', '保存配置', 'Save configuration')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>{text('取消', 'Cancel')}</Button>
      </div>
      {testResult && <ConnectionTestResultBanner result={testResult} text={text} />}
    </div>
  )
}
