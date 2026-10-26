/**
 * 审稿报告查看器 — 组合根。
 *
 * 布局：左侧「原文批注视图」（草稿正文 + 行内批注），右侧「分类看板」（总览 / 分类 / 意见卡片 /
 * 人工确认修稿清单）。所有审稿确认、快照持久化与修稿工作流逻辑仍集中在本容器。
 */
import { useEffect, useMemo, useState } from 'react'
import { captureProjectSession, isProjectSessionCurrent, isProjectSessionPath } from '../project-session-gate'
import { useProjectStore } from '../../stores/project-store'
import { useLocaleStore } from '../../stores/locale-store'
import { useEditorStore } from '../../stores/editor-store'
import { useLLMStore } from '../../stores/llm-store'
import { ipc } from '../../services/ipc-client'
import { requireIpcSuccess } from '../../services/ipc-result'
import { resolveWritingLanguage } from '../../shared/writing-language'
import {
  createHumanConfirmedReviewSnapshot,
  hasIncludedReviewItems,
  parseHumanConfirmedReviewSnapshot,
  serializeHumanConfirmedReviewSnapshot,
  type HumanConfirmedReviewSnapshot,
} from '../../shared/human-confirmed-review'
import {
  type ConfirmedChecklist,
  type EditableReviewItem,
  availableGenerationModelId,
  confirmationSourceReviewId,
  editableItemsFromReview,
  isReviewId,
  matchesReviewSource,
  parseReport,
} from './review-report-shared'
import { ConfirmedRevisionDialog } from './ConfirmedRevisionDialog'
import { globalEventBus } from '../../shared/event-bus'
import { confirm } from '../ui/Confirm'
import { toast } from '../ui/Toast'
import ReviewBoard from './ReviewBoard'
import ReviewDraftView, { type ReviewDraftLoadState } from './ReviewDraftView'
import { buildReviewDocument } from './review-annotations'

interface ReviewReportProps {
  /** 原始审稿报告文本（JSON 或旧版 markdown） */
  reportText: string
  /** 审稿报告关联的草稿路径（用于触发修稿） */
  draftPath?: string
  /** 章节号 */
  chapterNumber?: number
  /** 章节目录 */
  chapterDir?: string
  /** 原始 AI 审稿报告的数据库 ID；确认快照必须持续指向该记录。 */
  reviewId?: number
  /** 审稿与草稿所属项目。 */
  projectKey: string
}

/** 审稿报告查看器 */
export default function ReviewReport(props: ReviewReportProps) {
  const snapshot = parseHumanConfirmedReviewSnapshot(props.reportText)
  const reportKey = String(props.reviewId ?? 'untracked')
    + ':' + String(snapshot?.sourceReviewId ?? 'raw')
    + ':' + props.reportText

  // A report tab can update in place. A keyed session resets its editable
  // checklist only when the underlying immutable report changes.
  return <ReviewReportSession key={reportKey} {...props} initialSnapshot={snapshot} />
}

interface ReviewReportSessionProps extends ReviewReportProps {
  initialSnapshot: HumanConfirmedReviewSnapshot | null
}

function ReviewReportSession({
  reportText,
  draftPath,
  chapterNumber,
  chapterDir,
  projectKey,
  reviewId,
  initialSnapshot,
}: ReviewReportSessionProps) {
  const text = useLocaleStore(s => s.text)
  const writingLanguage = useProjectStore(s => resolveWritingLanguage(
    s.currentProject?.path === projectKey
      ? s.currentProject.novelConfig.writingLanguage
      : undefined,
  ))
  const parsedReport = parseReport(reportText, text('综合检查', 'General review'))
  const [items, setItems] = useState<EditableReviewItem[]>(() => (
    editableItemsFromReview(parsedReport.issues, initialSnapshot)
  ))
  const [authorGuidance, setAuthorGuidance] = useState(() => initialSnapshot?.authorGuidance ?? '')
  const [confirmed, setConfirmed] = useState<ConfirmedChecklist | null>(() => (
    initialSnapshot && isReviewId(reviewId)
      ? {
        reviewSourceId: reviewId,
        content: reportText,
        snapshot: initialSnapshot,
      }
      : null
  ))
  const [editingChecklist, setEditingChecklist] = useState(() => !initialSnapshot || !isReviewId(reviewId))
  const [checklistError, setChecklistError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [showRevisionDialog, setShowRevisionDialog] = useState(false)
  const [processing, setProcessing] = useState(false)
  const sourceReviewId = confirmationSourceReviewId(initialSnapshot, reviewId)
  const summary = initialSnapshot?.summary ?? parsedReport.summary
  const goalReview = confirmed?.snapshot.goalReview ?? initialSnapshot?.goalReview ?? parsedReport.goalReview
  const canManageChecklist = Boolean(draftPath && chapterDir)

  const [draftContent, setDraftContent] = useState('')
  const [draftMeta, setDraftMeta] = useState<{ chapterNumber: number; chapterTitle?: string; version: number } | null>(null)
  const [draftLoadState, setDraftLoadState] = useState<ReviewDraftLoadState>(
    draftPath && chapterDir ? 'loading' : 'idle',
  )
  const [activeCategory, setActiveCategory] = useState('overview')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [scrollTarget, setScrollTarget] = useState<{ blockIndex: number; nonce: number } | null>(null)

  const reviewDocument = useMemo(() => buildReviewDocument(items, draftContent), [items, draftContent])

  useEffect(() => {
    if (!draftPath || !chapterDir) return
    let cancelled = false
    void (async () => {
      const [{ parseDraftMeta }, { readDraftBody }] = await Promise.all([
        import('../../services/workflows/chapter-workflow'),
        import('../../stores/draft-store'),
      ])
      if (cancelled) return
      const projectSession = captureProjectSession(useProjectStore.getState().currentProject)
      if (!projectSession || !isProjectSessionPath(projectSession, projectKey)) {
        setDraftLoadState('error')
        return
      }
      const meta = await parseDraftMeta(draftPath, projectSession.projectPath, projectSession)
      if (cancelled || !isProjectSessionCurrent(projectSession)) return
      if (meta) {
        setDraftMeta({
          chapterNumber: meta.chapterNumber,
          chapterTitle: meta.chapterTitle,
          version: meta.version,
        })
      }
      const content = await readDraftBody(draftPath, projectSession.projectPath, projectSession)
      if (cancelled || !isProjectSessionCurrent(projectSession)) return
      setDraftContent(content)
      setDraftLoadState(content ? 'ready' : 'error')
    })().catch(() => {
      if (!cancelled) setDraftLoadState('error')
    })
    return () => {
      cancelled = true
    }
  }, [draftPath, chapterDir, projectKey])

  const scrollToAnnotation = (itemId: string) => {
    const annotation = reviewDocument.annotationByItemId.get(itemId)
    if (!annotation) return
    setScrollTarget({ blockIndex: annotation.blockIndex, nonce: Date.now() })
  }

  const selectFinding = (itemId: string) => {
    setSelectedItemId(itemId)
    scrollToAnnotation(itemId)
  }

  const selectCategory = (category: string) => {
    setActiveCategory(category)
    if (category === 'overview') return
    const firstLocated = items.find(item =>
      item.category === category && reviewDocument.annotationByItemId.has(item.id),
    )
    if (firstLocated) selectFinding(firstLocated.id)
  }

  const removeAuthorItem = (itemId: string) => {
    setItems(current => current.filter(item => item.id !== itemId))
  }

  const [deletingReport, setDeletingReport] = useState(false)
  const deleteReport = async () => {
    if (!isReviewId(reviewId)) return
    const projectSession = captureProjectSession(useProjectStore.getState().currentProject)
    if (!projectSession || !isProjectSessionPath(projectSession, projectKey)) return
    const confirmedDelete = await confirm(
      text(
        '确认删除这份审查报告？\n删除不可撤销；其人工确认清单等派生记录会一并清理，已用于修稿的记录会保留修稿结果但解除溯源关联。',
        'Delete this review report?\nThis cannot be undone. Derived confirmation records are removed; revision results are kept, but provenance links are detached.',
      ),
      {
        title: text('删除审查报告', 'Delete review report'),
        confirmText: text('删除', 'Delete'),
        danger: true,
      },
    )
    if (!confirmedDelete || !isProjectSessionCurrent(projectSession)) return
    setDeletingReport(true)
    try {
      const result = await ipc.invokeWithProjectSession(projectSession, 'db:review-delete', reviewId, projectKey)
      if (!isProjectSessionCurrent(projectSession)) return
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
      const editor = useEditorStore.getState()
      for (const tab of editor.tabs) {
        if (tab.type === 'review-report' && tab.projectKey === projectKey && tab.reviewId === reviewId) {
          editor.closeTab(tab.id)
        }
      }
      globalEventBus.emit('REFRESH_RESOURCE', {
        resources: ['reviews'],
        projectPath: projectKey,
        projectSession,
      })
      toast.success(text('已删除审查报告', 'Review report deleted'))
    } catch (error) {
      if (!isProjectSessionCurrent(projectSession)) return
      toast.error(text(
        `删除审查报告失败\n\n${error instanceof Error ? error.message : String(error)}`,
        `Could not delete the review report\n\n${error instanceof Error ? error.message : String(error)}`,
      ))
    } finally {
      if (isProjectSessionCurrent(projectSession)) setDeletingReport(false)
    }
  }

  useEffect(() => {
    if (initialSnapshot || !draftPath || !chapterDir || !isReviewId(reviewId)) return

    const projectSession = captureProjectSession(useProjectStore.getState().currentProject)
    if (!projectSession || !isProjectSessionPath(projectSession, projectKey)) return

    let cancelled = false
    void (async () => {
      const { parseDraftMeta } = await import('../../services/workflows/chapter-workflow')
      if (cancelled || !isProjectSessionCurrent(projectSession)) return
      const draftMeta = await parseDraftMeta(
        draftPath,
        projectSession.projectPath,
        projectSession,
      )
      if (cancelled || !isProjectSessionCurrent(projectSession) || !draftMeta) return

      const latestReview = await ipc.invokeWithProjectSession(
        projectSession,
        'db:review-get-latest',
        draftMeta.id,
        projectSession.projectPath,
      )
      if (cancelled || !isProjectSessionCurrent(projectSession) || !latestReview) return

      const restoredSnapshot = parseHumanConfirmedReviewSnapshot(latestReview.content)
      if (!restoredSnapshot || restoredSnapshot.sourceReviewId !== reviewId) return

      setItems(editableItemsFromReview([], restoredSnapshot))
      setAuthorGuidance(restoredSnapshot.authorGuidance)
      setConfirmed({
        reviewSourceId: latestReview.id,
        content: latestReview.content,
        snapshot: restoredSnapshot,
      })
      setEditingChecklist(false)
    })()

    return () => {
      cancelled = true
    }
  }, [chapterDir, draftPath, initialSnapshot, projectKey, reviewId])

  // 按分类分组
  const categories = new Map<string, EditableReviewItem[]>()
  for (const item of items) {
    const list = categories.get(item.category) || []
    list.push(item)
    categories.set(item.category, list)
  }

  const updateItem = (itemId: string, patch: Partial<EditableReviewItem>) => {
    setItems(current => current.map(item => item.id === itemId ? { ...item, ...patch } : item))
    setChecklistError(null)
  }

  const addAuthorItem = () => {
    setItems(current => {
      const authorItemCount = current.filter(item => item.origin === 'author').length
      return [
        ...current,
        {
          id: 'author-' + Date.now() + '-' + (authorItemCount + 1),
          category: text('作者补充', 'Author note'),
          severity: 'warning',
          description: '',
          decision: 'apply',
          origin: 'author',
        },
      ]
    })
  }

  const confirmChecklist = async () => {
    if (!draftPath || !chapterDir) {
      setChecklistError(text(
        '此审稿报告未关联到可修稿的草稿，无法确认清单。',
        'This review is not linked to a revisable draft, so its checklist cannot be confirmed.',
      ))
      return
    }
    if (!isReviewId(sourceReviewId)) {
      setChecklistError(text(
        '此审稿报告缺少原始审稿记录，无法确认。请重新运行 AI 审稿。',
        'This review has no source record, so it cannot be confirmed. Run AI review again.',
      ))
      return
    }

    if (items.some(item => item.origin === 'author' && !item.description.trim())) {
      setChecklistError(text(
        '请填写或移除空白的人工问题后再确认。',
        'Fill in or remove blank author-added issues before confirming.',
      ))
      return
    }

    const projectSession = captureProjectSession(useProjectStore.getState().currentProject)
    if (!projectSession || !isProjectSessionPath(projectSession, projectKey)) {
      setChecklistError(text(
        '当前项目会话已失效，请重新打开该项目后再确认。',
        'The current project session is no longer active. Reopen the project and try again.',
      ))
      return
    }

    setConfirming(true)
    try {
      const { parseDraftMeta } = await import('../../services/workflows/chapter-workflow')
      if (!isProjectSessionCurrent(projectSession)) return
      const draftMeta = await parseDraftMeta(
        draftPath,
        projectSession.projectPath,
        projectSession,
      )
      if (!isProjectSessionCurrent(projectSession)) return
      if (!draftMeta) {
        setChecklistError(text(
          '找不到关联草稿，无法确认审稿清单。',
          'The associated draft could not be found, so the review checklist cannot be confirmed.',
        ))
        return
      }

      const sourceReview = await ipc.invokeWithProjectSession(
        projectSession,
        'db:review-get-full',
        sourceReviewId,
        projectSession.projectPath,
      )
      if (!isProjectSessionCurrent(projectSession)) return
      const { readDraftBody } = await import('../../stores/draft-store')
      const currentDraftContent = await readDraftBody(
        draftPath,
        projectSession.projectPath,
        projectSession,
      )
      if (!isProjectSessionCurrent(projectSession)) return
      if (
        !sourceReview
        || sourceReview.id !== sourceReviewId
        || sourceReview.baseDraftId !== draftMeta.id
        || !sourceReview.sourceDraft
        || !matchesReviewSource(sourceReview.sourceDraft, draftMeta, currentDraftContent)
      ) {
        setChecklistError(text(
          '源草稿已变化，无法确认这份旧审稿；请重新运行 AI 审稿。',
          'The source draft changed, so this stale review cannot be confirmed. Run AI review again.',
        ))
        return
      }

      const snapshot = createHumanConfirmedReviewSnapshot({
        sourceReviewId,
        sourceDraft: sourceReview.sourceDraft,
        summary,
        authorGuidance,
        ...(goalReview ? { goalReview } : {}),
        items: items.map(({
          category, severity, description, quote, stableFactKey, sourceChapter, goalId, decision, origin,
        }) => ({
          category,
          severity,
          description,
          ...(quote?.trim() ? { quote: quote.trim() } : {}),
          ...(stableFactKey ? { stableFactKey } : {}),
          ...(sourceChapter ? { sourceChapter } : {}),
          ...(goalId ? { goalId } : {}),
          decision,
          origin,
        })),
      })
      if (!snapshot) {
        setChecklistError(text(
          '审稿清单包含未填写的分类、问题或严重程度；请补充后再确认。',
          'The checklist has an empty category, issue, or severity. Complete it before confirming.',
        ))
        return
      }

      const reviewIndex = await ipc.invokeWithProjectSession(
        projectSession,
        'db:review-next-index',
        draftMeta.id,
        projectSession.projectPath,
      )
      if (!isProjectSessionCurrent(projectSession)) return
      const content = serializeHumanConfirmedReviewSnapshot(snapshot)
      const createResponse = await ipc.invokeWithProjectSession(projectSession, 'db:review-create', {
          baseDraftId: draftMeta.id,
          reviewIndex,
          content,
          expectedSource: sourceReview.sourceDraft,
          // 确认快照是派生记录：随来源报告一起清理，不进「审查报告 #N」清单。
          kind: 'confirmation',
          sourceReviewId,
        }, projectSession.projectPath)
      if (createResponse.errorCode === 'SOURCE_DRAFT_CHANGED') {
        throw new Error(text(
          '确认期间源草稿已变化，清单未保存；请重新运行 AI 审稿。',
          'The source draft changed during confirmation, so the checklist was not saved. Run AI review again.',
        ))
      }
      const createResult = requireIpcSuccess(
        createResponse,
        text('保存确认审稿清单', 'Save confirmed review checklist'),
      )
      if (!isProjectSessionCurrent(projectSession)) return
      if (!isReviewId(createResult.id)) {
        throw new Error(text(
          '确认审稿清单未返回记录标识。',
          'The confirmed checklist did not return a record identifier.',
        ))
      }

      setConfirmed({
        reviewSourceId: createResult.id,
        content,
        snapshot,
      })
      setEditingChecklist(false)
      setChecklistError(null)
    } catch (error) {
      if (!isProjectSessionCurrent(projectSession)) return
      setChecklistError(error instanceof Error
        ? error.message
        : text('确认审稿清单时发生错误。', 'An error occurred while confirming the review checklist.'))
    } finally {
      if (isProjectSessionCurrent(projectSession)) setConfirming(false)
    }
  }

  const startConfirmedRevision = async (generationModelId: string): Promise<string | null> => {
    if (!confirmed || editingChecklist) {
      return text(
        '请先确认审稿清单后再启动修稿。',
        'Confirm the review checklist before starting a revision.',
      )
    }
    if (!hasIncludedReviewItems(confirmed.snapshot)) {
      const error = text(
        '未纳入任何审稿项，无法启动修稿。请恢复至少一项错误或建议后重新确认。',
        'No review item is included. Restore at least one issue or suggestion, then confirm again before revising.',
      )
      setChecklistError(error)
      return error
    }
    if (!draftPath || !chapterDir) {
      return text(
        '此审稿报告未关联到可修稿的草稿。',
        'This review is not linked to a revisable draft.',
      )
    }

    const projectSession = captureProjectSession(useProjectStore.getState().currentProject)
    if (!projectSession || !isProjectSessionPath(projectSession, projectKey)) {
      return text(
        '当前项目会话已失效，请重新打开该项目后再试。',
        'The current project session is no longer active. Reopen the project and try again.',
      )
    }

    setProcessing(true)
    try {
      const { readDraftBody } = await import('../../stores/draft-store')
      const draftContent = await readDraftBody(
        draftPath,
        projectSession.projectPath,
        projectSession,
      )
      if (!isProjectSessionCurrent(projectSession)) return null
      if (!draftContent) {
        return text(
          '关联草稿为空或无法读取，未启动修稿。',
          'The associated draft is empty or unreadable; revision was not started.',
        )
      }

      // Re-check after every asynchronous preflight: a deleted or repurposed
      // profile must never be frozen into a revision workflow.
      const currentModelId = availableGenerationModelId(
        useLLMStore.getState().models,
        generationModelId,
      )
      if (!currentModelId) {
        return text(
          '所选修稿模型已不可用。请选择一项可用于文本生成的模型后再试。',
          'The selected revision model is no longer available. Select a compatible generation model and try again.',
        )
      }

      const { createRefineFromReviewWorkflow, parseDraftMeta } = await import('../../services/workflows/chapter-workflow')
      const draftMeta = await parseDraftMeta(
        draftPath,
        projectSession.projectPath,
        projectSession,
      )
      if (!isProjectSessionCurrent(projectSession)) return null
      if (!draftMeta) {
        return text(
          '找不到关联草稿，未启动修稿。',
          'The associated draft could not be found; revision was not started.',
        )
      }
      if (
        !confirmed.snapshot.sourceDraft
        || !matchesReviewSource(confirmed.snapshot.sourceDraft, draftMeta, draftContent)
      ) {
        return text(
          '源草稿已变化，未启动修稿；请重新运行 AI 审稿并确认清单。',
          'The source draft changed, so revision was not started. Run AI review and confirm the checklist again.',
        )
      }

      const frozenGenerationModelId = availableGenerationModelId(
        useLLMStore.getState().models,
        currentModelId,
      )
      if (!frozenGenerationModelId) {
        return text(
          '所选修稿模型已不可用。请选择一项可用于文本生成的模型后再试。',
          'The selected revision model is no longer available. Select a compatible generation model and try again.',
        )
      }

      const chapterNum = draftMeta.chapterNumber || chapterNumber || 0
      const chapterTitle = draftMeta.chapterTitle || text(
        '第' + chapterNum + '章',
        'Chapter ' + chapterNum,
      )
      const { useWorkflowStore } = await import('../../stores/workflow-store')
      if (!isProjectSessionCurrent(projectSession)) return null
      useWorkflowStore.getState().startWorkflow(createRefineFromReviewWorkflow({
        projectPath: projectSession.projectPath,
        chapterNumber: chapterNum,
        chapterTitle,
        draftPath,
        draftContent,
        confirmedReviewContent: confirmed.content,
        reviewSourceId: confirmed.reviewSourceId,
        generationModelId: frozenGenerationModelId,
      }, projectSession), false)
      setChecklistError(null)
      return null
    } catch (error) {
      if (!isProjectSessionCurrent(projectSession)) return null
      return error instanceof Error
        ? error.message
        : text('启动审稿修稿时发生错误。', 'An error occurred while starting the review-driven revision.')
    } finally {
      if (isProjectSessionCurrent(projectSession)) setProcessing(false)
    }
  }

  return (
    <div
      className="flex h-full min-h-0 w-full overflow-hidden"
      style={{ backgroundColor: 'var(--color-editor-bg)' }}
    >
      <ReviewDraftView
        text={text}
        chapterNumber={draftMeta?.chapterNumber ?? chapterNumber}
        chapterTitle={draftMeta?.chapterTitle}
        draftVersion={draftMeta?.version}
        characterCount={reviewDocument.characterCount}
        blocks={reviewDocument.blocks}
        annotations={reviewDocument.annotations}
        activeCategory={activeCategory === 'overview' ? null : activeCategory}
        selectedItemId={selectedItemId}
        loadState={draftLoadState}
        scrollTarget={scrollTarget}
        onSelectAnnotation={setSelectedItemId}
      />

      <ReviewBoard
        text={text}
        items={items}
        goalReview={goalReview}
        summary={summary}
        activeCategory={activeCategory}
        onCategoryChange={selectCategory}
        selectedItemId={selectedItemId}
        onSelectItem={selectFinding}
        annotations={reviewDocument.annotations}
        editingChecklist={editingChecklist}
        authorGuidance={authorGuidance}
        onAuthorGuidanceChange={setAuthorGuidance}
        onUpdateItem={updateItem}
        onAddAuthorItem={addAuthorItem}
        onRemoveAuthorItem={removeAuthorItem}
        onConfirmChecklist={() => {
          void confirmChecklist()
        }}
        confirming={confirming}
        canManageChecklist={canManageChecklist}
        checklistError={checklistError}
        confirmed={Boolean(confirmed)}
        onEditChecklist={() => {
          setEditingChecklist(true)
          setChecklistError(null)
        }}
        onStartRevision={() => {
          if (!confirmed) return
          if (!hasIncludedReviewItems(confirmed.snapshot)) {
            setChecklistError(text(
              '未纳入任何审稿项，无法启动修稿。请恢复至少一项错误或建议后重新确认。',
              'No review item is included. Restore at least one issue or suggestion, then confirm again before revising.',
            ))
            return
          }
          setChecklistError(null)
          setShowRevisionDialog(true)
        }}
        processing={processing}
        reportText={reportText}
        hasConfirmedSnapshot={Boolean(initialSnapshot)}
        {...(isReviewId(reviewId) ? { onDeleteReport: () => { void deleteReport() }, deletingReport } : {})}
      />

      {showRevisionDialog && confirmed && (
        <ConfirmedRevisionDialog
          snapshot={confirmed.snapshot}
          writingLanguage={writingLanguage}
          onClose={() => setShowRevisionDialog(false)}
          onStart={startConfirmedRevision}
        />
      )}
    </div>
  )
}
