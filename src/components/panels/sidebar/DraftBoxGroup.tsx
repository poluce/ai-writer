/**
 * DraftBoxGroup — 草稿箱折叠组（含章节分组和单条草稿条目）
 */

import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, CheckCircle2, Circle, FileText, FolderOpen, Copy, Trash2, FilePen, ClipboardCheck, X } from 'lucide-react'
import type { DraftMeta } from '../../../stores/draft-store'
import { useDraftStore, readDraftBody } from '../../../stores/draft-store'
import { useEditorStore } from '../../../stores/editor-store'
import { confirm } from '../../ui/Confirm'
import { DRAFT_STATUS_LABEL, DRAFT_STATUS_COLOR } from '../../../shared/draft-status'
import { showSidebarMenu } from './sidebar-menu'
import { ipc } from '../../../services/ipc-client'
import { toast } from '../../ui/Toast'
import { globalEventBus } from '../../../shared/event-bus'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import {
  captureProjectSession,
  isProjectSessionCurrent,
  isProjectSessionPath} from '../../project-session-gate'
import { parseReport } from '../../editor/review-report-shared'
import { openReviewReportTab } from '../../../services/editor/open-review-report'
import type { ReviewMeta } from '../../../shared/contracts/review'
import { deleteFinalizedChapter } from './finalized-chapter-deletion'

const DRAFT_STATUS_EN: Record<string, string> = {
  draft: 'Draft', revising: 'Revising', reviewed: 'Reviewed', finalized: 'Finalized', archived: 'Archived'}

// ===== 草稿箱折叠组 =====

export default function DraftBoxGroup({
  draftsByChapter}: {
  draftsByChapter: Record<number, DraftMeta[]>
}) {
  const [open, setOpen] = useState(true)
  const text = useLocaleStore(s => s.text)
  const projectKey = useProjectStore(s => s.currentProject?.path)
  if (!projectKey) return null

  // 所有章节号排序
  const chapterNums = Object.keys(draftsByChapter)
    .map(Number)
    .sort((a, b) => a - b)

  // 筛选出包含非保留（活跃）草稿的实际章节数
  const activeChapterCount = chapterNums.filter(n =>
    (draftsByChapter[n] || []).some(d => d.status !== 'archived')
  ).length

  return (
    <div>
      {/* 草稿箱标题行 */}
      <div
        className="tree-item gap-1.5 cursor-pointer select-none"
        style={{ paddingLeft: 8 }}
        onClick={() => setOpen(v => !v)}
        title={text('草稿箱：AI 生成后的章节草稿在此管理，定稿后进入正文章节', 'Draft box: manage AI-generated drafts here. Finalized drafts move to the manuscript.')}
      >
        <FilePen size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{text('草稿箱', 'Draft box')}</span>
        <span className="inline-flex items-center p-0.5" style={{ color: 'var(--color-text-muted)' }}>
          {open
            ? <ChevronDown size={12} />
            : <ChevronRight size={12} />
          }
        </span>
        {activeChapterCount > 0 && (
          <span className="ml-auto text-[0.7rem]" style={{ color: 'var(--color-text-muted)' }}>
            {text(`${activeChapterCount} 章`, `${activeChapterCount} chapters`)}
          </span>
        )}
      </div>

      {open && (
        <div>
          {chapterNums.length === 0 ? (
            <div
              className="text-xs py-1"
              style={{ paddingLeft: 24, color: 'var(--color-text-muted)' }}
            >
              {text('暂无草稿（从章节蓝图点击「写作此章」创作）', 'No drafts. Use “Write chapter” from a chapter blueprint.')}
            </div>
          ) : (
            chapterNums.map(chNum => (
              <DraftChapterGroup
                key={chNum}
                chapterNumber={chNum}
                drafts={draftsByChapter[chNum] || []}
                projectKey={projectKey}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ===== 单章草稿分组 =====

function DraftChapterGroup({
  chapterNumber,
  drafts,
  projectKey}: {
  chapterNumber: number
  drafts: DraftMeta[]
  projectKey: string
}) {
  const text = useLocaleStore(s => s.text)
  const currentProject = useProjectStore(s => s.currentProject)
  const [open, setOpen] = useState(true)

  // 将 archived 草稿折叠，只显示活跃草稿（非 archived）
  const activeDrafts = drafts.filter(d => d.status !== 'archived')
  const archivedDrafts = drafts.filter(d => d.status === 'archived')
  const [showArchived, setShowArchived] = useState(false)
  const [bpTitle, setBpTitle] = useState<{ projectKey: string; title: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    const projectSession = captureProjectSession(currentProject)
    if (!projectSession || !isProjectSessionPath(projectSession, projectKey)) return
    ipc.invokeWithProjectSession(projectSession, 'db:blueprint-get', chapterNumber, projectKey).then(bp => {
      if (!cancelled && isProjectSessionCurrent(projectSession) && bp?.title) {
        setBpTitle({ projectKey, title: bp.title })
      }
    }).catch(() => { })
    return () => { cancelled = true }
  }, [chapterNumber, currentProject, projectKey])

  // 已定稿的草稿存在时，章节显示绿色标记
  const hasFinalized = drafts.some(d => d.status === 'finalized')
  const finalizedTitle = drafts.find(d => d.status === 'finalized' && d.chapterTitle?.trim())?.chapterTitle
  const scopedBlueprintTitle = bpTitle?.projectKey === projectKey ? bpTitle.title : ''
  const baseTitle = finalizedTitle || scopedBlueprintTitle || drafts[0]?.chapterTitle || ''
  const cleanTitle = baseTitle.startsWith(`第${chapterNumber}章`)
    ? baseTitle.replace(`第${chapterNumber}章`, '').trim()
    : baseTitle
  const displayTitle = text(
    cleanTitle ? `第${chapterNumber}章 ${cleanTitle}` : `第${chapterNumber}章`,
    cleanTitle ? `Chapter ${chapterNumber} ${cleanTitle}` : `Chapter ${chapterNumber}`
  )

  return (
    <div>
      {/* 章节行 */}
      <div
        className="tree-item gap-1.5 cursor-pointer select-none"
        style={{ paddingLeft: 20 }}
        onClick={() => setOpen(v => !v)}
        title={displayTitle}
      >
        {open
          ? <ChevronDown size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          : <ChevronRight size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        }
        {hasFinalized
          ? <CheckCircle2 size={10} style={{ flexShrink: 0, color: 'var(--color-success)' }} />
          : <Circle size={6} style={{ flexShrink: 0, fill: 'transparent', stroke: 'var(--color-text-muted)' }} />
        }
        <span className="text-sm flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>
          {displayTitle}
        </span>
        <span className="ml-auto text-[0.7rem] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          {text(`${activeDrafts.length} 稿`, `${activeDrafts.length} drafts`)}
        </span>
      </div>

      {/* 草稿列表 */}
      {open && (
        <div>
          {activeDrafts.map(draft => (
            <DraftItem
              key={draft.filePath}
              draft={draft}
              chapterTitleText={displayTitle}
              projectKey={projectKey}
            />
          ))}

          {/* 显示归档草稿的切换按钮 */}
          {archivedDrafts.length > 0 && (
            <div
              className="flex items-center gap-1 cursor-pointer select-none"
              style={{ paddingLeft: 42 }}
              onClick={() => setShowArchived(v => !v)}
            >
              <span className="text-[0.7rem]" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
                {showArchived ? <><ChevronDown size={10} className="inline" /> {text('隐藏', 'Hide')}</> : <><ChevronRight size={10} className="inline" /> {text(`${archivedDrafts.length} 个已归档`, `${archivedDrafts.length} archived`)}</>}
              </span>
            </div>
          )}
          {showArchived && archivedDrafts.map(draft => (
            <DraftItem
              key={draft.filePath}
              draft={draft}
              chapterTitleText={displayTitle}
              projectKey={projectKey}
              archived
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ===== 单条草稿条目 =====

function DraftItem({
  draft,
  chapterTitleText,
  projectKey,
  archived = false}: {
  draft: DraftMeta
  chapterTitleText: string
  projectKey: string
  archived?: boolean
}) {
  const text = useLocaleStore(s => s.text)
  const currentProject = useProjectStore(s => s.currentProject)
  const statusLabel = text(DRAFT_STATUS_LABEL[draft.status] || draft.status, DRAFT_STATUS_EN[draft.status] || draft.status)
  /** 打开草稿到编辑器 */
  const openDraft = async () => {
    const projectSession = captureProjectSession(currentProject)
    if (!projectSession || !isProjectSessionPath(projectSession, projectKey)) return
    const content = await readDraftBody(draft.filePath, projectKey, projectSession)
    if (!isProjectSessionCurrent(projectSession)) return
    useEditorStore.getState().openFile({
      id: draft.filePath,
      name: `${chapterTitleText} v${draft.version}`,
      type: 'chapter',
      filePath: draft.filePath,
      content,
      savedContent: content,
      draftId: draft.id,
      chapterNumber: draft.chapterNumber,
      draftStatus: draft.status,
      projectKey})
  }

  /** 删除草稿 */
  const deleteDraft = async () => {
    if (draft.status === 'finalized') {
      await deleteFinalizedChapter({
        project: currentProject,
        projectPath: projectKey,
        draftId: draft.id,
        chapterNumber: draft.chapterNumber,
        displayName: `${chapterTitleText} v${draft.version}`,
        tabFilePath: draft.filePath,
        surface: 'draft'})
      return
    }

    const projectSession = captureProjectSession(currentProject)
    if (!projectSession || !isProjectSessionPath(projectSession, projectKey)) return
    const ok = await confirm(
      text(`确认删除 "${chapterTitleText} v${draft.version}"？\n此操作会删除该稿正文记录及关联的审稿/修稿产物，不可撤销。`, `Delete “${chapterTitleText} v${draft.version}”?\nThis permanently removes the draft and related review/revision artifacts.`),
      { title: text('删除这一稿', 'Delete draft'), confirmText: text('删除', 'Delete'), danger: true }
    )
    if (!ok || !isProjectSessionCurrent(projectSession)) return
    const result = await ipc.invokeWithProjectSession(
      projectSession,
      'db:draft-delete',
      draft.id,
      projectKey,
    )
    if (!isProjectSessionCurrent(projectSession)) return
    if (result.errorCode === 'FINALIZED_DRAFT_DELETE_REQUIRED') {
      await useDraftStore.getState().loadChapterDrafts(
        draft.chapterNumber,
        projectKey,
        projectSession,
      )
      if (!isProjectSessionCurrent(projectSession)) return
      await deleteFinalizedChapter({
        project: currentProject,
        projectPath: projectKey,
        draftId: draft.id,
        chapterNumber: draft.chapterNumber,
        displayName: `${chapterTitleText} v${draft.version}`,
        tabFilePath: draft.filePath,
        surface: 'draft'})
      return
    }
    if (!result.success) {
      toast.error(text(`删除失败\n\n${result.error ?? '未知错误'}`, `Delete failed\n\n${result.error ?? 'Unknown error'}`))
      return
    }
    const editor = useEditorStore.getState()
    const tab = editor.tabs.find(t =>
      t.projectKey === projectKey && (t.id === draft.filePath || t.filePath === draft.filePath)
    )
    if (tab) editor.closeTab(tab.id)
    await useDraftStore.getState().loadChapterDrafts(
      draft.chapterNumber,
      projectKey,
      projectSession,
    )
    if (!isProjectSessionCurrent(projectSession)) return
    globalEventBus.emit('REFRESH_RESOURCE', {
      resources: ['drafts', 'fileTree'],
      projectPath: projectKey,
      projectSession})
    toast.success(text(`已删除 ${chapterTitleText} v${draft.version}`, `Deleted ${chapterTitleText} v${draft.version}`))
  }

  const isFinalized = draft.status === 'finalized'

  return (
    <>
      <div
        className="relative flex items-center gap-1.5 cursor-pointer hover:bg-[var(--color-hover)]"
        style={{
          paddingLeft: 40,
          paddingRight: 8,
          paddingTop: 3,
          paddingBottom: 3,
          opacity: archived ? 0.45 : 1}}
        onClick={openDraft}
        onContextMenu={e => showSidebarMenu([
          {
            key: 'open',
            label: text('打开草稿', 'Open draft'),
            icon: <FolderOpen size={13} />,
            onClick: openDraft},
          { key: 'div1', type: 'divider' as const },
          {
            key: 'copy-path',
            label: text('复制文件路径', 'Copy file path'),
            icon: <Copy size={13} />,
            onClick: () => navigator.clipboard.writeText(draft.filePath).catch(() => { })},
          { key: 'div2', type: 'divider' as const },
          {
            key: 'delete',
            label: text('删除这一稿', 'Delete draft'),
            icon: <Trash2 size={13} />,
            danger: true,
            onClick: deleteDraft},
        ], e)}
        title={text(`点击打开 — ${chapterTitleText} v${draft.version}（${DRAFT_STATUS_LABEL[draft.status] || draft.status}）`, `Open — ${chapterTitleText} v${draft.version} (${statusLabel})`)}
      >
        <FileText size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        <span className="text-xs flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>
          {text(`草稿_v${draft.version}`, `Draft_v${draft.version}`)}
        </span>
        {/* 状态标签（始终显示） */}
        <span
          className="text-[0.7rem] flex-shrink-0"
          style={{ color: DRAFT_STATUS_COLOR[draft.status] || 'var(--color-text-muted)' }}
        >
          {statusLabel}
        </span>
        {/* 已定稿图标 */}
        {isFinalized && (
          <CheckCircle2 size={10} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
        )}
        <button
          type="button"
          className="opacity-70 hover:opacity-100 rounded p-0.5"
          title={text('删除这一稿', 'Delete draft')}
          onClick={(e) => {
            e.stopPropagation()
            deleteDraft()
          }}
          style={{ color: 'var(--color-text-muted)' }}
        >
          <Trash2 size={10} />
        </button>
      </div>
      <DraftReviewReports draft={draft} projectKey={projectKey} />
    </>
  )
}

// ===== 草稿下的审查报告子节点 =====

interface ReviewSeveritySummary {
  /** 摘要只属于最新一轮审查；换报告后旧摘要必须失效。 */
  reviewId: number
  errorCount: number
  warningCount: number
}

/** 某个草稿当前已加载的审查数据；key 让项目/草稿切换后旧数据自动失效。 */
interface DraftReviewData {
  key: string
  reviews: ReviewMeta[]
  summary: ReviewSeveritySummary | null
}

/**
 * 每条草稿下的审查报告节点（多轮审查按 review_index 升序展示）。
 *
 * 节点本身只持有元数据；严重度摘要只对最新一轮拉取全文计算，
 * 点击时才读取所选轮次的全文，避免每行都预读整份报告。
 */
function DraftReviewReports({
  draft,
  projectKey}: {
  draft: DraftMeta
  projectKey: string
}) {
  const text = useLocaleStore(s => s.text)
  const currentProject = useProjectStore(s => s.currentProject)
  const editorTabs = useEditorStore(s => s.tabs)
  const [reviewData, setReviewData] = useState<DraftReviewData | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const projectSession = captureProjectSession(currentProject)
  const sessionKey = projectSession && isProjectSessionPath(projectSession, projectKey)
    ? `${projectSession.projectId}\u0000${projectSession.projectPath}`
    : ''
  const dataKey = `${sessionKey}\u0000${draft.id}`

  // 侧栏只刷新本项目会话的审查数据（新增审稿后由渲染端动作广播）。
  useEffect(() => globalEventBus.on('REFRESH_RESOURCE', (payload) => {
    if (!payload.resources.includes('reviews') && !payload.resources.includes('all')) return
    if (!isProjectSessionCurrent(payload.projectSession)) return
    if (!isProjectSessionPath(payload.projectSession, projectKey)) return
    setRefreshToken(token => token + 1)
  }), [projectKey])

  useEffect(() => {
    let cancelled = false
    const frozenSession = captureProjectSession(currentProject)
    if (!frozenSession || !isProjectSessionPath(frozenSession, projectKey)) return

    void (async () => {
      try {
        const listed = await ipc.invokeWithProjectSession(
          frozenSession,
          'db:review-list',
          draft.id,
          projectKey,
        )
        if (cancelled || !isProjectSessionCurrent(frozenSession)) return
        // 侧栏只展示 AI 审稿报告；人工确认快照是派生记录，不单独作为「审查报告 #N」。
        const ordered = Array.isArray(listed)
          ? listed
            .filter(row => row.kind !== 'confirmation')
            .sort((left, right) => left.reviewIndex - right.reviewIndex)
          : []
        setReviewData({ key: dataKey, reviews: ordered, summary: null })

        const latest = ordered[ordered.length - 1]
        if (!latest) return
        const full = await ipc.invokeWithProjectSession(
          frozenSession,
          'db:review-get-full',
          latest.id,
          projectKey,
        )
        if (cancelled || !isProjectSessionCurrent(frozenSession) || !full) return
        // 摘要只关心严重/建议条数，不需要文案映射，故不传兜底分类。
        const { issues } = parseReport(full.content, '')
        const summary: ReviewSeveritySummary = {
          reviewId: latest.id,
          errorCount: issues.filter(issue => issue.severity === 'error').length,
          warningCount: issues.filter(issue => issue.severity === 'warning').length,
        }
        setReviewData(current => (
          current && current.key === dataKey ? { ...current, summary } : current
        ))
      } catch {
        // 侧栏是辅助视图：审查数据缺失或项目已切换时不打断创作流程。
      }
    })()

    return () => { cancelled = true }
  }, [currentProject, dataKey, draft.id, projectKey, refreshToken])

  const openReview = async (review: ReviewMeta) => {
    const frozenSession = captureProjectSession(currentProject)
    if (!frozenSession || !isProjectSessionPath(frozenSession, projectKey)) return
    try {
      const full = await ipc.invokeWithProjectSession(
        frozenSession,
        'db:review-get-full',
        review.id,
        projectKey,
      )
      if (!isProjectSessionCurrent(frozenSession) || !full) return
      openReviewReportTab({
        review: full,
        chapterNumber: draft.chapterNumber,
        draftFilePath: draft.filePath,
        chapterDir: `vela://draft/ch${draft.chapterNumber}`,
        projectKey})
    } catch (error) {
      if (!isProjectSessionCurrent(frozenSession)) return
      toast.error(text(
        `打开审查报告失败\n\n${error instanceof Error ? error.message : String(error)}`,
        `Could not open the review report\n\n${error instanceof Error ? error.message : String(error)}`,
      ))
    }
  }

  const closeReview = (review: ReviewMeta) => {
    const editor = useEditorStore.getState()
    for (const tab of editor.tabs) {
      if (tab.type === 'review-report' && tab.projectKey === projectKey && tab.reviewId === review.id) {
        editor.closeTab(tab.id)
      }
    }
  }

  const deleteReview = async (review: ReviewMeta, displayIndex: number) => {
    const frozenSession = captureProjectSession(currentProject)
    if (!frozenSession || !isProjectSessionPath(frozenSession, projectKey)) return
    const confirmed = await confirm(
      text(
        `确认删除「审查报告 #${displayIndex}」？\n删除不可撤销；该报告的确认清单等派生记录会一并清理，已用于修稿的记录会保留修稿结果但解除溯源关联。`,
        `Delete "Review report #${displayIndex}"?\nThis cannot be undone. Derived confirmation records are removed; revision results are kept, but provenance links are detached.`,
      ),
      {
        title: text('删除审查报告', 'Delete review report'),
        confirmText: text('删除', 'Delete'),
        danger: true,
      },
    )
    if (!confirmed || !isProjectSessionCurrent(frozenSession)) return
    try {
      const result = await ipc.invokeWithProjectSession(
        frozenSession,
        'db:review-delete',
        review.id,
        projectKey,
      )
      if (!isProjectSessionCurrent(frozenSession)) return
      if (!result.success) {
        toast.error(result.errorCode === 'REVIEW_IN_USE_BY_PENDING_REVISION'
          ? text(
            '该审查报告正在用于修稿，请等待修稿完成后再删除。',
            'This review report is being used by an in-progress revision. Delete it after the revision finishes.',
          )
          : text(
            `删除审查报告失败\n\n${result.error ?? ''}`,
            `Could not delete the review report\n\n${result.error ?? ''}`,
          ))
        return
      }
      closeReview(review)
      globalEventBus.emit('REFRESH_RESOURCE', {
        resources: ['reviews'],
        projectPath: projectKey,
        projectSession: frozenSession,
      })
      toast.success(text(
        `已删除审查报告 #${displayIndex}`,
        `Deleted review report #${displayIndex}`,
      ))
    } catch (error) {
      if (!isProjectSessionCurrent(frozenSession)) return
      toast.error(text(
        `删除审查报告失败\n\n${error instanceof Error ? error.message : String(error)}`,
        `Could not delete the review report\n\n${error instanceof Error ? error.message : String(error)}`,
      ))
    }
  }

  const reviews = reviewData?.key === dataKey ? reviewData.reviews : []
  if (reviews.length === 0) return null
  const latestReviewId = reviews[reviews.length - 1]?.id
  const latestSummary = reviewData?.summary && reviewData.summary.reviewId === latestReviewId
    ? reviewData.summary
    : null

  return (
    <div>
      {reviews.map((review, index) => {
        const displayIndex = index + 1
        const isActive = editorTabs.some(tab => (
          tab.type === 'review-report'
          && tab.projectKey === projectKey
          && tab.reviewId === review.id
        ))
        const reviewSummary = review.id === latestReviewId ? latestSummary : null
        return (
          <div
            key={review.id}
            className={`tree-item cursor-pointer select-none${isActive ? ' active' : ''}`}
            style={{ paddingLeft: 56, paddingRight: 8 }}
            onClick={() => { void openReview(review) }}
            onContextMenu={event => showSidebarMenu([
              {
                key: 'open',
                label: text('打开审查报告', 'Open review report'),
                icon: <FolderOpen size={13} />,
                onClick: () => { void openReview(review) },
              },
              ...(isActive ? [{
                key: 'close',
                label: text('关闭审查报告', 'Close review report'),
                icon: <X size={13} />,
                onClick: () => closeReview(review),
              }] : []),
              { key: 'divider', type: 'divider' as const },
              {
                key: 'delete',
                label: text('删除审查报告', 'Delete review report'),
                icon: <Trash2 size={13} />,
                danger: true,
                onClick: () => { void deleteReview(review, displayIndex) },
              },
            ], event)}
            title={text(`点击打开审查报告 #${displayIndex}`, `Open review report #${displayIndex}`)}
          >
            <ClipboardCheck size={11} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
            <span className="flex-1 truncate" style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
              {text(`审查报告 #${displayIndex}`, `Review report #${displayIndex}`)}
            </span>
            {reviewSummary && (
              <span className="flex items-center gap-1 flex-shrink-0" style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--color-error-text)' }}>
                  {text(`${reviewSummary.errorCount} 严重`, `${reviewSummary.errorCount} critical`)}
                </span>
                <span style={{ color: 'var(--color-text-muted)' }}>·</span>
                <span style={{ color: 'var(--color-warning-text)' }}>
                  {text(`${reviewSummary.warningCount} 建议`, `${reviewSummary.warningCount} suggestions`)}
                </span>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
