import { logFailure } from '../../shared/fail-log'

/** 工作流启动后的界面副作用，不进 workflow-store。 */
export function onWorkflowRunStarted(runId: string): void {
  void import('../../stores/layout-store').then((module) => {
    module.useLayoutStore.getState().openBottomTab('tasks')
  }).catch((error) => {
    logFailure('Workflow', 'failed to open bottom tasks panel', error, { runId })
  })
}
