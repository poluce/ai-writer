/**
 * 审稿报告 · 右侧「分类看板」。
 *
 * 结构：报告头 → 总览/分类导航 → 意见卡片列表 → 人工确认修稿清单。
 * 所有状态与提交动作由 ReviewReport 容器注入，这里只做展示与表单绑定。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ClipboardCheck,
  FileCheck2,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  Trash2,
  LocateFixed,
  Pencil,
  Plus,
  Quote,
  Sparkles,
  X,
} from 'lucide-react'

import type { ChapterGoalReview } from '../../shared/chapter-goal-review'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Label } from '../ui/Label'
import { NativeSelect } from '../ui/NativeSelect'
import { Textarea } from '../ui/Textarea'
import { SEVERITY_META, SeverityIcon, severityCopy } from './ReviewSeverityBadge'
import {
  chapterGoalStatusLabel,
  normalizeSeverity,
  type EditableReviewItem,
} from './review-report-shared'
import type { ReviewAnnotation, ReviewSeverity } from './review-annotations'

const SEVERITY_ORDER: ReviewSeverity[] = ['error', 'warning', 'unknown', 'pass']

const ANNOTATION_ACCENT: Record<ReviewSeverity, string> = {
  error: 'var(--color-error)',
  warning: 'var(--color-warning)',
  unknown: 'var(--color-info)',
  pass: 'var(--color-success)',
}

const OVERVIEW = 'overview'

export interface ReviewBoardProps {
  text: (zhCNText: string, enUSText: string) => string
  items: EditableReviewItem[]
  goalReview?: ChapterGoalReview
  summary: string
  activeCategory: string
  onCategoryChange: (category: string) => void
  selectedItemId: string | null
  onSelectItem: (itemId: string) => void
  annotations: ReviewAnnotation[]
  editingChecklist: boolean
  authorGuidance: string
  onAuthorGuidanceChange: (value: string) => void
  onUpdateItem: (itemId: string, patch: Partial<EditableReviewItem>) => void
  onAddAuthorItem: () => void
  onRemoveAuthorItem: (itemId: string) => void
  onConfirmChecklist: () => void
  confirming: boolean
  canManageChecklist: boolean
  checklistError: string | null
  confirmed: boolean
  onEditChecklist: () => void
  onStartRevision: () => void
  processing: boolean
  reportText: string
  hasConfirmedSnapshot: boolean
  /** 删除当前审查报告（不可撤销）；未关联数据库记录时不提供。 */
  onDeleteReport?: () => void
  deletingReport?: boolean
}

function worstSeverity(items: EditableReviewItem[]): ReviewSeverity {
  return SEVERITY_ORDER.find(severity => items.some(item => item.severity === severity)) ?? 'unknown'
}

function reviewSortValue(item: EditableReviewItem): number {
  return SEVERITY_ORDER.indexOf(item.severity)
}

function DecisionToggle({
  item,
  text,
  onUpdateItem,
  onRemoveAuthorItem,
}: {
  item: EditableReviewItem
  text: ReviewBoardProps['text']
  onUpdateItem: ReviewBoardProps['onUpdateItem']
  onRemoveAuthorItem: ReviewBoardProps['onRemoveAuthorItem']
}) {
  const apply = item.decision === 'apply'
  const includeLabel = item.goalId || item.severity === 'unknown'
    ? text('明确纳入修稿', 'Explicitly include in revision')
    : text('恢复', 'Restore')

  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn('text-[0.7rem]', SEVERITY_META[item.severity].colorClass)}>
        {apply
          ? text('已纳入本次修稿', 'Included in this revision')
          : text('已忽略，不会传给模型', 'Ignored; not sent to the model')}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onUpdateItem(item.id, { decision: apply ? 'ignore' : 'apply' })}
        >
          {apply ? <X size={12} /> : <Plus size={12} />}
          {apply ? text('忽略', 'Ignore') : includeLabel}
        </Button>
        {item.origin === 'author' && (
          <Button
            variant="ghost"
            size="sm"
            title={text('移除人工问题', 'Remove author issue')}
            onClick={() => onRemoveAuthorItem(item.id)}
          >
            <X size={12} />
            {text('移除', 'Remove')}
          </Button>
        )}
      </div>
    </div>
  )
}

function GoalBlock({
  goal,
  text,
}: {
  goal: ChapterGoalReview['items'][number]
  text: ReviewBoardProps['text']
}) {
  return (
    <div
      className="space-y-1 text-[0.7rem]"
      aria-label={text('本章目标与证据', 'Chapter goal and evidence')}
      style={{ color: 'var(--color-text-secondary)' }}
    >
      <p className="font-medium" style={{ color: 'var(--color-text)' }}>
        {text('本章目标：', 'Chapter goal: ')}
        {goal.text}
        {' — '}
        {chapterGoalStatusLabel(goal.status, text)}
      </p>
      {goal.evidence.map((evidence, index) => (
        <blockquote
          key={index}
          style={{
            borderLeft: '2px solid var(--color-border)',
            paddingLeft: 8,
            color: 'var(--color-text-muted)',
          }}
        >
          <Quote size={10} className="mr-1 inline opacity-60" />
          {evidence.quote}
        </blockquote>
      ))}
      {goal.evidence.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>
          {text('暂无可定位正文证据', 'No locatable chapter evidence')}
        </p>
      )}
    </div>
  )
}

function ReviewCard({
  item,
  goal,
  annotation,
  selected,
  editingChecklist,
  expanded,
  onToggleExpanded,
  text,
  onSelectItem,
  onUpdateItem,
  onRemoveAuthorItem,
}: {
  item: EditableReviewItem
  goal?: ChapterGoalReview['items'][number]
  annotation?: ReviewAnnotation
  selected: boolean
  editingChecklist: boolean
  expanded: boolean
  onToggleExpanded: () => void
  text: ReviewBoardProps['text']
  onSelectItem: ReviewBoardProps['onSelectItem']
  onUpdateItem: ReviewBoardProps['onUpdateItem']
  onRemoveAuthorItem: ReviewBoardProps['onRemoveAuthorItem']
}) {
  const meta = SEVERITY_META[item.severity]
  const copy = severityCopy(item.severity, text)
  const isPass = item.severity === 'pass'
  const isEmptyAuthorIssue = item.origin === 'author' && !item.description.trim()
  const editable = editingChecklist && !isPass

  const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('button, input, textarea, select, label, a')) return
    onSelectItem(item.id)
  }

  return (
    <div
      data-review-item={item.id}
      aria-current={selected ? 'true' : undefined}
      className={`rounded-md border text-xs leading-relaxed transition-colors${selected ? ' cursor-default' : ' cursor-pointer'}`}
      style={{
        borderColor: selected ? 'var(--color-accent)' : 'var(--color-border)',
        boxShadow: selected
          ? '0 0 0 1px var(--color-accent), var(--shadow-sm)'
          : 'var(--shadow-sm)',
        backgroundColor: 'var(--color-raised)',
        padding: '9px 11px 10px',
        marginBottom: 8,
      }}
      onClick={handleCardClick}
    >
      <div className="flex items-center gap-1.5">
        <SeverityIcon severity={item.severity} />
        <span className="truncate text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
          {item.category}
        </span>
        <span className={`flex-shrink-0 rounded-full border px-1.5 text-[0.65rem] ${meta.bgClass} ${meta.colorClass} ${meta.borderClass}`}>
          {copy.label}
        </span>
        <div className="ml-auto flex flex-shrink-0 items-center gap-0.5">
          {annotation && (
            <span
              style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--color-text-muted)', marginRight: 2 }}
              title={text(`正文批注 #${annotation.number}`, `Annotation #${annotation.number}`)}
            >
              #{annotation.number}
            </span>
          )}
          {annotation && (
            <button
              type="button"
              className="icon-btn"
              title={text('定位原文', 'Locate in draft')}
              onClick={event => {
                event.stopPropagation()
                onSelectItem(item.id)
              }}
              style={{ width: 18, height: 18, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)' }}
            >
              <LocateFixed size={11} />
            </button>
          )}
          {editable && (
            <button
              type="button"
              className="icon-btn"
              title={expanded ? text('收起编辑', 'Collapse editor') : text('编辑这一条', 'Edit finding')}
              onClick={event => {
                event.stopPropagation()
                onToggleExpanded()
              }}
              style={{
                width: 18,
                height: 18,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: expanded ? 'var(--color-accent)' : 'var(--color-text-muted)',
              }}
            >
              <Pencil size={11} />
            </button>
          )}
        </div>
      </div>

      {goal && (
        <div style={{ marginTop: 6 }}>
          <GoalBlock goal={goal} text={text} />
        </div>
      )}

      <div style={{ marginTop: 6 }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>{item.description}</span>
        {!editable && (
          <span className={`ml-2 text-[0.65rem] opacity-70 ${meta.colorClass}`}>
            [{copy.actionLabel}]
          </span>
        )}
      </div>

      {item.quote && (
        <div
          className="text-[0.7rem] italic"
          style={{
            marginTop: 6,
            borderLeft: `2px solid ${ANNOTATION_ACCENT[item.severity]}`,
            paddingLeft: 8,
            color: 'var(--color-text-muted)',
          }}
        >
          <Quote size={10} className="mr-1 inline opacity-60" />
          {item.quote}
        </div>
      )}

      {item.sourceChapter && (
        <p className="text-[0.7rem]" style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>
          {text(`来源：第${item.sourceChapter}章`, `Source: Chapter ${item.sourceChapter}`)}
        </p>
      )}

      {/* 编辑字段：默认收起，展开后修改分类/严重度/描述/原文锚点 */}
      {editable && (
        <div className="space-y-2" style={{ display: expanded ? 'block' : 'none', marginTop: 8 }}>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) 112px' }}>
            <Input
              aria-label={text('问题分类', 'Issue category')}
              value={item.category}
              onChange={event => onUpdateItem(item.id, { category: event.target.value })}
            />
            <NativeSelect
              aria-label={text('严重程度', 'Severity')}
              value={item.severity}
              onChange={event => {
                const severity = normalizeSeverity(event.target.value)
                onUpdateItem(item.id, {
                  severity,
                  ...(severity === 'unknown' ? { decision: 'ignore' } : {}),
                })
              }}
            >
              <option value="error">{text('严重问题', 'Critical issue')}</option>
              <option value="warning">{text('改进建议', 'Improvement')}</option>
              <option value="unknown">{text('待核实', 'Needs verification')}</option>
            </NativeSelect>
          </div>
          <Textarea
            className="min-h-[52px]"
            aria-label={text('审稿问题', 'Review issue')}
            aria-invalid={isEmptyAuthorIssue || undefined}
            aria-describedby={isEmptyAuthorIssue ? `author-issue-hint-${item.id}` : undefined}
            value={item.description}
            placeholder={item.origin === 'author'
              ? text('请填写需要纳入本次修稿的具体问题', 'Describe the specific issue to include in this revision')
              : undefined}
            onChange={event => onUpdateItem(item.id, { description: event.target.value })}
          />
          {isEmptyAuthorIssue && (
            <p id={`author-issue-hint-${item.id}`} className="text-[0.7rem]" style={{ color: 'var(--color-warning-text)' }}>
              {text('请填写具体问题，或移除这一项。', 'Describe the issue, or remove this item.')}
            </p>
          )}
          <Input
            aria-label={text('相关原文（可选）', 'Related text (optional)')}
            value={item.quote ?? ''}
            placeholder={text('相关原文（可选）', 'Related text (optional)')}
            onChange={event => onUpdateItem(item.id, { quote: event.target.value })}
          />
        </div>
      )}

      {editable && (
        <div style={{ marginTop: 8 }}>
          <DecisionToggle
            item={item}
            text={text}
            onUpdateItem={onUpdateItem}
            onRemoveAuthorItem={onRemoveAuthorItem}
          />
        </div>
      )}
    </div>
  )
}

export default function ReviewBoard({
  text,
  items,
  goalReview,
  summary,
  activeCategory,
  onCategoryChange,
  selectedItemId,
  onSelectItem,
  annotations,
  editingChecklist,
  authorGuidance,
  onAuthorGuidanceChange,
  onUpdateItem,
  onAddAuthorItem,
  onRemoveAuthorItem,
  onConfirmChecklist,
  confirming,
  canManageChecklist,
  checklistError,
  confirmed,
  onEditChecklist,
  onStartRevision,
  processing,
  reportText,
  hasConfirmedSnapshot,
  onDeleteReport,
  deletingReport,
}: ReviewBoardProps) {
  const [showLegend, setShowLegend] = useState(false)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set())
  const listRef = useRef<HTMLDivElement | null>(null)

  const toggleExpanded = (itemId: string) => {
    setExpandedItems(current => {
      const next = new Set(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const annotationByItemId = new Map(annotations.map(annotation => [annotation.itemId, annotation]))

  const sortedItems = [...items].sort((a, b) => reviewSortValue(a) - reviewSortValue(b))

  const categories = new Map<string, EditableReviewItem[]>()
  for (const item of items) {
    const list = categories.get(item.category) ?? []
    list.push(item)
    categories.set(item.category, list)
  }

  const visibleItems = activeCategory === OVERVIEW
    ? sortedItems
    : sortedItems.filter(item => item.category === activeCategory)

  const includedCount = items.filter(item => item.severity !== 'pass' && item.decision === 'apply').length
  const counts: Record<ReviewSeverity, number> = {
    error: items.filter(item => item.severity === 'error').length,
    warning: items.filter(item => item.severity === 'warning').length,
    unknown: items.filter(item => item.severity === 'unknown').length,
    pass: items.filter(item => item.severity === 'pass').length,
  }

  useEffect(() => {
    if (!selectedItemId) return
    const node = listRef.current?.querySelector<HTMLElement>(`[data-review-item="${selectedItemId}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [selectedItemId, activeCategory])

  const coverageCopy = goalReview
    ? goalReview.coverage === 'complete'
      ? text('本章目标已逐项检查；覆盖完整不代表全部完成。', 'Chapter goals checked individually; full coverage does not mean all goals are completed.')
      : goalReview.coverage === 'not_configured'
        ? text('本章未配置可检查的目标，未进行目标验收。', 'No chapter goals are configured; goal acceptance was not performed.')
        : text('本章目标检查不完整，尚有待核实项。', 'Chapter goal review is incomplete and needs verification.')
    : null

  const navRows: ReactNode[] = [
    (
      <button
        key={OVERVIEW}
        type="button"
        data-review-category={OVERVIEW}
        onClick={() => onCategoryChange(OVERVIEW)}
        className="flex h-[30px] w-full items-center gap-2 rounded px-2 text-left text-xs"
        style={{
          backgroundColor: activeCategory === OVERVIEW ? 'var(--color-active)' : 'transparent',
          color: activeCategory === OVERVIEW ? 'var(--color-text)' : 'var(--color-text-secondary)',
          boxShadow: activeCategory === OVERVIEW ? 'inset 2px 0 0 var(--color-accent)' : 'none',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <LayoutDashboard size={13} className="flex-shrink-0" />
        <span className="flex-1 truncate">{text('总览', 'Overview')}</span>
        <span className="text-[0.7rem]" style={{ color: 'var(--color-text-muted)' }}>{items.length}</span>
      </button>
    ),
  ]

  for (const [category, categoryItems] of categories) {
    const worst = worstSeverity(categoryItems)
    const active = activeCategory === category
    navRows.push(
      <button
        key={category}
        type="button"
        data-review-category={category}
        onClick={() => onCategoryChange(category)}
        className="flex h-[30px] w-full items-center gap-2 rounded px-2 text-left text-xs"
        style={{
          backgroundColor: active ? 'var(--color-active)' : 'transparent',
          color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
          boxShadow: active ? 'inset 2px 0 0 var(--color-accent)' : 'none',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <span
          className="flex-shrink-0 rounded-full"
          style={{ width: 7, height: 7, backgroundColor: ANNOTATION_ACCENT[worst] }}
        />
        <span className="flex-1 truncate">{category}</span>
        <span className="text-[0.7rem]" style={{ color: 'var(--color-text-muted)' }}>{categoryItems.length}</span>
      </button>,
    )
  }

  return (
    <aside
      className="flex h-full min-h-0 flex-col"
      style={{
        width: 'clamp(340px, 38%, 430px)',
        flexShrink: 0,
        borderLeft: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-panel)',
      }}
    >
      {/* 报告头 */}
      <div
        className="flex flex-shrink-0 items-center gap-1.5 px-3"
        style={{ height: 44, borderBottom: '1px solid var(--color-border)' }}
      >
        <ClipboardCheck size={13} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
          {text('审查报告', 'Review report')}
        </span>
        {confirmed && (
          <span
            className="inline-flex items-center gap-1 text-[0.7rem]"
            style={{ color: 'var(--color-success-text)' }}
          >
            <FileCheck2 size={12} />
            {text('已确认', 'Confirmed')}
          </span>
        )}
        <div className="flex-1" />
        {onDeleteReport && (
          <button
            type="button"
            title={text('删除审查报告', 'Delete review report')}
            disabled={deletingReport}
            onClick={onDeleteReport}
            className="icon-btn"
            style={{
              width: 22,
              height: 22,
              border: 'none',
              background: 'transparent',
              cursor: deletingReport ? 'not-allowed' : 'pointer',
              opacity: deletingReport ? 0.5 : 1,
              color: 'var(--color-text-muted)',
            }}
          >
            <Trash2 size={14} />
          </button>
        )}
        <button
          type="button"
          title={text('颜色说明', 'Color legend')}
          onClick={() => setShowLegend(value => !value)}
          className="icon-btn"
          style={{
            width: 22,
            height: 22,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: showLegend ? 'var(--color-accent)' : 'var(--color-text-muted)',
          }}
        >
          <HelpCircle size={14} />
        </button>
      </div>

      {/* 总览 + 分类导航 */}
      <div
        className="flex-shrink-0 px-2 py-1.5"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        {navRows}
      </div>

      {showLegend && (
        <div
          className="flex-shrink-0 border-b px-3 py-2 text-[0.7rem]"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-raised)' }}
        >
          <div className="mb-1 font-medium" style={{ color: 'var(--color-text)' }}>
            {text('颜色标记说明', 'Color legend')}
          </div>
          {SEVERITY_ORDER.map(severity => {
            const copy = severityCopy(severity, text)
            return (
              <div key={severity} className="flex items-center gap-2 py-0.5">
                <span className={`inline-flex items-center gap-1 rounded px-1.5 ${SEVERITY_META[severity].bgClass} ${SEVERITY_META[severity].colorClass}`}>
                  <SeverityIcon severity={severity} />
                  {copy.label}
                </span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{copy.actionLabel}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* 意见列表 */}
      <div className="flex-shrink-0 px-3 pb-1 pt-2">
        <span className="text-[0.7rem] font-semibold" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.04em' }}>
          {activeCategory === OVERVIEW ? text('全部审查意见', 'All review findings') : activeCategory}
          {' '}
          <span style={{ fontWeight: 400 }}>({visibleItems.length})</span>
        </span>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
        {activeCategory === OVERVIEW && (
          <div
            className="rounded-md border"
            style={{
              backgroundColor: 'var(--color-raised)',
              borderColor: 'var(--color-border)',
              padding: '10px 12px',
              marginBottom: 8,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            {summary && (
              <>
                <div className="text-[0.7rem] font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                  {text('总体评价', 'Overall assessment')}
                </div>
                <div className="mt-1 text-xs" style={{ color: 'var(--color-text)', lineHeight: 1.7 }}>
                  {summary}
                </div>
              </>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SEVERITY_ORDER.map(severity => {
                const copy = severityCopy(severity, text)
                return (
                  <span
                    key={severity}
                    className={`inline-flex items-center gap-1 rounded border px-1.5 text-[0.7rem] ${SEVERITY_META[severity].bgClass} ${SEVERITY_META[severity].colorClass} ${SEVERITY_META[severity].borderClass}`}
                    style={{ height: 20 }}
                  >
                    <SeverityIcon severity={severity} />
                    {counts[severity]} {copy.countLabel}
                  </span>
                )
              })}
            </div>
            {coverageCopy && (
              <p className="mt-2 text-[0.7rem]" style={{ color: 'var(--color-text-muted)' }}>
                {coverageCopy}
              </p>
            )}
          </div>
        )}

        {visibleItems.length === 0 ? (
          <div className="py-8 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {text('该分类暂无审查意见。', 'No findings in this category.')}
          </div>
        ) : (
          visibleItems.map(item => (
            <ReviewCard
              key={item.id}
              item={item}
              goal={item.goalId ? goalReview?.items.find(goal => goal.id === item.goalId) : undefined}
              annotation={annotationByItemId.get(item.id)}
              selected={selectedItemId === item.id}
              editingChecklist={editingChecklist}
              expanded={expandedItems.has(item.id) || (item.origin === 'author' && !item.description.trim())}
              onToggleExpanded={() => toggleExpanded(item.id)}
              text={text}
              onSelectItem={onSelectItem}
              onUpdateItem={onUpdateItem}
              onRemoveAuthorItem={onRemoveAuthorItem}
            />
          ))
        )}

        {/* 人工确认修稿清单 */}
        <section
          className="mt-1 rounded-md border"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-raised)', padding: '10px 12px' }}
        >
          <div className="flex items-center gap-1.5">
            <ListChecks size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
              {text('人工确认修稿清单', 'Human-confirmed revision checklist')}
            </span>
            {confirmed && !editingChecklist && (
              <span className="ml-auto inline-flex items-center gap-1 text-[0.7rem]" style={{ color: 'var(--color-success-text)' }}>
                <FileCheck2 size={12} />
                {text('已确认', 'Confirmed')}
              </span>
            )}
          </div>
          <p className="mt-1 text-[0.7rem]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            {editingChecklist
              ? text(
                '普通错误和建议默认纳入；本章目标与待核实项默认忽略，只有明确选择才纳入；“通过”仅展示。',
                'General issues and suggestions are included by default; chapter goals and unverified items require explicit inclusion; passed checks are display-only.',
              )
              : text(
                '已保存为新的不可变确认快照；原始 AI 审稿未被修改。',
                'Saved as a new immutable confirmation snapshot; the original AI review was not modified.',
              )}
          </p>

          {editingChecklist && (
            <div className="mt-2 space-y-2">
              <div>
                <Label htmlFor="review-author-guidance">
                  {text('总体修稿指导（可选）', 'Overall revision guidance (optional)')}
                </Label>
                <Textarea
                  id="review-author-guidance"
                  value={authorGuidance}
                  placeholder={text(
                    '例如：优先修复角色动机的前后不一致，保持本章克制的叙事节奏。',
                    'For example: prioritize inconsistent character motivation while keeping this chapter’s restrained pace.',
                  )}
                  onChange={event => onAuthorGuidanceChange(event.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={onAddAuthorItem}>
                <Plus size={13} />
                {text('新增人工问题', 'Add author issue')}
              </Button>
            </div>
          )}

          {!editingChecklist && authorGuidance && (
            <p className="mt-2 text-[0.7rem]" style={{ color: 'var(--color-text-secondary)' }}>
              {text('作者补充指导：', 'Author guidance: ')}
              {authorGuidance}
            </p>
          )}
        </section>

        {/* 原始文本折叠 */}
        <details className="mt-3 px-1">
          <summary className="cursor-pointer text-[0.7rem]" style={{ color: 'var(--color-text-muted)' }}>
            {hasConfirmedSnapshot
              ? text('查看此确认记录原文', 'View this confirmation record')
              : text('查看原始 AI 审稿文本', 'View original AI review text')}
          </summary>
          <pre
            className="mt-2 whitespace-pre-wrap rounded-md border p-2 text-[0.7rem] leading-5"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-sidebar)',
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {reportText}
          </pre>
        </details>
      </div>

      {/* 底部：勾选统计与修稿动作 */}
      <div
        className="flex-shrink-0"
        style={{
          borderTop: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-raised)',
          padding: '8px 12px',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[0.7rem]" style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
            {text('已勾选', 'Selected')}{' '}
            <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{includedCount}</span>{' '}
            {text('条意见', 'findings')}
          </span>
          <div className="flex-1" />
          {editingChecklist ? (
            canManageChecklist ? (
              <Button variant="ai" size="sm" onClick={onConfirmChecklist} disabled={confirming}>
                <FileCheck2 size={13} />
                {confirmed
                  ? text('重新确认审稿清单', 'Confirm updated checklist')
                  : text('确认审稿清单', 'Confirm review checklist')}
              </Button>
            ) : (
              <span className="text-[0.7rem]" style={{ color: 'var(--color-text-muted)' }}>
                {text('关联草稿后可确认清单。', 'Link this report to a draft to confirm the checklist.')}
              </span>
            )
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={onEditChecklist}>
                <Pencil size={13} />
                {text('编辑清单', 'Edit checklist')}
              </Button>
              <Button variant="ai" size="sm" onClick={onStartRevision} disabled={processing}>
                <Sparkles size={13} />
                {text('按确认意见修稿', 'Revise from confirmed checklist')}
              </Button>
            </>
          )}
        </div>
        {checklistError && (
          <p role="alert" className="mt-2 text-xs" style={{ color: 'var(--color-error-text)' }}>
            {checklistError}
          </p>
        )}
      </div>
    </aside>
  )
}
