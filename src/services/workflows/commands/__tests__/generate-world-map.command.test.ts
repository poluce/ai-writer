import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useProjectStore } from '../../../../stores/project-store'
import { useLLMStore } from '../../../../stores/llm-store'
import { setActiveProjectSessionContext } from '../../../../shared/project-session-context'
import type { StepCallbacks, WorkflowContext } from '../../../../stores/workflow-store'
import type { WorldMapArtifact } from '../../../../shared/world-map'
import { GenerateWorldMapCommand } from '../generate-world-map.command'
import { workflowRuntimeDependencies } from './workflow-generation-runtime.fixture'

const projectPath = 'C:\\novels\\world-map-command'
const context: WorkflowContext = {
  runId: 'world-map-command',
  projectPath,
  projectSession: { projectId: 'world-map-command', projectPath },
  writingLanguage: 'zh-CN',
  uiLocale: 'zh-CN',
  data: {},
  cancelled: false,
  generationModelId: 'model-1',
}
const callbacks: StepCallbacks = {
  log: vi.fn(),
  setProgress: vi.fn(),
  appendText: vi.fn(),
}

function artifact(): WorldMapArtifact {
  return {
    worldName: '九域',
    premise: '五域以灵脉为界。',
    tiers: [{ name: '超一流' }, { name: '一流' }],
    realms: [{ name: '练气' }, { name: '筑基' }],
    regions: [
      { name: '中原', continent: '玄洲', direction: 'center', terrain: '平原', summary: '灵脉中心。', adjacent: ['东海'] },
      { name: '东海', continent: '玄洲', direction: 'east', terrain: '群岛', summary: '外海航路。', adjacent: ['中原'] },
    ],
    factions: [
      { name: '天枢宗', kind: 'sect', region: '中原', tier: '超一流', resource: '灵脉', summary: '垄断飞升。' },
      { name: '太一宫', kind: 'sect', region: '东海', tier: '一流', resource: '航路', summary: '掌握外海。' },
    ],
    relations: [{ from: '天枢宗', to: '太一宫', kind: 'enemy', note: '名额之争' }],
  }
}

function validCompletion(artifactValue: WorldMapArtifact) {
  return {
    content: '',
    artifact: artifactValue as unknown as Record<string, unknown>,
    finishReason: 'stop' as const,
    receipt: {} as never,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useLLMStore.setState({ defaultModelId: 'model-1' })
  const project = {
    id: 'world-map-command',
    name: '掌管仙宗差点被推翻',
    path: projectPath,
    novelConfig: {
      genre: '仙侠',
      coreOutline: '散修逆炼死煞。',
      worldSetting: '五域以灵脉为界。',
      goldenFinger: '逆命道鉴。',
      protagonistProfile: '李宣。',
    },
  }
  useProjectStore.setState({ currentProject: project as never })
  setActiveProjectSessionContext({ projectId: project.id, projectPath })
})

afterEach(() => {
  setActiveProjectSessionContext(null)
  useProjectStore.setState({ currentProject: null })
  vi.restoreAllMocks()
})

describe('GenerateWorldMapCommand', () => {
  it('uses the submit_world_map tool and returns a normalized draft without writing files', async () => {
    const command = new GenerateWorldMapCommand(workflowRuntimeDependencies)
    const call = vi.spyOn(command as unknown as {
      callLLMResult: (...args: never[]) => Promise<unknown>
    }, 'callLLMResult').mockResolvedValue(validCompletion(artifact()))

    const result = await command.execute({ step: {}, context, callbacks })

    expect(result.worldName).toBe('九域')
    expect(result.regions).toHaveLength(2)
    expect(result.factions[0].id).toBe('faction-1')
    expect(call).toHaveBeenCalledTimes(1)
    const options = call.mock.calls[0]?.[3] as unknown
    expect(options).toMatchObject({ submitTool: 'submit_world_map' })
    expect(useProjectStore.getState().currentProject?.novelConfig.coreOutline).toBe('散修逆炼死煞。')
  })

  it('asks the model to repair once when the tool arguments fail validation', async () => {
    const broken = artifact()
    broken.regions[0].adjacent = ['不存在区域']
    const command = new GenerateWorldMapCommand(workflowRuntimeDependencies)
    const call = vi.spyOn(command as unknown as {
      callLLMResult: (...args: never[]) => Promise<unknown>
    }, 'callLLMResult')
      .mockResolvedValueOnce(validCompletion(broken))
      .mockResolvedValueOnce(validCompletion(artifact()))

    const result = await command.execute({ step: {}, context, callbacks })

    expect(call).toHaveBeenCalledTimes(2)
    expect(result.regions[0].adjacentRegionIds).toEqual([result.regions[1].id])
    expect(String(call.mock.calls[1]?.[0])).toContain('不存在区域')
  })
})
