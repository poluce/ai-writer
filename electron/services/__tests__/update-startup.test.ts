import { describe, expect, it, vi } from 'vitest'

import { startUpdateRuntime } from '../update-startup'
import { UpdateService, type UpdateBackend, type UpdatePreferencesStore } from '../update-service'

function createBackend(): UpdateBackend {
  return {
    checkForUpdates: async () => null,
    downloadUpdate: async () => [],
    quitAndInstall: () => {},
  }
}

function createPreferences(): UpdatePreferencesStore {
  return { read: () => ({}), write: () => true }
}

describe('startUpdateRuntime', () => {
  it('keeps the application alive when loading electron-updater fails', () => {
    const reportFailure = vi.fn()
    const registerController = vi.fn()

    expect(() => startUpdateRuntime({
      updateRuntimeEnabled: true,
      currentVersion: '0.3.0',
      createBackend: () => { throw new Error('electron-updater unavailable') },
      createPreferences,
      registerController,
      reportFailure,
    })).not.toThrow()

    expect(reportFailure).toHaveBeenCalledWith('初始化更新器', expect.any(Error))
    expect(registerController).toHaveBeenCalledOnce()
    expect(registerController.mock.calls[0]?.[0].getState()).toMatchObject({ status: 'disabled' })
  })

  it('contains automatic-check rejection instead of creating an unhandled startup failure', async () => {
    const reportFailure = vi.fn()
    const failingBackend: UpdateBackend = {
      ...createBackend(),
      checkForUpdates: async () => { throw new Error('offline') },
    }

    startUpdateRuntime({
      updateRuntimeEnabled: true,
      currentVersion: '0.3.0',
      createBackend: () => failingBackend,
      createPreferences,
      registerController: () => {},
      reportFailure,
      createService: options => {
        const service = new UpdateService(options)
        vi.spyOn(service, 'checkAutomatically').mockRejectedValue(new Error('unexpected startup failure'))
        return service
      },
    })

    await vi.waitFor(() => {
      expect(reportFailure).toHaveBeenCalledWith('自动检查更新', expect.any(Error))
    })
  })

  it('contains preference-store construction failures before they can affect the main window', () => {
    const reportFailure = vi.fn()

    expect(() => startUpdateRuntime({
      updateRuntimeEnabled: true,
      currentVersion: '0.3.0',
      createBackend,
      createPreferences: () => { throw new Error('config unavailable') },
      registerController: () => {},
      reportFailure,
    })).not.toThrow()

    expect(reportFailure).toHaveBeenCalledWith('初始化更新服务', expect.any(Error))
  })
})

describe('startUpdateRuntime periodic refresh', () => {
  function start(options: {
    periodicRefreshIntervalMs?: number
    updateRuntimeEnabled?: boolean
    updateConfiguration?: 'available' | 'missing'
  } = {}) {
    const ticks: Array<() => void> = []
    const cancel = vi.fn()
    const refresh = vi.fn(async () => {})
    const cleanup = startUpdateRuntime({
      updateRuntimeEnabled: options.updateRuntimeEnabled ?? true,
      updateConfiguration: options.updateConfiguration ?? 'available',
      currentVersion: '0.3.0',
      createBackend,
      createPreferences,
      registerController: () => {},
      reportFailure: () => {},
      ...(options.periodicRefreshIntervalMs === undefined
        ? {}
        : { periodicRefreshIntervalMs: options.periodicRefreshIntervalMs }),
      scheduleInterval: (run) => {
        ticks.push(run)
        return cancel
      },
      createService: serviceOptions => {
        const service = new UpdateService(serviceOptions)
        vi.spyOn(service, 'refreshWhileRunning').mockImplementation(refresh)
        return service
      },
    })
    return { cleanup, ticks, cancel, refresh }
  }

  it('schedules running refresh checks only when an interval is configured', () => {
    const disabled = start()
    expect(disabled.ticks).toHaveLength(0)

    const enabled = start({ periodicRefreshIntervalMs: 30 * 60 * 1000 })
    expect(enabled.ticks).toHaveLength(1)
  })

  it('invokes the running refresh on each tick and stops on cleanup', async () => {
    const { cleanup, ticks, cancel, refresh } = start({ periodicRefreshIntervalMs: 1000 })

    ticks[0]?.()
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce())

    cleanup()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('does not schedule refresh checks when the update runtime is disabled', () => {
    const disabled = start({ periodicRefreshIntervalMs: 1000, updateRuntimeEnabled: false })
    expect(disabled.ticks).toHaveLength(0)
  })

  it('does not schedule refresh checks when the packaged configuration is missing', () => {
    const missing = start({ periodicRefreshIntervalMs: 1000, updateConfiguration: 'missing' })
    expect(missing.ticks).toHaveLength(0)
  })
})
