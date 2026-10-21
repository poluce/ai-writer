import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useLocaleStore } from '../../../stores/locale-store'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function availableState(overrides: Record<string, unknown> = {}) {
  return {
    status: 'available',
    currentVersion: '0.9.2',
    availableVersion: '9.8.7',
    updateAction: 'download',
    isReminderDeferred: false,
    ...overrides,
  }
}

function installVelaAPI(initialState: Record<string, unknown>) {
  const invoke = vi.fn(async (channel: string) => {
    if (channel === 'update:get-state') return initialState
    if (channel === 'update:download') return { state: { ...initialState, status: 'downloading' } }
    if (channel === 'update:defer-reminder') return { state: { ...initialState, isReminderDeferred: true } }
    if (channel === 'update:quit-and-install') return { state: initialState }
    return null
  })
  Object.assign(window, {
    velaAPI: {
      invoke,
      on: vi.fn(() => () => {}),
      once: vi.fn(),
      send: vi.fn(),
      setZoomLevel: vi.fn(),
      setZoomFactor: vi.fn(),
      getZoomLevel: vi.fn(() => 0),
    },
  })
  return { invoke }
}

beforeEach(() => {
  useLocaleStore.setState({
    locale: 'zh-CN',
    initialized: true,
    text: (zhCNText: string) => zhCNText,
  })
  document.getElementById('vela-action-toast-root')?.remove()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  document.getElementById('vela-action-toast-root')?.remove()
  Reflect.deleteProperty(window, 'velaAPI')
  vi.restoreAllMocks()
})

describe('UpdateNotifier', () => {
  it('replaces an active update notice in the newly selected locale', async () => {
    installVelaAPI(availableState())
    const dismiss = vi.fn()
    const { actionToast } = await import('../../ui/ActionToast')
    const show = vi.spyOn(actionToast, 'show').mockReturnValue(dismiss)
    const { UpdateNotifier } = await import('../UpdateNotifier')
    await act(async () => root.render(<UpdateNotifier />))
    await vi.waitFor(() => expect(show).toHaveBeenCalledOnce())
    expect(show).toHaveBeenCalledWith(expect.objectContaining({
      message: '发现新版本 v9.8.7',
      actions: [
        expect.objectContaining({ label: '下载更新' }),
        expect.objectContaining({ label: '稍后提醒' }),
      ],
    }))

    await act(async () => {
      useLocaleStore.setState(state => ({
        locale: 'en-US',
        text: (_zhCNText, enUSText) => enUSText,
        t: state.t,
      }))
    })

    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(2))
    expect(dismiss).toHaveBeenCalledOnce()
    expect(show).toHaveBeenLastCalledWith(expect.objectContaining({
      message: 'New version v9.8.7 is available',
      actions: [
        expect.objectContaining({ label: 'Download update' }),
        expect.objectContaining({ label: 'Remind me later' }),
      ],
    }))
  })

  it('downloads the update directly from the reminder and reports progress', async () => {
    const { invoke } = installVelaAPI(availableState())
    const { actionToast } = await import('../../ui/ActionToast')
    const show = vi.spyOn(actionToast, 'show').mockReturnValue(() => {})
    const { UpdateNotifier } = await import('../UpdateNotifier')
    await act(async () => root.render(<UpdateNotifier />))
    await vi.waitFor(() => expect(show).toHaveBeenCalledOnce())
    const firstNotice = show.mock.calls[0][0]
    expect(firstNotice.message).toBe('发现新版本 v9.8.7')
    expect(firstNotice.actions?.map(action => action.label)).toEqual(['下载更新', '稍后提醒'])

    await act(async () => {
      firstNotice.actions?.[0].onClick?.()
    })

    expect(invoke).toHaveBeenCalledWith('update:download')
    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(2))
    expect(show.mock.calls[1][0].message).toBe('正在下载更新 v9.8.7')
  })

  it('shows a restart action once the update is downloaded', async () => {
    const { invoke } = installVelaAPI(availableState({ status: 'downloaded' }))
    const { actionToast } = await import('../../ui/ActionToast')
    const show = vi.spyOn(actionToast, 'show').mockReturnValue(() => {})
    const { UpdateNotifier } = await import('../UpdateNotifier')
    await act(async () => root.render(<UpdateNotifier />))
    await vi.waitFor(() => expect(show).toHaveBeenCalledOnce())
    const notice = show.mock.calls[0][0]
    expect(notice.message).toBe('更新 v9.8.7 已就绪')
    expect(notice.actions?.map(action => action.label)).toEqual(['重启更新', '稍后提醒'])

    await act(async () => {
      notice.actions?.[0].onClick?.()
    })

    expect(invoke).toHaveBeenCalledWith('update:quit-and-install')
  })

  it('defers the reminder for seven days from the notice', async () => {
    const { invoke } = installVelaAPI(availableState())
    const { actionToast } = await import('../../ui/ActionToast')
    const show = vi.spyOn(actionToast, 'show').mockReturnValue(() => {})
    const { UpdateNotifier } = await import('../UpdateNotifier')
    await act(async () => root.render(<UpdateNotifier />))
    await vi.waitFor(() => expect(show).toHaveBeenCalledOnce())
    const notice = show.mock.calls[0][0]
    const deferAction = notice.actions?.find(action => action.label === '稍后提醒')

    await act(async () => {
      deferAction?.onClick?.()
    })

    expect(invoke).toHaveBeenCalledWith('update:defer-reminder', 7)
  })

  it('offers a retry action when a download for the pending version fails', async () => {
    const initialState = availableState()
    const { invoke } = installVelaAPI(initialState)
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'update:get-state') return initialState
      if (channel === 'update:download') {
        return {
          state: initialState,
          error: {
            code: 'DOWNLOAD_FAILED',
            phase: 'download',
            reason: 'unknown',
            retryable: true,
            safeTechnicalDetails: 'UPDATE_OPERATION_FAILED',
          },
        }
      }
      return null
    })
    const { actionToast } = await import('../../ui/ActionToast')
    const show = vi.spyOn(actionToast, 'show').mockReturnValue(() => {})
    const { UpdateNotifier } = await import('../UpdateNotifier')
    await act(async () => root.render(<UpdateNotifier />))
    await vi.waitFor(() => expect(show).toHaveBeenCalledOnce())

    await act(async () => {
      show.mock.calls[0][0].actions?.[0].onClick?.()
    })

    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(2))
    const notice = show.mock.calls[1][0]
    expect(notice.type).toBe('warning')
    expect(notice.message).toBe('更新下载失败')
    expect(notice.actions?.map(action => action.label)).toEqual(['重试下载'])

    await act(async () => {
      notice.actions?.[0].onClick?.()
    })

    expect(invoke.mock.calls.filter(call => call[0] === 'update:download')).toHaveLength(2)
  })
})
