import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  Archive,
  CheckCircle2,
  FilePlus2,
  FileText,
  FolderOpen,
  Import,
  LogOut,
  Menu,
  Minus,
  Moon,
  ScrollText,
  Sparkles,
  Square,
  Sun,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useProjectStore } from '../../stores/project-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useThemeStore, type Theme } from '../../stores/theme-store'
import { useEditorDraftLedgerStore } from '../../stores/editor-draft-ledger-store'
import { useEditorStore } from '../../stores/editor-store'
import { saveDirtyEditorChangesForExit } from '../../stores/editor-store'
import { countUnsavedEditorItems } from '../../stores/editor-unsaved'
import { discardAllEditorChanges } from '../../stores/editor-discard'
import { useLayoutStore } from '../../stores/layout-store'
import { APP_BRAND } from '../../shared/brand'
import { publicAssetUrl } from '../../shared/public-asset'
import { ipc } from '../../services/ipc-client'
import { useLocaleStore } from '../../stores/locale-store'
import type { MessageKey } from '../../i18n/core'
import { projectSessionContextFromProject, sameProjectPathKey } from '../../shared/project-session-context'
import { flushAgentConversations } from '../../services/agent/conversation-archive'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/Dialog'
import { Button } from '../ui/Button'
import { alertError } from '../ui/AlertDialog'
import { MenuItem } from '../ui/MenuItem'
import { useOutsideClick } from '../../hooks/useOutsideClick'

const isMac = navigator.userAgent.includes('Mac')

const themeIcons: Record<Theme, typeof Sun> = {
  light: Sun,
  galaxy: Sparkles,
  paper: ScrollText,
  dark: Moon,
}
const themeLabelKeys: Record<Theme, MessageKey> = {
  light: 'theme.light',
  galaxy: 'theme.galaxy',
  paper: 'theme.paper',
  dark: 'theme.dark',
}

export default function TitleBar() {
  const currentProject = useProjectStore((s) => s.currentProject)
  const openProject = useProjectStore((s) => s.openProject)
  const { theme, setTheme } = useThemeStore()
  const { zoom, zoomIn, zoomOut, zoomReset } = useThemeStore()
  const tabs = useEditorStore(s => s.tabs)
  const draftLedgers = useEditorDraftLedgerStore(s => s.draftLedgers)
  const hasDirty = countUnsavedEditorItems(tabs, draftLedgers) > 0
  // 没有任何可保存的编辑器项时（例如启动页），保存状态没有意义，不渲染指示灯
  const hasTrackedEditors = tabs.length > 0 || Object.keys(draftLedgers).length > 0
  const openNewProject = useLayoutStore(s => s.openNewProject)
  const openExport = useLayoutStore(s => s.openExport)
  const openAuthorManuscriptImport = useLayoutStore(s => s.openAuthorManuscriptImport)
  const openNovelDeconstruction = useLayoutStore(s => s.openNovelDeconstruction)
  const { locale, setLocale, t, text } = useLocaleStore()
  const [exitRequest, setExitRequest] = useState<{ requestId: string; workflowBlocked?: boolean } | null>(null)
  const [exitBusy, setExitBusy] = useState(false)
  const [exitError, setExitError] = useState<string | null>(null)

  useEffect(() => ipc.on('window:close-requested', ({ requestId }) => {
    const projectPath = useProjectStore.getState().currentProject?.path
    const hasActiveWorkflow = !!projectPath && useWorkflowStore.getState().activeRuns.some(
      run => sameProjectPathKey(run.projectPath, projectPath),
    )
    if (hasActiveWorkflow) {
      setExitError(null)
      setExitRequest({ requestId, workflowBlocked: true })
      return
    }
    const editor = useEditorStore.getState()
    if (countUnsavedEditorItems(editor.tabs, useEditorDraftLedgerStore.getState().draftLedgers) === 0) {
      void flushAgentConversations(projectSessionContextFromProject(useProjectStore.getState().currentProject))
        .catch((error) => console.error('[TitleBar] 保存助手会话失败:', error))
        .then(() => ipc.invoke('window:resolve-close', requestId, 'proceed'))
        .then(result => {
          if (!result.success) console.error('[TitleBar] 退出请求已失效')
        }).catch(error => console.error('[TitleBar] 退出请求失败:', error))
      return
    }
    setExitError(null)
    setExitRequest({ requestId })
  }), [])

  const cancelExit = async () => {
    const request = exitRequest
    if (!request || exitBusy) return
    setExitBusy(true)
    try {
      const result = await ipc.invoke('window:resolve-close', request.requestId, 'cancel')
      if (!result.success) throw new Error(text('退出请求已失效，请重试', 'The exit request expired. Try again.'))
      setExitRequest(null)
      setExitError(null)
    } catch (error) {
      setExitError(error instanceof Error ? error.message : String(error))
    } finally {
      setExitBusy(false)
    }
  }

  const discardAndExit = async () => {
    const request = exitRequest
    if (!request || request.workflowBlocked || exitBusy) return
    setExitBusy(true)
    setExitError(null)
    try {
      const result = await ipc.invoke('window:resolve-close', request.requestId, 'cancel')
      if (!result.success) throw new Error(text('退出请求已失效，请重试', 'The exit request expired. Try again.'))
      discardAllEditorChanges()
      setExitRequest(null)
      const closeResult = await ipc.invoke('window:close')
      if (!closeResult.success) {
        await alertError(
          text('未保存修改已放弃，但无法再次发起退出。请手动重试退出。', 'Unsaved changes were discarded, but exit could not be requested again. Try exiting again.'),
          { title: text('退出失败', 'Could not exit') },
        )
      }
    } catch (error) {
      setExitError(error instanceof Error ? error.message : String(error))
    } finally {
      setExitBusy(false)
    }
  }

  const saveAndExit = async () => {
    const request = exitRequest
    if (!request || request.workflowBlocked || exitBusy) return
    setExitBusy(true)
    setExitError(null)
    try {
      await saveDirtyEditorChangesForExit(useProjectStore.getState().currentProject?.path)
      await flushAgentConversations(projectSessionContextFromProject(useProjectStore.getState().currentProject))
      const result = await ipc.invoke('window:resolve-close', request.requestId, 'proceed')
      if (!result.success) throw new Error(text('退出请求已失效，请重试', 'The exit request expired. Try again.'))
    } catch (error) {
      setExitError(error instanceof Error ? error.message : String(error))
    } finally {
      setExitBusy(false)
    }
  }

  const [showMainMenu, setShowMainMenu] = useState(false)
  const mainMenuRef = useRef<HTMLDivElement>(null)
  /** 主题切换的圆形展开原点：取最近一次在主菜单内的按下位置 */
  const mainMenuPoint = useRef({ x: 0, y: 0 })
  useOutsideClick(mainMenuRef, () => setShowMainMenu(false), showMainMenu)

  /** 从点击位置做圆形展开的主题切换；不支持 View Transition 时直接切换。 */
  const switchTheme = (next: Theme, point: { x: number; y: number }) => {
    if (
      !('startViewTransition' in document) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setTheme(next)
      return
    }

    const { x, y } = point
    const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    const transition = (document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> }
    }).startViewTransition!(() => setTheme(next))

    transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
        {
          duration: 450,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      )
    })
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        zoomIn()
      } else if (e.key === '-') {
        e.preventDefault()
        zoomOut()
      } else if (e.key === '0') {
        e.preventDefault()
        zoomReset()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [zoomIn, zoomOut, zoomReset])

  const handleOpenProject = async () => {
    const folder = await ipc.invoke('dialog:select-folder')
    if (folder) {
      openProject(folder)
    }
  }

  const zoomLabel = `${Math.round(zoom * 100)}%`

  return (
    <>
      <div
      className="writer-topbar no-select flex items-center gap-2"
      style={{
        height: 'var(--height-titlebar)',
        paddingLeft: isMac ? 78 : 14,
        paddingRight: 10,
        WebkitAppRegion: 'drag',
      } as CSSProperties}
    >
      <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
        <div
          className="writer-brand-mark flex h-[30px] w-[30px] items-center justify-center overflow-hidden"
          title={locale === 'zh-CN' ? APP_BRAND.zhName : APP_BRAND.enName}
        >
          <img src={publicAssetUrl('logo.svg')} alt="logo" className="h-full w-full object-cover" />
        </div>
      </div>

      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="relative" ref={mainMenuRef}>
          <button
            className="writer-command-button"
            title={text('主菜单', 'Main menu')}
            aria-haspopup="menu"
            aria-expanded={showMainMenu}
            onClick={() => setShowMainMenu(v => !v)}
          >
            <Menu size={17} strokeWidth={1.8} />
          </button>
          {showMainMenu && (
            <div
              role="menu"
              aria-label={text('主菜单', 'Main menu')}
              className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg py-1"
              onPointerDown={event => {
                mainMenuPoint.current = { x: event.clientX, y: event.clientY }
              }}
              style={{
                backgroundColor: 'var(--color-sidebar)',
                border: '1px solid var(--color-border)',
                boxShadow: 'var(--shadow-popover)',
                WebkitAppRegion: 'no-drag',
              } as CSSProperties}
            >
              <div className="px-3 pb-0.5 pt-1 text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                {text('项目', 'Project')}
              </div>
              <MenuItem
                label={text('新建项目', 'New project')}
                icon={<FilePlus2 size={13} />}
                shortcut={isMac ? '⌘N' : 'Ctrl+N'}
                onClick={() => { setShowMainMenu(false); openNewProject() }}
              />
              <MenuItem
                label={text('打开项目…', 'Open project…')}
                icon={<FolderOpen size={13} />}
                shortcut={isMac ? '⌘O' : 'Ctrl+O'}
                onClick={() => { setShowMainMenu(false); void handleOpenProject() }}
              />
              <div className="my-1 h-px mx-2" style={{ backgroundColor: 'var(--color-border)' }} />
              <div className="px-3 pb-0.5 pt-1 text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                {text('内容', 'Content')}
              </div>
              <MenuItem
                label={text('导入原稿…', 'Import manuscript…')}
                icon={<FileText size={13} />}
                onClick={() => { setShowMainMenu(false); openAuthorManuscriptImport() }}
              />
              <MenuItem
                label={t('project.imitationShort')}
                icon={<Import size={13} />}
                onClick={() => { setShowMainMenu(false); openNovelDeconstruction() }}
              />
              <MenuItem
                label={t('common.export')}
                icon={<Upload size={13} />}
                onClick={() => { setShowMainMenu(false); openExport() }}
              />
              <MenuItem
                label={t('common.backup')}
                icon={<Archive size={13} />}
                disabled
                onClick={() => {}}
              />
              <div className="my-1 h-px mx-2" style={{ backgroundColor: 'var(--color-border)' }} />
              <div className="px-3 pb-0.5 pt-1 text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                {text('外观', 'Appearance')}
              </div>
              {(Object.keys(themeIcons) as Theme[]).map(name => {
                const Icon = themeIcons[name]
                return (
                  <MenuItem
                    key={name}
                    label={t(themeLabelKeys[name])}
                    icon={<Icon size={13} />}
                    checked={name === theme}
                    onClick={() => {
                      setShowMainMenu(false)
                      if (name === theme) return
                      switchTheme(name, mainMenuPoint.current)
                    }}
                  />
                )
              })}
              <div className="my-1 h-px mx-2" style={{ backgroundColor: 'var(--color-border)' }} />
              <div className="px-3 pb-0.5 pt-1 text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                {text('语言', 'Language')}
              </div>
              {(['zh-CN', 'en-US'] as const).map(code => (
                <MenuItem
                  key={code}
                  label={code === 'zh-CN' ? text('简体中文', 'Simplified Chinese') : 'English'}
                  checked={locale === code}
                  onClick={() => {
                    setShowMainMenu(false)
                    if (locale !== code) void setLocale(code)
                  }}
                />
              ))}
              <div className="my-1 h-px mx-2" style={{ backgroundColor: 'var(--color-border)' }} />
              <MenuItem
                label={text('退出', 'Exit')}
                icon={<LogOut size={13} />}
                onClick={() => { setShowMainMenu(false); void ipc.invoke('window:close') }}
              />
            </div>
          )}
        </div>

        <span className="text-xs font-semibold opacity-90 whitespace-nowrap">{t('project.currentLabel')}</span>
        <button
          className="writer-command-button max-w-[280px]"
          title={t('project.switch')}
          onClick={handleOpenProject}
        >
          <span className="truncate">{currentProject?.name ?? t('project.none')}</span>
        </button>

        {hasTrackedEditors && (
          <span
            className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap"
            title={hasDirty ? t('save.dirty') : t('save.saved')}
            style={{ color: hasDirty ? 'var(--color-warning-text)' : 'var(--color-success-text)' }}
          >
            <CheckCircle2 size={14} strokeWidth={1.9} />
            {hasDirty ? t('save.modified') : t('save.saved')}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={zoomOut}
          title={t('zoom.out')}
          className="writer-command-button"
          style={{ minHeight: 24, padding: '0 6px' }}
        >
          <ZoomOut size={13} strokeWidth={1.5} />
        </button>
        <button
          onClick={zoomReset}
          title={t('zoom.reset')}
          className="writer-command-button"
          style={{ minHeight: 24, minWidth: 42, padding: '0 6px', fontFamily: 'var(--font-mono)' }}
        >
          {zoomLabel}
        </button>
        <button
          onClick={zoomIn}
          title={t('zoom.in')}
          className="writer-command-button"
          style={{ minHeight: 24, padding: '0 6px' }}
        >
          <ZoomIn size={13} strokeWidth={1.5} />
        </button>
        <div className="writer-command-divider h-5 w-px mx-1" />
        <button
          className="writer-command-button"
          title={t('common.minimize')}
          onClick={() => ipc.invoke('window:minimize')}
          style={{ minHeight: 24, padding: '0 7px' }}
        >
          <Minus size={13} />
        </button>
        <button
          className="writer-command-button"
          title={t('common.maximizeRestore')}
          onClick={() => ipc.invoke('window:toggle-maximize')}
          style={{ minHeight: 24, padding: '0 7px' }}
        >
          <Square size={12} />
        </button>
        <button
          className="writer-command-button"
          title={t('common.close')}
          onClick={() => ipc.invoke('window:close')}
          style={{ minHeight: 24, padding: '0 7px' }}
        >
          <X size={14} />
        </button>
      </div>
      </div>
      <Dialog open={exitRequest !== null} onOpenChange={(open) => {
        if (!open) void cancelExit()
      }}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{exitRequest?.workflowBlocked
              ? text('创作任务仍在运行', 'Creative task still running')
              : text('退出前处理未保存内容', 'Handle unsaved changes before exiting')}</DialogTitle>
            <DialogDescription>
              {exitRequest?.workflowBlocked
                ? text('请先等待当前创作任务完成，或在任务面板中取消任务后再退出。', 'Wait for the current creative task to finish, or cancel it in the task panel before exiting.')
                : text(
                    '保存会使用每个编辑器现有的项目会话；无法安全保存或保存期间又有输入时，应用不会退出。',
                    'Each editor saves through its existing project session. The app stays open if a save is unsafe or new input arrives while saving.',
                  )}
            </DialogDescription>
          </DialogHeader>
          {exitError && (
            <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{exitError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => void cancelExit()} disabled={exitBusy}>
              {exitRequest?.workflowBlocked ? text('知道了', 'OK') : text('取消', 'Cancel')}
            </Button>
            {!exitRequest?.workflowBlocked && (
              <>
                <Button variant="destructive" onClick={() => void discardAndExit()} disabled={exitBusy}>
                  {text('放弃并退出', 'Discard and exit')}
                </Button>
                <Button onClick={() => void saveAndExit()} disabled={exitBusy}>
                  {exitBusy ? text('处理中...', 'Working...') : text('保存并退出', 'Save and exit')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
