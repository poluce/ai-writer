import { afterEach, describe, expect, it } from 'vitest'

import { useLocaleStore } from '../../../stores/locale-store'
import type { ProjectSessionContext } from '../../../shared/ipc-channels'
import {
  createFinalizeWorkflow,
  createRepairFinalizeWorkflow,
} from '../chapter-workflow'

const projectPath = 'C:\\novels\\english-chapter'
const projectSession: ProjectSessionContext = {
  projectId: 'english-chapter',
  projectPath,
}
const originalLocale = useLocaleStore.getState().locale
afterEach(() => useLocaleStore.setState({ locale: originalLocale }))

describe('chapter workflow locale', () => {
  it('freezes English titles, steps, descriptions, and completion copy for finalize and repair workflows', () => {
    useLocaleStore.setState({ locale: 'en-US' })

    const workflows = [
      createFinalizeWorkflow({
        projectPath,
        chapterNumber: 2,
        chapterTitle: 'A New Term',
        draftPath: 'vela://draft/2',
        draftContent: 'Draft',
      }, projectSession),
      createRepairFinalizeWorkflow(2, projectPath, projectSession),
    ]

    expect(workflows.map(workflow => ({
      locale: workflow.uiLocale,
      title: workflow.title,
      step: workflow.steps[0].name,
      description: workflow.steps[0].description,
      completion: workflow.onComplete?.message,
    }))).toEqual([
      expect.objectContaining({ locale: 'en-US', title: 'Finalize — Chapter 2 A New Term', step: 'Finalize chapter' }),
      expect.objectContaining({ locale: 'en-US', title: 'Repair post-processing — Chapter 2', step: 'Rebuild post-processing' }),
    ])
    expect(workflows.flatMap(workflow => [
      workflow.title,
      workflow.steps[0].name,
      workflow.steps[0].description,
      workflow.onComplete?.message ?? '',
    ]).join('\n')).not.toMatch(/[\u4e00-\u9fff]/u)
  })
})
