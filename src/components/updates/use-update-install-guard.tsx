import { useCallback, useState } from 'react'
import { Download } from 'lucide-react'

import { countUnsavedEditorItems } from '../../stores/editor-unsaved'
import { useEditorDraftLedgerStore } from '../../stores/editor-draft-ledger-store'
import { useEditorStore } from '../../stores/editor-store'
import { useLocaleStore } from '../../stores/locale-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { Button } from '../ui/Button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/Dialog'
import { discardChangesThenRequestInstall } from './update-install-discard'

export interface UpdateInstallGuardOptions {
  requestInstall: () => void | Promise<void>
  /** 阻塞对话框被用户关闭且未执行安装时回调（例如恢复全局更新提醒）。 */
  onBlockedDialogClose?: () => void
}

/**
 * 更新安装门禁：重启更新前必须没有仍在运行/收尾的创作任务与未保存的编辑内容。
 *
 * 欢迎页更新卡与全局更新提醒共用同一套守卫与对话框，保证两条入口行为一致。
 */
export function useUpdateInstallGuard({ requestInstall, onBlockedDialogClose }: UpdateInstallGuardOptions) {
  const text = useLocaleStore(s => s.text)
  const tabs = useEditorStore(s => s.tabs)
  const draftLedgers = useEditorDraftLedgerStore(s => s.draftLedgers)
  const activeRuns = useWorkflowStore(s => s.activeRuns)
  const [showWorkflowBlockingDialog, setShowWorkflowBlockingDialog] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const unsavedItemCount = countUnsavedEditorItems(tabs, draftLedgers)

  const handleInstallClick = useCallback(() => {
    // 活跃任务集合中标记为已完成或失败的任务，也可能正处在最终落盘和移入历史之间，
    // 因此不能只检查运行中、已暂停或等待中的状态。
    if (useWorkflowStore.getState().activeRuns.length > 0) {
      setShowWorkflowBlockingDialog(true)
      return
    }
    if (unsavedItemCount > 0) {
      setShowUnsavedDialog(true)
      return
    }
    void requestInstall()
  }, [requestInstall, unsavedItemCount])

  const handleDiscardAndInstall = useCallback(() => {
    setShowUnsavedDialog(false)
    // 用户停留在未保存确认框期间也可能启动任务，最终安装动作前必须再次检查。
    if (useWorkflowStore.getState().activeRuns.length > 0) {
      setShowWorkflowBlockingDialog(true)
      return
    }
    void discardChangesThenRequestInstall(() => Promise.resolve(requestInstall()))
  }, [requestInstall])

  const closeWorkflowBlockingDialog = useCallback((open: boolean) => {
    setShowWorkflowBlockingDialog(open)
    if (!open) onBlockedDialogClose?.()
  }, [onBlockedDialogClose])

  const closeUnsavedDialog = useCallback((open: boolean) => {
    setShowUnsavedDialog(open)
    if (!open) onBlockedDialogClose?.()
  }, [onBlockedDialogClose])

  const dialogs = <>
    <Dialog open={showWorkflowBlockingDialog} onOpenChange={closeWorkflowBlockingDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{text('创作任务尚未结束，暂不能更新', 'Creative tasks are not finished yet')}</DialogTitle></DialogHeader>
        <div className="px-6 py-4"><DialogDescription>{text(`当前有 ${activeRuns.length} 个创作任务仍在运行、暂停、等待继续或正在收尾，结果可能尚未完整写入项目。为避免内容丢失，请先完成或取消这些任务，再重启更新。`, `${activeRuns.length} creative task${activeRuns.length === 1 ? ' is' : 's are'} still running, paused, waiting, or being finalized, so results may not be fully saved yet. Finish or cancel the tasks before restarting to update.`)}</DialogDescription></div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => closeWorkflowBlockingDialog(false)}>{text('知道了，返回处理任务', 'Got it, return to tasks')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={showUnsavedDialog} onOpenChange={closeUnsavedDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{text('请先处理未保存的修改', 'Handle unsaved changes first')}</DialogTitle></DialogHeader>
        <div className="px-6 py-4"><DialogDescription>{text(`当前有 ${unsavedItemCount} 项未保存的编辑内容。请返回保存，或明确放弃这些修改后再重启更新。`, `You have ${unsavedItemCount} unsaved edit${unsavedItemCount === 1 ? '' : 's'}. Go back to save, or explicitly discard them before restarting to update.`)}</DialogDescription></div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => closeUnsavedDialog(false)}>{text('返回保存', 'Go back and save')}</Button>
          <Button type="button" variant="destructive" onClick={handleDiscardAndInstall}><Download size={15} />{text('放弃修改并重启更新', 'Discard changes and restart update')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>

  return { handleInstallClick, dialogs }
}
