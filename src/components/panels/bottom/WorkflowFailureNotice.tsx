import { AlertTriangle, SlidersHorizontal } from 'lucide-react'
import type { WorkflowRun } from '../../../stores/workflow-store'
import { useEditorStore } from '../../../stores/editor-store'
import { useProjectStore } from '../../../stores/project-store'
import {
  projectSessionContextFromProject,
  sameProjectPathKey,
  sameProjectSessionContext,
} from '../../../shared/project-session-context'
import { presentWorkflowFailure } from './workflow-failure-presentation'

export function WorkflowFailureNotice({ run }: { run: WorkflowRun }) {
  const currentProject = useProjectStore(s => s.currentProject)

  const locale = run.uiLocale
  const currentStep = run.steps[run.currentStepIndex] || run.steps[0]
  const failedStep = run.steps.find(s => s.status === 'failed')
  const failureCode = run.failureCode ?? failedStep?.failureCode ?? currentStep?.failureCode
  const error = run.error || failedStep?.error || currentStep?.error
  const promptBudgetReport = run.promptBudgetReport ?? failedStep?.promptBudgetReport ?? currentStep?.promptBudgetReport
  const isUnpersistedChapterDraft = run.type === 'chapter_finalize'
    && run.steps.every(step => step.status !== 'completed')

  const presentation = presentWorkflowFailure(
    failureCode,
    error,
    locale,
    isUnpersistedChapterDraft,
    promptBudgetReport,
  )

  const matchesCurrentProject = sameProjectPathKey(run.projectPath, currentProject?.path)
    && sameProjectSessionContext(
      run.projectSession,
      projectSessionContextFromProject(currentProject),
    )

  const openNovelConfiguration = () => {
    const project = useProjectStore.getState().currentProject
    if (
      !sameProjectPathKey(run.projectPath, project?.path)
      || !sameProjectSessionContext(run.projectSession, projectSessionContextFromProject(project))
    ) return
    useEditorStore.getState().openFile({
      id: 'config',
      name: locale === 'zh-CN' ? '作品设定' : 'Story settings',
      type: 'config',
      projectKey: run.projectPath,
    })
  }

  return (
    <div
      role="alert"
      className="mt-2 flex gap-2 rounded-md px-2.5 py-2 text-xs leading-relaxed"
      style={{
        color: 'var(--color-error-text)',
        backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-error) 35%, transparent)',
      }}
    >
      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-medium m-0">{presentation.heading}</p>
        <p className="m-0 mt-0.5 break-words">{presentation.reason}</p>
        {presentation.persistence && <p className="m-0 mt-1">{presentation.persistence}</p>}
        {presentation.guidance && <p className="m-0 mt-1">{presentation.guidance}</p>}

        {presentation.action === 'open-novel-config' && presentation.actionLabel && (
          <button
            type="button"
            onClick={openNovelConfiguration}
            disabled={!matchesCurrentProject}
            className="mt-2 inline-flex items-center gap-1.5 rounded px-2 py-1 font-medium transition-colors"
            style={{
              color: 'var(--color-text)',
              backgroundColor: 'var(--color-hover)',
              border: '1px solid var(--color-border)',
              opacity: matchesCurrentProject ? 1 : 0.55,
              cursor: matchesCurrentProject ? 'pointer' : 'not-allowed',
            }}
          >
            <SlidersHorizontal size={12} aria-hidden="true" />
            {presentation.actionLabel}
          </button>
        )}

        {presentation.action === 'open-novel-config' && !matchesCurrentProject && (
          <p className="m-0 mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {locale === 'zh-CN'
              ? '此结果属于另一项目会话。请切回该项目后再打开作品设定。'
              : 'This result belongs to another project session. Switch back to that project before opening Story settings.'}
          </p>
        )}
      </div>
    </div>
  )
}
