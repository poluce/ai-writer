import { useEffect, useState } from 'react'
import type { ProjectData } from '../../../shared/ipc-channels'
import type { RecoveryCandidate } from '../../../shared/recovery-candidate'
import {
  projectSessionContextFromProject,
  sameProjectPathKey,
  sameProjectSessionContext,
} from '../../../shared/project-session-context'
import type { Locale } from '../../../i18n/types'
import { ipc } from '../../../services/ipc-client'
import { useEditorStore } from '../../../stores/editor-store'
import { useProjectStore } from '../../../stores/project-store'

export interface RecoveryCandidatesState {
  candidates: RecoveryCandidate[]
  error: string
  copyCandidate: (candidate: RecoveryCandidate) => Promise<void>
  continueCandidate: (candidate: RecoveryCandidate) => Promise<void>
  discardCandidate: (candidate: RecoveryCandidate) => Promise<void>
}

export function useRecoveryCandidates(
  currentProject: ProjectData | null,
  locale: Locale,
): RecoveryCandidatesState {
  const [candidates, setCandidates] = useState<RecoveryCandidate[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const projectSession = projectSessionContextFromProject(currentProject)
    if (!projectSession || !currentProject) {
      const clearTimer = window.setTimeout(() => {
        setCandidates([])
        setError('')
      }, 0)
      return () => window.clearTimeout(clearTimer)
    }
    let active = true
    void ipc.invokeWithProjectSession(
      projectSession,
      'db:recovery-candidate-list',
      currentProject.path,
    ).then(loaded => {
      if (!active) return
      const latestProject = useProjectStore.getState().currentProject
      if (!sameProjectSessionContext(projectSession, projectSessionContextFromProject(latestProject))) return
      setCandidates(Array.isArray(loaded) ? loaded : [])
      setError('')
    }).catch(err => {
      if (!active) return
      setCandidates([])
      setError(err instanceof Error ? err.message : String(err))
    })
    return () => { active = false }
  }, [currentProject])

  const continueCandidate = async (candidate: RecoveryCandidate) => {
    const project = useProjectStore.getState().currentProject
    const projectSession = projectSessionContextFromProject(project)
    if (
      !project
      || !sameProjectPathKey(project.path, currentProject?.path)
      || !sameProjectSessionContext(projectSession, projectSessionContextFromProject(currentProject))
      || !candidate.sourceCurrent
    ) return
    const result = await ipc.invokeWithProjectSession(
      projectSession!,
      'db:recovery-candidate-update',
      candidate.candidateId,
      candidate.visibleText,
      project.path,
    )
    if (!result.success || !result.candidate) {
      setError(result.error || (locale === 'en-US' ? 'Recovery candidate action failed' : '恢复候选操作失败'))
      return
    }
    const currentCandidate = result.candidate
    useEditorStore.getState().openFile({
      id: `recovery:${currentCandidate.candidateId}`,
      name: locale === 'en-US'
        ? `Recovery candidate · Chapter ${currentCandidate.chapterNumber} ${currentCandidate.chapterTitle}`
        : `恢复候选 · 第${currentCandidate.chapterNumber}章 ${currentCandidate.chapterTitle}`,
      type: 'chapter',
      filePath: `vela://recovery/${currentCandidate.candidateId}`,
      content: currentCandidate.visibleText,
      savedContent: currentCandidate.visibleText,
      dirty: false,
      projectKey: project.path,
    })
    setCandidates(items => items.filter(item => item.candidateId !== candidate.candidateId))
    setError('')
  }

  const discardCandidate = async (candidate: RecoveryCandidate) => {
    const project = useProjectStore.getState().currentProject
    const projectSession = projectSessionContextFromProject(project)
    if (
      !project
      || !sameProjectPathKey(project.path, currentProject?.path)
      || !sameProjectSessionContext(projectSession, projectSessionContextFromProject(currentProject))
    ) return
    const result = await ipc.invokeWithProjectSession(
      projectSession!,
      'db:recovery-candidate-resolve',
      candidate.candidateId,
      'discarded',
      project.path,
    )
    if (!result.success) {
      setError(result.error || (locale === 'en-US' ? 'Recovery candidate action failed' : '恢复候选操作失败'))
      return
    }
    setCandidates(items => items.filter(item => item.candidateId !== candidate.candidateId))
    setError('')
  }

  const copyCandidate = async (candidate: RecoveryCandidate) => {
    const latestProject = useProjectStore.getState().currentProject
    if (!sameProjectSessionContext(
      projectSessionContextFromProject(latestProject),
      projectSessionContextFromProject(currentProject),
    )) return
    try {
      await navigator.clipboard.writeText(candidate.visibleText)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return { candidates, error, copyCandidate, continueCandidate, discardCandidate }
}
