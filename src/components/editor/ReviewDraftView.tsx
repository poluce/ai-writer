/**
 * 审稿报告 · 左侧「原文批注」视图。
 *
 * 只负责把草稿原文渲染成可读文档，并在命中 `review-annotations` 的位置画批注锚点。
 * 数据与状态全部由 ReviewReport 容器注入，纯展示组件。
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { ClipboardCheck, FileText, Loader2 } from 'lucide-react'

import { splitInlineMarkdown, type ReviewAnnotation, type ReviewBlock } from './review-annotations'
import type { ReviewIssue } from './review-report-shared'

export type ReviewDraftLoadState = 'idle' | 'loading' | 'ready' | 'error'

export interface ReviewDraftViewProps {
  text: (zhCNText: string, enUSText: string) => string
  chapterNumber?: number
  chapterTitle?: string
  draftVersion?: number
  characterCount: number
  blocks: ReviewBlock[]
  annotations: ReviewAnnotation[]
  activeCategory: string | null
  selectedItemId: string | null
  loadState: ReviewDraftLoadState
  /** 递增的定位请求：blockIndex 变化或 nonce 增加时滚动到对应段落。 */
  scrollTarget: { blockIndex: number; nonce: number } | null
  onSelectAnnotation: (itemId: string) => void
}

const CHIP_COLOR: Record<ReviewIssue['severity'], string> = {
  error: 'var(--color-error-text)',
  warning: 'var(--color-warning-text)',
  unknown: 'var(--color-text-secondary)',
  pass: 'var(--color-success-text)',
}

const MARK_BACKGROUND: Record<ReviewIssue['severity'], string> = {
  error: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
  warning: 'color-mix(in srgb, var(--color-warning) 16%, transparent)',
  unknown: 'color-mix(in srgb, var(--color-info) 12%, transparent)',
  pass: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
}

const MARK_UNDERLINE: Record<ReviewIssue['severity'], string> = {
  error: 'var(--color-error)',
  warning: 'var(--color-warning)',
  unknown: 'var(--color-info)',
  pass: 'var(--color-success)',
}

const INLINE_CODE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.88em',
  padding: '1px 4px',
  borderRadius: 3,
  backgroundColor: 'var(--color-hover)',
}

const DIVIDER_STYLE: CSSProperties = {
  width: 1,
  height: 12,
  backgroundColor: 'var(--color-border)',
  flexShrink: 0,
}

function InlineText({ value }: { value: string }) {
  const tokens = splitInlineMarkdown(value)
  if (tokens.length === 0) return null
  return (
    <>
      {tokens.map((token, index) => {
        if (token.kind === 'bold') {
          return <strong key={index} style={{ fontWeight: 600 }}>{token.text}</strong>
        }
        if (token.kind === 'code') {
          return <code key={index} style={INLINE_CODE_STYLE}>{token.text}</code>
        }
        return <span key={index}>{token.text}</span>
      })}
    </>
  )
}

export default function ReviewDraftView({
  text,
  chapterNumber,
  chapterTitle,
  draftVersion,
  characterCount,
  blocks,
  annotations,
  activeCategory,
  selectedItemId,
  loadState,
  scrollTarget,
  onSelectAnnotation,
}: ReviewDraftViewProps) {
  const blockRefs = useRef(new Map<number, HTMLDivElement>())

  useEffect(() => {
    if (!scrollTarget) return
    const node = blockRefs.current.get(scrollTarget.blockIndex)
    node?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [scrollTarget])

  const chapterLabel = chapterNumber
    ? text(`第${chapterNumber}章`, `Chapter ${chapterNumber}`)
    : text('原文草稿', 'Draft')
  const title = chapterTitle ? `${chapterLabel} ${chapterTitle}` : chapterLabel

  const annotationsByBlock = new Map<number, ReviewAnnotation[]>()
  for (const annotation of annotations) {
    const list = annotationsByBlock.get(annotation.blockIndex) ?? []
    list.push(annotation)
    annotationsByBlock.set(annotation.blockIndex, list)
  }

  const renderBlockContent = (block: ReviewBlock): ReactNode => {
    const blockAnnotations = annotationsByBlock.get(block.index) ?? []
    if (blockAnnotations.length === 0) {
      return <InlineText value={block.text} />
    }

    const segments: ReactNode[] = []
    let cursor = 0
    for (const annotation of blockAnnotations) {
      if (annotation.from < cursor) continue
      if (annotation.from > cursor) {
        segments.push(
          <InlineText key={`plain-${block.index}-${cursor}`} value={block.text.slice(cursor, annotation.from)} />,
        )
      }
      const dimmed = activeCategory !== null && annotation.category !== activeCategory
      const selectedOutline = selectedItemId === annotation.itemId
        ? ', 0 0 0 2px color-mix(in srgb, var(--color-accent) 45%, transparent)'
        : ''
      segments.push(
        <span
          key={`wrap-${annotation.itemId}`}
          data-annotation-item={annotation.itemId}
          data-annotation-number={annotation.number}
          className="cursor-pointer"
          onClick={() => onSelectAnnotation(annotation.itemId)}
          style={{
            backgroundColor: MARK_BACKGROUND[annotation.severity],
            boxShadow: `inset 0 -2px 0 ${MARK_UNDERLINE[annotation.severity]}${selectedOutline}`,
            borderRadius: 2,
            opacity: dimmed ? 0.35 : 1,
            transition: 'opacity 120ms ease',
          }}
          title={text(
            `批注 ${annotation.number} · ${annotation.category}`,
            `Annotation ${annotation.number} · ${annotation.category}`,
          )}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 15,
              height: 15,
              marginRight: 3,
              borderRadius: '50%',
              backgroundColor: CHIP_COLOR[annotation.severity],
              color: 'var(--color-bg)',
              fontSize: 9.5,
              fontWeight: 700,
              lineHeight: 1,
              verticalAlign: '2px',
              userSelect: 'none',
            }}
          >
            {annotation.number}
          </span>
          <InlineText value={block.text.slice(annotation.from, annotation.to)} />
        </span>,
      )
      cursor = annotation.to
    }
    if (cursor < block.text.length) {
      segments.push(<InlineText key={`tail-${block.index}`} value={block.text.slice(cursor)} />)
    }
    return <>{segments}</>
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <header
        className="flex flex-shrink-0 items-center gap-2 px-4"
        style={{
          height: 44,
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-editor-bg)',
        }}
      >
        <FileText size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        <span
          className="truncate text-[0.8rem] font-semibold"
          style={{ color: 'var(--color-text)', maxWidth: 320 }}
          title={title}
        >
          {title}
        </span>
        {loadState === 'ready' && (
          <>
            <span style={DIVIDER_STYLE} />
            <span className="text-[0.7rem]" style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
              {draftVersion ? text(`草稿_v${draftVersion}`, `Draft_v${draftVersion}`) : text('草稿', 'Draft')}
            </span>
            <span style={DIVIDER_STYLE} />
            <span className="text-[0.7rem]" style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
              {characterCount.toLocaleString()} {text('字', 'chars')}
            </span>
          </>
        )}
        <div className="flex-1" />
        {annotations.length > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 text-[0.7rem]"
            style={{
              height: 22,
              color: 'var(--color-accent)',
              backgroundColor: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)',
              whiteSpace: 'nowrap',
            }}
          >
            <ClipboardCheck size={11} />
            {text(`${annotations.length} 处批注`, `${annotations.length} annotations`)}
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto" style={{ padding: '26px 34px 140px' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          {loadState === 'loading' && (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <Loader2 size={13} className="animate-spin" />
              {text('正在读取草稿正文…', 'Loading draft text…')}
            </div>
          )}

          {loadState === 'idle' && (
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {text('此审稿报告未关联可读取的草稿正文，仅可查看右侧意见清单。', 'This review is not linked to readable draft text; only the review checklist is available.')}
            </div>
          )}

          {loadState === 'error' && (
            <div className="text-xs" style={{ color: 'var(--color-warning-text)' }}>
              {text('草稿正文读取失败，原文批注暂不可用。', 'The draft text could not be loaded, so inline annotations are unavailable.')}
            </div>
          )}

          {loadState === 'ready' && blocks.length === 0 && (
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {text('草稿正文为空。', 'The draft is empty.')}
            </div>
          )}

          {loadState === 'ready' && blocks.map(block => (
            <div
              key={`${block.kind}-${block.index}`}
              className="flex"
              style={{ gap: 10, marginBottom: block.kind === 'code' ? 0 : 5 }}
              ref={node => {
                if (node) blockRefs.current.set(block.index, node)
                else blockRefs.current.delete(block.index)
              }}
            >
              <span
                style={{
                  width: 26,
                  flexShrink: 0,
                  paddingTop: block.kind === 'code' ? 5 : 7,
                  textAlign: 'right',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  color: 'var(--color-text-muted)',
                  opacity: 0.5,
                  userSelect: 'none',
                }}
              >
                {block.index + 1}
              </span>
              {block.kind === 'code' ? (
                <pre
                  style={{
                    flex: 1,
                    minWidth: 0,
                    margin: 0,
                    padding: '2px 8px',
                    borderRadius: 4,
                    backgroundColor: 'var(--color-panel)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12.5,
                    lineHeight: 1.75,
                    color: 'var(--color-text)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {renderBlockContent(block)}
                </pre>
              ) : (
                <p
                  style={{
                    flex: 1,
                    minWidth: 0,
                    margin: 0,
                    fontFamily: 'var(--font-writing)',
                    fontSize: 15.5,
                    lineHeight: 1.9,
                    color: 'var(--color-text)',
                    letterSpacing: '0.01em',
                  }}
                >
                  {renderBlockContent(block)}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
