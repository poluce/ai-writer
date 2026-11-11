import { useLayoutStore } from '../../stores/layout-store'
import { BottomPanelTabs } from './BottomPanelTabs'
import { LogsView } from './bottom/LogsView'
import { ModelsView, SafeDiagnosticCopyButton } from './bottom/ModelsView'
import { TaskRunView } from './bottom/TaskRunView'

export { SafeDiagnosticCopyButton }

/** 下方工具窗口：统一承载工作流任务进度与流式输出、全局日志、模型调用统计。 */
export default function BottomPanel() {
  const bottomTab = useLayoutStore(s => s.bottomTab)
  const activeTab = bottomTab || 'tasks'

  return (
    <div className="writer-task-table w-full h-full flex flex-col overflow-hidden">
      <BottomPanelTabs />

      <div className="flex-1 overflow-hidden">
        {activeTab === 'tasks' && <TaskRunView />}
        {activeTab === 'log' && <LogsView />}
        {activeTab === 'models' && <ModelsView />}
      </div>
    </div>
  )
}
