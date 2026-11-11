/**
 * 章节蓝图单章条目 — 支持细纲阅读、紧凑提纲与原地编辑三种呈现状态。
 * 从 ChapterCardEditor 拆出的受控展示与编辑组件。
 */

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, MoreHorizontal, PenLine, Plus, Trash2, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { MenuItem } from '../ui/MenuItem'
import { NativeSelect } from '../ui/NativeSelect'
import { cn } from '../../lib/utils'
import { useLocaleStore } from '../../stores/locale-store'
import type { ChapterBlueprint } from '../../services/workflows/directory-workflow'
import type { EditableChapterBlueprintField } from '../../stores/chapter-card-draft-ledger'
import { roleLabel, roleOptionsFor, roleToneClass } from './chapter-card-shared'

export interface ChapterCardFormProps {
  blueprint: ChapterBlueprint
  mode: 'read' | 'compact' | 'edit'
  isNextWritable: boolean
  writeButton?: ReactNode
  characterSuggestions?: readonly string[]
  onStartEdit: () => void
  onDoneEdit: () => void
  onUpdateField: <K extends EditableChapterBlueprintField>(
    chapterNumber: number,
    field: K,
    value: ChapterBlueprint[K],
  ) => void
  onDeleteChapter: (blueprint: ChapterBlueprint) => void
}

function LedgerAutoGrowTextarea({
  value,
  onChange,
  placeholder,
  label,
  minHeight = 44,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  minHeight?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const syncHeight = () => {
    const element = ref.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.max(element.scrollHeight, minHeight)}px`
  }

  useLayoutEffect(() => {
    syncHeight()
  })

  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(syncHeight)
    observer.observe(element)
    return () => observer.disconnect()
  })

  return (
    <textarea
      ref={ref}
      aria-label={label}
      className="chapter-ledger-textarea"
      value={value}
      placeholder={placeholder}
      rows={1}
      style={{ minHeight }}
      onChange={event => onChange(event.target.value)}
    />
  )
}

function ChapterCardEditPanel({
  blueprint,
  characterSuggestions,
  onUpdateField,
}: {
  blueprint: ChapterBlueprint
  characterSuggestions: readonly string[]
  onUpdateField: ChapterCardFormProps['onUpdateField']
}) {
  const text = useLocaleStore(s => s.text)
  const locale = useLocaleStore(s => s.locale)
  const [addingCast, setAddingCast] = useState(false)
  const [castDraft, setCastDraft] = useState('')
  const [showOptionalNotes, setShowOptionalNotes] = useState(false)
  const castInputRef = useRef<HTMLInputElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const focusBlankOnMountRef = useRef(
    !blueprint.title.trim() && !blueprint.purpose.trim() && !blueprint.keyEvents.trim(),
  )

  useEffect(() => {
    if (focusBlankOnMountRef.current) {
      titleInputRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    if (addingCast) castInputRef.current?.focus()
  }, [addingCast])

  const hasNotesArchive = Boolean(blueprint.notes?.trim() || blueprint.notesUpdatedAt)
  const roleOptions = roleOptionsFor(blueprint.role)
  const availableSuggestions = characterSuggestions.filter(
    name => name.trim() && !blueprint.characters.includes(name),
  )

  const commitCastName = (rawName: string) => {
    const trimmed = rawName.trim()
    if (!trimmed) return
    if (!blueprint.characters.includes(trimmed)) {
      onUpdateField(blueprint.chapterNumber, 'characters', [...blueprint.characters, trimmed])
    }
    setCastDraft('')
  }

  const handleCastInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === '、') {
      event.preventDefault()
      commitCastName(castDraft)
    } else if (event.key === 'Escape') {
      setAddingCast(false)
      setCastDraft('')
    }
  }

  const removeCharacter = (index: number) => {
    onUpdateField(
      blueprint.chapterNumber,
      'characters',
      blueprint.characters.filter((_, i) => i !== index),
    )
  }

  return (
    <div className="chapter-ledger-edit-panel">
      <div className="chapter-ledger-edit-grid">
        <div>
          <div className="chapter-ledger-field-head">
            <label className="chapter-ledger-field-label" htmlFor={`bp-title-${blueprint.chapterNumber}`}>
              {text('章节标题', 'Chapter title')}
            </label>
          </div>
          <Input
            ref={titleInputRef}
            id={`bp-title-${blueprint.chapterNumber}`}
            value={blueprint.title}
            onChange={e => onUpdateField(blueprint.chapterNumber, 'title', e.target.value)}
            placeholder={text('引人入胜的章节标题', 'A compelling chapter title')}
          />
        </div>

        <div>
          <div className="chapter-ledger-field-head">
            <label className="chapter-ledger-field-label" htmlFor={`bp-role-${blueprint.chapterNumber}`}>
              {text('章节定位', 'Chapter role')}
            </label>
          </div>
          <NativeSelect
            id={`bp-role-${blueprint.chapterNumber}`}
            value={blueprint.role}
            onChange={e => onUpdateField(blueprint.chapterNumber, 'role', e.target.value)}
          >
            {roleOptions.map(role => (
              <option key={role} value={role}>
                {roleLabel(role, text)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div>
        <div className="chapter-ledger-field-head">
          <span className="chapter-ledger-field-label">{text('出场角色', 'Characters')}</span>
        </div>
        <div className="chapter-ledger-cast-list">
          {blueprint.characters.map((name, index) => (
            <span key={`${name}-${index}`} className="chapter-ledger-cast-chip">
              <span>{name}</span>
              <button
                type="button"
                className="chapter-ledger-cast-remove"
                onClick={() => removeCharacter(index)}
                aria-label={text(`移除 ${name}`, `Remove ${name}`)}
              >
                <X size={11} />
              </button>
            </span>
          ))}

          {addingCast ? (
            <div className="inline-flex items-center gap-1.5">
              <Input
                ref={castInputRef}
                value={castDraft}
                onChange={e => setCastDraft(e.target.value)}
                onKeyDown={handleCastInputKeyDown}
                placeholder={text('输入角色名后回车', 'Character name, press Enter')}
                className="h-6 w-36 text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => commitCastName(castDraft)}
              >
                {text('添加', 'Add')}
              </Button>
              <button
                type="button"
                className="chapter-ledger-action"
                style={{ height: 24, padding: '0 6px' }}
                onClick={() => {
                  setAddingCast(false)
                  setCastDraft('')
                }}
              >
                {text('收起', 'Close')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="chapter-ledger-cast-add"
              onClick={() => setAddingCast(true)}
            >
              <Plus size={11} />
              {text('添加角色', 'Add character')}
            </button>
          )}
        </div>

        {addingCast && availableSuggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="chapter-ledger-field-hint">{text('已有角色：', 'Roster:')}</span>
            {availableSuggestions.slice(0, 8).map(name => (
              <button
                key={name}
                type="button"
                className="chapter-ledger-chip"
                style={{ height: 22, padding: '0 8px', fontSize: 11 }}
                onClick={() => commitCastName(name)}
              >
                + {name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="chapter-ledger-field-head">
          <span className="chapter-ledger-field-label">{text('主角目标', 'Protagonist goal')}</span>
        </div>
        <LedgerAutoGrowTextarea
          label={text('主角目标', 'Protagonist goal')}
          value={blueprint.purpose}
          onChange={value => onUpdateField(blueprint.chapterNumber, 'purpose', value)}
          placeholder={text('本章主角最迫切要解决的一件事', 'The primary objective the protagonist pursues in this chapter')}
        />
      </div>

      <div>
        <div className="chapter-ledger-field-head">
          <span className="chapter-ledger-field-label">{text('实质冲突与转折', 'Core conflict and turning point')}</span>
        </div>
        <LedgerAutoGrowTextarea
          label={text('实质冲突与转折', 'Core conflict and turning point')}
          value={blueprint.keyEvents}
          minHeight={92}
          onChange={value => onUpdateField(blueprint.chapterNumber, 'keyEvents', value)}
          placeholder={text('按场景推进记录关键行动、阻碍与反转', 'Record key scene beats, obstacles, and reversals')}
        />
      </div>

      <div>
        <div className="chapter-ledger-field-head">
          <span className="chapter-ledger-field-label">{text('末尾悬念钩子', 'Ending suspense hook')}</span>
        </div>
        <LedgerAutoGrowTextarea
          label={text('末尾悬念钩子', 'Ending suspense hook')}
          value={blueprint.suspenseHook}
          onChange={value => onUpdateField(blueprint.chapterNumber, 'suspenseHook', value)}
          placeholder={text('一句话点明结尾留下的悬念', 'State the closing hook in one sentence')}
        />
      </div>

      <div>
        <div className="chapter-ledger-field-head">
          <span className="chapter-ledger-field-label">{text('作者微操指导', 'Author guidance')}</span>
          <span className="chapter-ledger-field-hint">{text('写稿时高优注入', 'Highest priority in drafting')}</span>
        </div>
        <LedgerAutoGrowTextarea
          label={text('作者微操指导', 'Author guidance')}
          value={blueprint.userGuidance}
          minHeight={56}
          onChange={value => onUpdateField(blueprint.chapterNumber, 'userGuidance', value)}
          placeholder={text('留空则按上方蓝图自然写作', 'Leave blank to follow the blueprint above')}
        />
      </div>

      {(hasNotesArchive || showOptionalNotes) ? (
        <div>
          <div className="chapter-ledger-field-head">
            <span className="chapter-ledger-field-label">{text('章节要点', 'Chapter notes')}</span>
            <span className="chapter-ledger-field-hint">
              {blueprint.notesUpdatedAt
                ? text(
                  `定稿归档 · ${new Date(blueprint.notesUpdatedAt).toLocaleDateString(locale)}`,
                  `Archived · ${new Date(blueprint.notesUpdatedAt).toLocaleDateString(locale)}`,
                )
                : text('定稿后自动生成', 'Generated after finalization')}
            </span>
          </div>
          <LedgerAutoGrowTextarea
            label={text('章节要点', 'Chapter notes')}
            value={blueprint.notes || ''}
            minHeight={64}
            onChange={value => onUpdateField(blueprint.chapterNumber, 'notes', value)}
            placeholder={text('事件进展、角色变化与伏笔回收摘要', 'Summary of plot progress, character shifts, and payoffs')}
          />
        </div>
      ) : (
        <div>
          <button
            type="button"
            className="chapter-ledger-action"
            style={{ paddingLeft: 0 }}
            onClick={() => setShowOptionalNotes(true)}
          >
            <Plus size={12} />
            {text('补充定稿要点', 'Add chapter notes')}
          </button>
        </div>
      )}
    </div>
  )
}

export function ChapterCardForm({
  blueprint,
  mode,
  isNextWritable,
  writeButton,
  characterSuggestions = [],
  onStartEdit,
  onDoneEdit,
  onUpdateField,
  onDeleteChapter,
}: ChapterCardFormProps) {
  const text = useLocaleStore(s => s.text)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const beats = blueprint.keyEvents
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  const hasNotesArchive = Boolean(blueprint.notes?.trim() || blueprint.notesUpdatedAt)
  const hasProseContent = Boolean(
    blueprint.purpose.trim()
    || beats.length > 0
    || blueprint.suspenseHook.trim()
    || blueprint.userGuidance.trim()
    || hasNotesArchive,
  )

  if (mode === 'compact') {
    const compactSummary = beats.join(' ') || blueprint.purpose.trim()
    return (
      <article
        id={`chapter-ledger-entry-${blueprint.chapterNumber}`}
        className="chapter-ledger-compact"
        onClick={onStartEdit}
      >
        <span className="chapter-ledger-entry-num">
          {String(blueprint.chapterNumber).padStart(2, '0')}
        </span>
        <div className="chapter-ledger-compact-main">
          <div className="chapter-ledger-compact-top">
            <span className="chapter-ledger-compact-title">
              {blueprint.title || text('未命名', 'Untitled')}
            </span>
            <span className={cn('chapter-ledger-role', roleToneClass(blueprint.role))}>
              {roleLabel(blueprint.role, text)}
            </span>
            {isNextWritable && (
              <span className="chapter-ledger-writable-tag">
                {text('待写', 'Next')}
              </span>
            )}
            {blueprint.userGuidance.trim() && (
              <span className="chapter-ledger-guidance-tag">
                {text('有微操', 'Guidance')}
              </span>
            )}
          </div>
          {compactSummary && (
            <p className="chapter-ledger-compact-summary">{compactSummary}</p>
          )}
          {blueprint.suspenseHook.trim() && (
            <p className="chapter-ledger-compact-hook">
              {text(`钩子：${blueprint.suspenseHook}`, `Hook: ${blueprint.suspenseHook}`)}
            </p>
          )}
        </div>
        <div
          className="chapter-ledger-entry-actions"
          onClick={event => event.stopPropagation()}
        >
          {writeButton}
          <button
            type="button"
            className="chapter-ledger-action"
            onClick={onStartEdit}
          >
            <PenLine size={12} />
            {text('编辑', 'Edit')}
          </button>
        </div>
      </article>
    )
  }

  const isEditing = mode === 'edit'

  return (
    <article
      id={`chapter-ledger-entry-${blueprint.chapterNumber}`}
      className="chapter-ledger-entry"
    >
      <div className="chapter-ledger-entry-head">
        <div className="chapter-ledger-entry-title-group">
          <span className="chapter-ledger-entry-num">
            {text(`第 ${blueprint.chapterNumber} 章`, `Ch. ${blueprint.chapterNumber}`)}
          </span>
          <h3 className="chapter-ledger-entry-title">
            {blueprint.title || text('未命名', 'Untitled')}
          </h3>
          <span className={cn('chapter-ledger-role', roleToneClass(blueprint.role))}>
            {roleLabel(blueprint.role, text)}
          </span>
        </div>

        <div className="chapter-ledger-entry-actions">
          {writeButton}
          {isEditing ? (
            <Button variant="outline" size="sm" onClick={onDoneEdit}>
              <Check size={12} />
              {text('完成', 'Done')}
            </Button>
          ) : (
            <button
              type="button"
              className="chapter-ledger-action"
              onClick={onStartEdit}
            >
              <PenLine size={12} />
              {text('编辑', 'Edit')}
            </button>
          )}

          <div className="relative" ref={menuWrapRef}>
            <button
              type="button"
              className="chapter-ledger-action"
              style={{ padding: '0 6px' }}
              onClick={() => setMenuOpen(open => !open)}
              aria-expanded={menuOpen}
              aria-label={text('章节更多操作', 'More chapter actions')}
              title={text('更多操作', 'More actions')}
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div className="chapter-ledger-popover" role="menu">
                <MenuItem
                  label={text('删除此章', 'Delete chapter')}
                  icon={<Trash2 size={13} />}
                  danger
                  onClick={() => {
                    setMenuOpen(false)
                    onDeleteChapter(blueprint)
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {isEditing ? (
        <ChapterCardEditPanel
          blueprint={blueprint}
          characterSuggestions={characterSuggestions}
          onUpdateField={onUpdateField}
        />
      ) : (
        <>
          <div className="chapter-ledger-meta-line">
            <span>
              {text('出场：', 'Cast: ')}
              {blueprint.characters.length > 0
                ? blueprint.characters.join(' · ')
                : text('未指定', 'None')}
            </span>
          </div>

          {hasProseContent ? (
            <div
              className="chapter-ledger-prose"
              onDoubleClick={onStartEdit}
              title={text('双击进入编辑', 'Double-click to edit')}
            >
              {blueprint.purpose.trim() && (
                <p className="chapter-ledger-goal">{blueprint.purpose}</p>
              )}

              {beats.length > 0 && (
                <div className="chapter-ledger-beats">
                  {beats.map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
                </div>
              )}

              {blueprint.suspenseHook.trim() && (
                <div className="chapter-ledger-hook">
                  <strong>{text('末尾钩子', 'Ending hook')}</strong>
                  {blueprint.suspenseHook}
                </div>
              )}

              {blueprint.userGuidance.trim() && (
                <div className="chapter-ledger-guidance">
                  <strong>{text('作者微操', 'Author guidance')}</strong>
                  {blueprint.userGuidance}
                </div>
              )}

              {blueprint.notes?.trim() && (
                <p className="chapter-ledger-notes">
                  {text(`定稿要点：${blueprint.notes}`, `Notes: ${blueprint.notes}`)}
                </p>
              )}
            </div>
          ) : (
            <p className="chapter-ledger-empty-prose">
              {text('尚未填写本章细纲，点击右上角「编辑」补充。', 'No chapter details yet. Select Edit to write.')}
            </p>
          )}
        </>
      )}
    </article>
  )
}
