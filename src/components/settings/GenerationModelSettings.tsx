/**
 * 渠道与模型设置区 — LLMSection 组合根。
 * 表单、渠道卡片、发现弹层与共享逻辑已拆至同目录各模块。
 */
import { useState, useEffect, useMemo } from 'react'
import { Plus, Zap, ExternalLink } from 'lucide-react'
import { useLLMStore } from '../../stores/llm-store'
import type { ModelProfile } from '../../shared/ipc-channels'
import { BUILTIN_PRESETS } from '../../shared/provider-presets'
import { createModelProfileDraft } from '../../shared/model-profile-draft'
import { channelHasModel, groupModelsByChannel } from '../../shared/agent-runtime'
import { randomUUID } from '../../utils/id'
import { Button } from '../ui/Button'
import { useLocaleStore } from '../../stores/locale-store'
import { openModelProviderResource } from './generation-model-settings-shared'
import { ChannelCard } from './GenerationModelChannelCard'
import { ModelForm } from './GenerationModelForm'

export function LLMSection({
  purposes,
  purposeLabel,
}: {
  purposes: ModelProfile['purposes']
  purposeLabel: string
}) {
  const text = useLocaleStore(s => s.text)
  const models = useLLMStore(s => s.models)
  const defaultModelId = useLLMStore(s => s.defaultModelId)
  const defaultEmbeddingModelId = useLLMStore(s => s.defaultEmbeddingModelId)
  const loaded = useLLMStore(s => s.loaded)
  const loadModels = useLLMStore(s => s.loadModels)
  const saveModel = useLLMStore(s => s.saveModel)
  const deleteModel = useLLMStore(s => s.deleteModel)
  const setDefaultModel = useLLMStore(s => s.setDefaultModel)
  const setDefaultEmbeddingModel = useLLMStore(s => s.setDefaultEmbeddingModel)
  const [editingModel, setEditingModel] = useState<ModelProfile | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!loaded) loadModels()
  }, [loaded, loadModels])

  const filtered = models.filter((m) =>
    m.purposes?.some((p) => purposes.includes(p as ModelProfile['purposes'][number]))
  )
  const channelGroups = useMemo(() => groupModelsByChannel(filtered), [filtered])

  /** 创建新模型草稿；向量模型由工厂选择完整的 SiliconFlow 默认值。 */
  const handleAdd = () => {
    setEditingModel(createModelProfileDraft({
      id: randomUUID(),
      purposes: [...purposes],
    }))
  }

  /**
   * 把一个渠道下的多个模型一次加进来。
   *
   * 存档结构保持扁平（一个模型 = 一条档案），这里只把当前表单的渠道字段
   * （provider / protocol / baseUrl / apiKey 与高级设置）复制过去、换掉模型名；
   * 同一渠道里已经存在的模型名直接跳过。
   */
  const handleAddModels = async (template: ModelProfile, modelNames: readonly string[]) => {
    for (const modelName of modelNames) {
      const known = useLLMStore.getState().models
      if (channelHasModel(known, template, modelName)) continue
      const saved = await saveModel({
        ...template,
        id: randomUUID(),
        name: modelName,
        modelName,
        purposes: [...purposes],
      })
      if (!saved) return
    }
  }

  const isEmbeddingSection = purposes.includes('embedding')
  const openSiliconFlowInvite = () => void openModelProviderResource('siliconflow-invite', text)

  /** 保存模型（支持单模型或本渠道批量保存）；若是该分类第一个则自动设为默认 */
  const handleSave = async (modelsToSave?: ModelProfile[], deletedIds?: string[]) => {
    if (!editingModel) return
    setSaving(true)
    try {
      const targets = (modelsToSave && modelsToSave.length > 0) ? modelsToSave : [editingModel]
      let firstSavedId = editingModel.id
      for (const target of targets) {
        const ok = await saveModel(target)
        if (!ok) return
        firstSavedId = target.id
      }
      if (deletedIds && deletedIds.length > 0) {
        for (const id of deletedIds) {
          await deleteModel(id)
        }
      }

      const countBefore = filtered.length
      if (countBefore === 0 && targets.some(t => (t.modelName ?? '').trim())) {
        const defaultCandidate = targets.find(t => (t.modelName ?? '').trim())?.id || firstSavedId
        if (isEmbeddingSection) {
          await setDefaultEmbeddingModel(defaultCandidate)
        } else {
          await setDefaultModel(defaultCandidate)
        }
      }
      setEditingModel(null)
    } finally {
      setSaving(false)
    }
  }


  return (
    <div className="space-y-4">
      {editingModel && (
        <ModelForm
          key={editingModel.id}
          model={editingModel}
          onChange={setEditingModel}
          onSave={handleSave}
          onCancel={() => setEditingModel(null)}
          saving={saving}
          purposeOptions={purposes}
          presets={BUILTIN_PRESETS}
          existingModels={models}
          onAddModels={handleAddModels}
        />
      )}

      {!editingModel && (
        <>
          {isEmbeddingSection && (
            <div
              className="flex items-center justify-between gap-4 rounded-xl px-4 py-3"
              style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-panel)' }}
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                  {text('免费向量模型推荐', 'Free embedding model recommendation')}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {text('SiliconFlow 提供免费的 BAAI/bge-m3；注册后仅需填写 API Key 即可使用。', 'SiliconFlow provides the free BAAI/bge-m3 model. Register, then add your API Key to use it.')}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={openSiliconFlowInvite} className="flex-shrink-0">
                {text('免费模型注册链接', 'Free model registration')}
                <ExternalLink size={13} />
              </Button>
            </div>
          )}

          {channelGroups.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-16 gap-3 rounded-xl"
              style={{ border: '1.5px dashed var(--color-border)' }}
            >
              <Zap size={28} style={{ color: 'var(--color-text-muted)', opacity: 0.5 }} />
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {text(`暂无${purposeLabel}配置`, `No ${purposeLabel} configured`)}
              </span>
              <Button size="sm" variant="outline" onClick={handleAdd}>
                <Plus size={13} />
                {text(`添加第一个${purposeLabel}`, `Add first ${purposeLabel}`)}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {channelGroups.map((group) => (
                <ChannelCard
                  key={group.key}
                  group={group}
                  defaultModelId={isEmbeddingSection ? defaultEmbeddingModelId : defaultModelId}
                  onEdit={() => {
                    setEditingModel({ ...group.representative })
                  }}
                  onDelete={async () => {
                    const channelTitle = group.channelName || group.representative.name || group.label
                    const modelCount = group.models.length
                    const confirmed = window.confirm(
                      text(
                        `确定要删除渠道「${channelTitle}」吗？${modelCount > 0 ? `该渠道下的 ${modelCount} 个模型配置都将被删除。` : ''}`,
                        `Are you sure you want to delete channel "${channelTitle}"?${modelCount > 0 ? ` All ${modelCount} models will be deleted.` : ''}`,
                      ),
                    )
                    if (!confirmed) return
                    const idsToDelete = new Set(group.models.map(m => m.profile.id))
                    idsToDelete.add(group.representative.id)
                    for (const id of idsToDelete) {
                      await deleteModel(id)
                    }
                  }}
                />
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full py-2 border-dashed hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
                onClick={handleAdd}
                aria-label={text('添加', 'Add')}
              >
                <Plus size={13} />
                {text('添加', 'Add')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
