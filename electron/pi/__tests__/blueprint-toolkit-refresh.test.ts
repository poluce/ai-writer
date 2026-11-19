import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../mcp/mcp-manager', () => ({
  mcpManager: {
    getAllTools: () => [],
  },
}))
vi.mock('../../database', () => ({
  getCurrentProjectPath: vi.fn(() => '/workspace/novel'),
  getProjectDb: vi.fn(() => ({})),
}))
vi.mock('../../repositories/blueprint-repository', () => ({
  BlueprintRepository: {
    getByChapter: vi.fn(),
    getAll: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    updateNotes: vi.fn(),
  },
}))

import type { RendererAction } from '../../../src/shared/agent-events'
import { BlueprintRepository } from '../../repositories/blueprint-repository'
import { buildBlueprintAgentTools } from '../tool-builder'

const getByChapterMock = BlueprintRepository.getByChapter as ReturnType<typeof vi.fn>
const upsertMock = BlueprintRepository.upsert as ReturnType<typeof vi.fn>

function blueprintProposalTool(sink: (action: RendererAction) => void) {
  const tool = buildBlueprintAgentTools('zh-CN', sink)
    .find(candidate => candidate.name === 'propose_chapter_blueprint')
  if (!tool) throw new Error('propose_chapter_blueprint is missing from the blueprint toolkit')
  return tool
}

beforeEach(() => {
  getByChapterMock.mockReset()
  upsertMock.mockReset()
})

describe('blueprint assistant refresh wiring', () => {
  it('asks the renderer to refresh an open blueprint view after a write', async () => {
    getByChapterMock.mockReturnValue(null)
    const sink = vi.fn()

    await blueprintProposalTool(sink).execute('call-write', { chapter_number: 3, title: '第三章' } as never)

    expect(upsertMock).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenCalledWith({ type: 'refresh_blueprint' })
  })

  it('stays silent for read-only blueprint lookups', async () => {
    getByChapterMock.mockReturnValue({ chapterNumber: 1, title: '第一章', characters: [] })
    const sink = vi.fn()

    await blueprintProposalTool(sink).execute('call-read', { action: 'read', chapter_number: 1 } as never)

    expect(sink).not.toHaveBeenCalled()
  })
})
