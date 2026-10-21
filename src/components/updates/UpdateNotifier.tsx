import { useCallback, useEffect, useRef, useState } from 'react'

import { useLocaleStore } from '../../stores/locale-store'
import type { UpdateError, UpdatePresentation, UpdateState } from '../../services/update-presentation'
import { actionToast, type ActionToastAction, type ActionToastType } from '../ui/ActionToast'
import { getUpdateRetryAction } from './update-retry-action'
import { useUpdateInstallGuard } from './use-update-install-guard'
import { useUpdateState } from './use-update-state'

interface UpdateNoticeHandlers {
  onDownload(): void
  onOpenRelease(): void
  onInstall(): void
  onDefer(): void
  onCheck(): void
}

interface UpdateNotice {
  key: string
  type: ActionToastType
  message: string
  actions: ActionToastAction[]
}

function retryNotice(
  version: string,
  retry: ReturnType<typeof getUpdateRetryAction>,
  text: (zhCNText: string, enUSText: string) => string,
  handlers: UpdateNoticeHandlers,
): UpdateNotice {
  const messages: Record<string, string> = {
    download: text('更新下载失败', 'Update download failed'),
    install: text('重启更新未完成', 'The restart update did not finish'),
    check: text('检查更新失败', 'Update check failed'),
    'open-release': text('打开下载页失败', 'Opening the download page failed'),
    defer: text('保存提醒时间失败', 'Saving the reminder failed'),
  }
  const labels: Record<string, string> = {
    download: text('重试下载', 'Retry download'),
    install: text('重试重启更新', 'Retry restart update'),
    check: text('重试检查', 'Retry check'),
    'open-release': text('重试打开下载页', 'Retry opening the download page'),
    defer: text('重试保存提醒', 'Retry saving the reminder'),
  }
  const actions: Record<string, () => void> = {
    download: handlers.onDownload,
    install: handlers.onInstall,
    check: handlers.onCheck,
    'open-release': handlers.onOpenRelease,
    defer: handlers.onDefer,
  }
  return {
    key: `error-${version}-${retry}`,
    type: 'warning',
    message: messages[retry] ?? text('更新操作失败', 'The update operation failed'),
    actions: [{ label: labels[retry] ?? text('重试', 'Retry'), onClick: actions[retry] ?? handlers.onCheck }],
  }
}

/** 把更新展示状态翻译成一条全局提醒；返回 null 表示无需新提醒（保留现有提示）。 */
function describeUpdateNotice(
  state: UpdateState,
  presentation: UpdatePresentation,
  manualActionError: UpdateError | undefined,
  text: (zhCNText: string, enUSText: string) => string,
  handlers: UpdateNoticeHandlers,
): UpdateNotice | null {
  const version = state.availableVersion
  if (!version) return null

  if (presentation.kind === 'manual-error') {
    // 与欢迎页更新卡同一套重试映射；不可重试的错误留在欢迎页解释，不弹全局提醒。
    if (!manualActionError?.retryable) return null
    return retryNotice(version, getUpdateRetryAction(manualActionError.code), text, handlers)
  }

  if (presentation.kind === 'available') {
    if (presentation.canOpenRelease) {
      return {
        key: `available-${version}`,
        type: 'info',
        message: text(`发现新版本 v${version}`, `New version v${version} is available`),
        actions: [
          { label: text('打开下载页', 'Open download page'), onClick: handlers.onOpenRelease },
          { label: text('稍后提醒', 'Remind me later'), variant: 'ghost', onClick: handlers.onDefer },
        ],
      }
    }
    return {
      key: `available-${version}`,
      type: 'info',
      message: text(`发现新版本 v${version}`, `New version v${version} is available`),
      actions: [
        { label: text('下载更新', 'Download update'), onClick: handlers.onDownload },
        { label: text('稍后提醒', 'Remind me later'), variant: 'ghost', onClick: handlers.onDefer },
      ],
    }
  }

  if (presentation.kind === 'downloading') {
    return {
      key: `downloading-${version}`,
      type: 'info',
      message: text(`正在下载更新 v${version}`, `Downloading update v${version}`),
      actions: [],
    }
  }

  if (presentation.kind === 'downloaded') {
    return {
      key: `downloaded-${version}`,
      type: 'info',
      message: text(`更新 v${version} 已就绪`, `Update v${version} is ready`),
      actions: [
        { label: text('重启更新', 'Restart and update'), onClick: handlers.onInstall },
        { label: text('稍后提醒', 'Remind me later'), variant: 'ghost', onClick: handlers.onDefer },
      ],
    }
  }

  return null
}

/**
 * 全局更新提醒：新正式版可用时弹一条常驻通知，用户可直接「下载更新」，
 * 下载完成后同一位置变为「重启更新」，点按即完成安装与重启。
 * 提醒遵循 7 天延后设置，并复用与欢迎页一致的安装门禁对话框。
 */
export function UpdateNotifier() {
  const text = useLocaleStore(s => s.text)
  const {
    state,
    presentation,
    manualActionError,
    checkForUpdates,
    deferReminder,
    downloadUpdate,
    openRelease,
    requestInstall,
  } = useUpdateState()
  const [noticeRefreshToken, setNoticeRefreshToken] = useState(0)
  const activeNotice = useRef<{ key: string; message: string; dismiss: () => void } | null>(null)

  const { handleInstallClick, dialogs } = useUpdateInstallGuard({
    requestInstall,
    onBlockedDialogClose: useCallback(() => {
      // 提醒按钮点击会关闭 Toast；门禁对话框被取消后需要恢复「重启更新」提醒。
      activeNotice.current = null
      setNoticeRefreshToken(token => token + 1)
    }, []),
  })

  useEffect(() => {
    const version = state.availableVersion
    if (!version || state.isReminderDeferred) {
      if (activeNotice.current) {
        activeNotice.current.dismiss()
        activeNotice.current = null
      }
      return
    }

    const notice = describeUpdateNotice(state, presentation, manualActionError, text, {
      onDownload: () => void downloadUpdate(),
      onOpenRelease: () => void openRelease(),
      onInstall: handleInstallClick,
      onDefer: () => void deferReminder(7),
      onCheck: () => void checkForUpdates(),
    })
    if (!notice) return

    const active = activeNotice.current
    if (active && active.key === notice.key && active.message === notice.message) return

    active?.dismiss()
    activeNotice.current = {
      key: notice.key,
      message: notice.message,
      dismiss: actionToast.show({
        type: notice.type,
        message: notice.message,
        duration: 0,
        actions: notice.actions,
      }),
    }
  }, [state, presentation, manualActionError, text, downloadUpdate, openRelease, handleInstallClick, deferReminder, checkForUpdates, noticeRefreshToken])

  return <>{dialogs}</>
}
