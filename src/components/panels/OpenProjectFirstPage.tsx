import { BookOpen, FolderOpen, Plus, X } from 'lucide-react'
import { useLocaleStore } from '../../stores/locale-store'
import { useLayoutStore } from '../../stores/layout-store'
import { useProjectStore } from '../../stores/project-store'
import { ipc } from '../../services/ipc-client'
import { confirm } from '../ui/Confirm'
import { toast } from '../ui/Toast'
import { formatRelativeTime } from '../../utils/time'
import type { Locale } from '../../i18n/types'

/**
 * 未打开项目时的主区引导。
 *
 * 空态只在这里收口：主区给出「新建 / 打开 + 最近项目」，
 * 侧栏与助手面板不再重复同一组按钮，避免首屏出现三处同义空状态。
 */
export function OpenProjectFirstPage({ title }: { title: string }) {
  const text = useLocaleStore(s => s.text)
  const recentProjects = useProjectStore(s => s.recentProjects)
  const locale = useLocaleStore(s => s.locale)

  const openNewProject = () => useLayoutStore.getState().openNewProject()

  /** 从最近项目移除记录（不删项目文件）——原先只在首页侧栏提供 */
  const removeRecent = async (project: { name: string; path: string }) => {
    const ok = await confirm(
      text(
        `确认从最近项目中移除「${project.name}」？\n这只会移除列表记录，不会删除项目文件。`,
        `Remove “${project.name}” from recent projects?\nThis only removes the list entry and does not delete project files.`,
      ),
      {
        title: text('从最近项目移除', 'Remove from recent projects'),
        confirmText: text('移除记录', 'Remove entry'),
      },
    )
    if (!ok) return
    const success = await useProjectStore.getState().removeRecentProject(project.path)
    if (success) toast.success(text(`已从最近项目移除「${project.name}」`, `Removed “${project.name}”`))
  }
  const pickProject = async () => {
    const folder = await ipc.invoke('dialog:select-folder')
    if (folder) await useProjectStore.getState().openProject(folder)
  }

  return (
    <div className="skin-workspace-page h-full flex flex-col overflow-hidden bg-[var(--color-bg)]">
      <div
        className="flex items-center justify-between gap-2 px-3 h-9 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-editor-bg)',
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium truncate text-[var(--color-text-secondary)]">
            {title}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[560px] flex-col items-center px-6 py-14">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'rgba(var(--color-accent-rgb), 0.1)', color: 'var(--color-accent)' }}
          >
            <BookOpen size={26} strokeWidth={1.6} />
          </span>
          <h2 className="mt-4 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
            {text('开始一部长篇', 'Start a long-form project')}
          </h2>
          <p className="mt-1.5 text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
            {text(
              '从设定到定稿都在本地完成，模型由你自行配置',
              'Everything from premise to final draft stays local; you bring the model.',
            )}
          </p>

          <div className="mt-6 grid w-full grid-cols-2 gap-3">
            <button
              onClick={openNewProject}
              className="flex flex-col items-start gap-1.5 rounded-lg border p-3.5 text-left transition-colors hover:border-[var(--color-accent)]"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-raised)' }}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-md"
                style={{ backgroundColor: 'rgba(var(--color-accent-rgb), 0.1)', color: 'var(--color-accent)' }}
              >
                <Plus size={15} strokeWidth={2} />
              </span>
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                {text('新建项目', 'New project')}
              </span>
              <span className="text-[0.7rem] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                {text('从空白开始，配置题材与篇幅', 'Start empty and set genre and length')}
              </span>
            </button>

            <button
              onClick={() => void pickProject()}
              className="flex flex-col items-start gap-1.5 rounded-lg border p-3.5 text-left transition-colors hover:border-[var(--color-accent)]"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-raised)' }}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-md"
                style={{ backgroundColor: 'rgba(var(--color-accent-rgb), 0.1)', color: 'var(--color-accent)' }}
              >
                <FolderOpen size={15} strokeWidth={2} />
              </span>
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                {text('打开项目', 'Open project')}
              </span>
              <span className="text-[0.7rem] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                {text('继续已有工程，恢复上次会话', 'Continue an existing project')}
              </span>
            </button>
          </div>

          {recentProjects.length > 0 && (
            <div className="mt-8 w-full">
              <div className="px-0.5 pb-2 text-[0.7rem]" style={{ color: 'var(--color-text-muted)' }}>
                {text('最近项目', 'Recent projects')}
              </div>
              <div className="flex flex-col gap-0.5">
                {recentProjects.slice(0, 5).map(project => (
                  <div
                    key={project.path}
                    className="group flex h-9 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-[var(--color-hover)]"
                  >
                    <button
                      type="button"
                      onClick={() => void useProjectStore.getState().openProject(project.path)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      <BookOpen size={13} strokeWidth={1.7} style={{ color: 'var(--color-text-muted)' }} />
                      <span className="truncate">{project.name}</span>
                      <span className="ml-auto shrink-0 text-[0.68rem]" style={{ color: 'var(--color-text-muted)' }}>
                        {formatRelativeTime(new Date(project.updatedAt).getTime(), locale as Locale)}
                      </span>
                    </button>
                    <button
                      type="button"
                      title={text('从最近项目移除', 'Remove from recent projects')}
                      aria-label={text('从最近项目移除', 'Remove from recent projects')}
                      onClick={() => void removeRecent(project)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
