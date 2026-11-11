import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectSessionContext } from '../../shared/ipc-channels'
import { guardRepairPostProcess } from '../workflow-guards'
import { ipc } from '../ipc-client'

vi.mock('../ipc-client', () => ({
  ipc: {
    invokeWithProjectSession: vi.fn(),
  },
}))

const projectPath = 'C:/novels/guard-finalize'
const projectSession: ProjectSessionContext = {
  projectId: 'guard-finalize',
  projectPath,
}
const project = {
  id: projectSession.projectId,
  path: projectPath,
  name: 'Guard Finalize',
  novelConfig: {},
}
let currentProject: typeof project | null = project

vi.mock('../../stores/project-store', () => ({
  useProjectStore: {
    getState: vi.fn(() => ({ currentProject })),
  },
}))

beforeEach(() => {
  vi.mocked(ipc.invokeWithProjectSession).mockReset()
})

afterEach(() => {
  currentProject = project
})

describe('guardRepairPostProcess', () => {
  it('fails when no matching project session is open', async () => {
    currentProject = null
    await expect(guardRepairPostProcess(1, projectPath, projectSession)).resolves.toMatchObject({
      ok: false,
      message: '请先打开或新建一个项目。',
    })
  })

  it('fails when no chapters have been finalized yet', async () => {
    vi.mocked(ipc.invokeWithProjectSession).mockResolvedValueOnce(0 as never)
    await expect(guardRepairPostProcess(1, projectPath, projectSession)).resolves.toMatchObject({
      ok: false,
      message: '尚无已定稿章节，无法执行修复操作。',
    })
  })

  it('blocks repairing an earlier finalized chapter when a later finalized chapter exists', async () => {
    vi.mocked(ipc.invokeWithProjectSession).mockResolvedValueOnce(5 as never)
    await expect(guardRepairPostProcess(3, projectPath, projectSession)).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining('第 5 章'),
    })
  })

  it('allows repairing only the latest finalized chapter', async () => {
    vi.mocked(ipc.invokeWithProjectSession).mockResolvedValueOnce(5 as never)
    await expect(guardRepairPostProcess(5, projectPath, projectSession)).resolves.toEqual({ ok: true })
  })
})
