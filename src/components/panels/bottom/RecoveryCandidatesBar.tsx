import { Copy, Pencil, Trash2 } from 'lucide-react'
import type { Locale } from '../../../i18n/types'
import type { RecoveryCandidate } from '../../../shared/recovery-candidate'

export function RecoveryCandidatesBar({
  candidates,
  error,
  locale,
  onCopy,
  onContinue,
  onDiscard,
}: {
  candidates: RecoveryCandidate[]
  error: string
  locale: Locale
  onCopy: (candidate: RecoveryCandidate) => void
  onContinue: (candidate: RecoveryCandidate) => void
  onDiscard: (candidate: RecoveryCandidate) => void
}) {
  if (candidates.length === 0 && !error) return null
  const text = (zh: string, en: string) => locale === 'en-US' ? en : zh

  return (
    <section
      className="max-h-[45%] overflow-y-auto border-b px-3 py-2 flex-shrink-0"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div className="mb-1.5 text-xs font-medium" style={{ color: 'var(--color-text)' }}>
        {text('恢复候选', 'Recovery candidates')}
      </div>
      {error && (
        <p role="alert" className="mb-2 text-xs" style={{ color: 'var(--color-error-text)' }}>
          {error}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        {candidates.map(candidate => (
          <article
            key={candidate.candidateId}
            className="rounded-md border p-2 text-xs"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium truncate" style={{ color: 'var(--color-text)' }}>
                {candidate.replacesCandidateId
                  ? text(
                      `替代候选 · 第${candidate.chapterNumber}章 ${candidate.chapterTitle}`,
                      `Replacement candidate · Chapter ${candidate.chapterNumber} ${candidate.chapterTitle}`,
                    )
                  : text(
                      `原始候选 · 第${candidate.chapterNumber}章 ${candidate.chapterTitle}`,
                      `Original candidate · Chapter ${candidate.chapterNumber} ${candidate.chapterTitle}`,
                    )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  className="icon-btn px-2 gap-1"
                  onClick={() => onCopy(candidate)}
                >
                  <Copy size={12} />
                  {text('复制', 'Copy')}
                </button>
                <button
                  type="button"
                  className="icon-btn px-2 gap-1"
                  disabled={!candidate.sourceCurrent}
                  onClick={() => onContinue(candidate)}
                >
                  <Pencil size={12} />
                  {text('继续编辑', 'Continue editing')}
                </button>
                <button
                  type="button"
                  className="icon-btn px-2 gap-1"
                  onClick={() => onDiscard(candidate)}
                >
                  <Trash2 size={12} />
                  {text('放弃', 'Discard')}
                </button>
              </div>
            </div>
            {!candidate.sourceCurrent && (
              <p className="mt-1" style={{ color: 'var(--color-warning-text)' }}>
                {text(
                  '源章节已变化；可复制或放弃，但不能直接继续。',
                  'The source chapter changed. You can copy or discard this candidate, but cannot continue it directly.',
                )}
              </p>
            )}
            <div
              className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {candidate.visibleText}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
