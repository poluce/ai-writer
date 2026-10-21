import { useCallback, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'

import { useLocaleStore } from '../../stores/locale-store'
import { ipc } from '../../services/ipc-client'
import { getOfficialHomepageOpenError } from '../../shared/official-homepage'
import { Button } from '../ui/Button'
import { UpdateStatusCard } from './UpdateStatusCard'
import { useUpdateInstallGuard } from './use-update-install-guard'
import { useUpdateState } from './use-update-state'

function updateCheckButtonLabel(
  checking: boolean,
  text: (zhCNText: string, enUSText: string) => string,
): string {
  if (checking) return text('正在检查', 'Checking')
  return text('检查更新', 'Check for updates')
}

/** 欢迎页中的更新入口与非阻断状态卡。 */
export function UpdateSection() {
  const text = useLocaleStore(s => s.text)
  const locale = useLocaleStore(s => s.locale)
  const [officialHomepageError, setOfficialHomepageError] = useState<string | null>(null)
  const {
    state,
    presentation,
    manualActionError,
    isDeferring,
    lastReminderDays,
    checkForUpdates,
    deferReminder,
    downloadUpdate,
    openRelease,
    requestInstall,
  } = useUpdateState()
  const { handleInstallClick, dialogs } = useUpdateInstallGuard({ requestInstall })

  const handleOfficialHomepageClick = useCallback(async () => {
    setOfficialHomepageError(null)
    try {
      const result = await ipc.invoke('official-homepage:open')
      if (!result.success) throw new Error(result.error)
    } catch {
      setOfficialHomepageError(getOfficialHomepageOpenError(locale))
    }
  }, [locale])

  return <section className="mb-10" lang={locale} aria-label={text('应用更新', 'App updates')}>
    <div className="writer-panel-card flex flex-col items-stretch gap-3 px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
      <div className="min-w-0">
        <div className="flex items-center gap-2"><RefreshCw size={16} style={{ color: 'var(--color-accent)' }} /><span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{text('应用更新', 'App updates')}</span></div>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>{presentation.kind === 'disabled' ? text('更新检查仅在已安装的 Windows 应用中可用。', 'Update checks are available in the installed Windows app only.') : text('检查 GitHub Release 中的新正式版。', 'Check GitHub Releases for new stable versions.')}</p>
      </div>
      <div className="flex flex-wrap items-center justify-start gap-2" data-testid="update-entry-actions">
        <Button type="button" size="lg" variant="outline" onClick={() => void handleOfficialHomepageClick()} className="text-sm" title={text('在默认浏览器中打开官方主页', 'Open the official homepage in your default browser')}>
          <ExternalLink size={15} aria-hidden="true" />{text('官方主页', 'Official Website')}
        </Button>
        <Button type="button" size="lg" onClick={() => void checkForUpdates()} disabled={!presentation.canCheck} className="text-sm" title={presentation.kind === 'disabled' ? text('请在已安装的 Windows 应用中检查更新', 'Check for updates in the installed Windows app') : text('立即检查正式版更新', 'Check for stable updates now')}>
          <RefreshCw size={15} className={presentation.kind === 'checking' ? 'animate-spin' : undefined} />
          {updateCheckButtonLabel(presentation.kind === 'checking', text)}
        </Button>
      </div>
    </div>

    {officialHomepageError && <p role="alert" className="mt-2 px-1 text-xs" style={{ color: 'var(--color-error-text)' }}>{officialHomepageError}</p>}

    {presentation.visible && <UpdateStatusCard presentation={presentation} state={state} text={text} manualActionError={manualActionError} isDeferring={isDeferring} lastReminderDays={lastReminderDays} onCheck={() => void checkForUpdates()} onDefer={days => void deferReminder(days)} onDownload={() => void downloadUpdate()} onOpenRelease={() => void openRelease()} onInstall={handleInstallClick} />}

    {dialogs}
  </section>
}
