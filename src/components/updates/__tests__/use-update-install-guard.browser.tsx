import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useEditorStore } from '../../../stores/editor-store'
import { useLocaleStore } from '../../../stores/locale-store'
import { useWorkflowStore, type WorkflowRun } from '../../../stores/workflow-store'
import { useUpdateInstallGuard, type UpdateInstallGuardOptions } from '../use-update-install-guard'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

// eslint-disable-next-line react-refresh/only-export-components -- browser-only test shell
function GuardProbe(options: UpdateInstallGuardOptions) {
  const { handleInstallClick, dialogs } = useUpdateInstallGuard(options)
  return <>
    <button type="button" data-testid="install" onClick={handleInstallClick}>install</button>
    {dialogs}
  </>
}

beforeEach(() => {
  useLocaleStore.setState({
    locale: 'zh-CN',
    initialized: true,
    text: (zhCNText: string) => zhCNText,
  })
  useWorkflowStore.setState({ activeRuns: [] })
  useEditorStore.setState({ tabs: [] })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe('useUpdateInstallGuard', () => {
  it('installs directly when no task or unsaved edit blocks it', async () => {
    const requestInstall = vi.fn()
    await act(async () => root.render(<GuardProbe requestInstall={requestInstall} />))
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="install"]')?.click()
    })
    expect(requestInstall).toHaveBeenCalledOnce()
    expect(document.body.textContent).not.toContain('创作任务尚未结束')
    expect(document.body.textContent).not.toContain('请先处理未保存的修改')
  })

  it('blocks the restart while creative tasks are active and restores the reminder on close', async () => {
    const requestInstall = vi.fn()
    const onBlockedDialogClose = vi.fn()
    useWorkflowStore.setState({ activeRuns: [{ id: 'run-1' } as WorkflowRun] })
    await act(async () => root.render(<GuardProbe requestInstall={requestInstall} onBlockedDialogClose={onBlockedDialogClose} />))
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="install"]')?.click()
    })
    expect(requestInstall).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('创作任务尚未结束，暂不能更新')

    await act(async () => {
      Array.from(document.querySelectorAll('button'))
        .find(button => button.textContent?.includes('知道了，返回处理任务'))?.click()
    })
    expect(onBlockedDialogClose).toHaveBeenCalledOnce()
    expect(requestInstall).not.toHaveBeenCalled()
  })

  it('blocks the restart for unsaved edits and offers an explicit discard-and-install path', async () => {
    const requestInstall = vi.fn()
    useEditorStore.setState({
      tabs: [{ id: 'tab-1', type: 'chapter', dirty: true } as never],
    })
    await act(async () => root.render(<GuardProbe requestInstall={requestInstall} />))
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="install"]')?.click()
    })
    expect(requestInstall).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('请先处理未保存的修改')

    await act(async () => {
      Array.from(document.querySelectorAll('button'))
        .find(button => button.textContent?.includes('放弃修改并重启更新'))?.click()
    })
    expect(requestInstall).toHaveBeenCalledOnce()
  })
})
