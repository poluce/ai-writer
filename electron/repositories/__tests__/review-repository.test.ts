import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getProjectDb } from '../../database'
import { ContentRepository } from '../content-repository'
import { ReviewRepository } from '../review-repository'

vi.mock('../../database', () => ({ getProjectDb: vi.fn() }))

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')
let db: BetterSqlite3.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      body TEXT NOT NULL
    );
    CREATE TABLE drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_number INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'draft',
      source TEXT NOT NULL DEFAULT 'write',
      content_id INTEGER NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE RESTRICT
    );
    CREATE TABLE reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_draft_id INTEGER NOT NULL,
      review_index INTEGER NOT NULL,
      source_draft_chapter_number INTEGER,
      source_draft_version INTEGER,
      source_draft_status TEXT,
      source_content TEXT,
      kind TEXT NOT NULL DEFAULT 'review',
      source_review_id INTEGER,
      content_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (base_draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
      FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE RESTRICT,
      UNIQUE(base_draft_id, review_index)
    );
    CREATE TABLE revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_draft_id INTEGER NOT NULL,
      revision_index INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      review_source_id INTEGER,
      content_id INTEGER NOT NULL
    );
  `)
  vi.mocked(getProjectDb).mockReturnValue(db)
  const draftContentId = ContentRepository.create('原稿')
  db.prepare('INSERT INTO drafts (content_id) VALUES (?)').run(draftContentId)
})

afterEach(() => db.close())

describe('ReviewRepository.create', () => {
  it('rejects creating a new review without a frozen source', () => {
    expect(() => ReviewRepository.create({
      baseDraftId: 1,
      content: '{"summary":"unbound"}',
    })).toThrow('SOURCE_DRAFT_CHANGED')
    expect(ReviewRepository.listByDraft(1)).toEqual([])
  })

  it('atomically rejects stale frozen source content without allocating a review or content', () => {
    const contentsBefore = db.prepare('SELECT COUNT(*) AS count FROM contents').get() as { count: number }

    expect(() => ReviewRepository.create({
      baseDraftId: 1,
      content: '{"summary":"stale"}',
      expectedSource: {
        id: 1,
        chapterNumber: 1,
        version: 1,
        status: 'draft',
        content: '过期原稿',
      },
    })).toThrow('SOURCE_DRAFT_CHANGED')

    expect(ReviewRepository.listByDraft(1)).toEqual([])
    expect(db.prepare('SELECT COUNT(*) AS count FROM contents').get())
      .toEqual(contentsBefore)
  })

  it('validates the frozen source and allocates the review index in one transaction', () => {
    const first = ReviewRepository.create({
      baseDraftId: 1,
      content: '{"summary":"first"}',
      expectedSource: {
        id: 1,
        chapterNumber: 1,
        version: 1,
        status: 'draft',
        content: '原稿',
      },
    })
    const second = ReviewRepository.create({
      baseDraftId: 1,
      content: '{"summary":"second"}',
      expectedSource: {
        id: 1,
        chapterNumber: 1,
        version: 1,
        status: 'draft',
        content: '原稿',
      },
    })

    expect(ReviewRepository.listByDraft(1).map(review => [review.id, review.reviewIndex]))
      .toEqual([[first.id, 1], [second.id, 2]])
    expect([first.reviewIndex, second.reviewIndex]).toEqual([1, 2])
    expect(ReviewRepository.getFull(first.id)?.sourceDraft).toEqual({
      id: 1,
      chapterNumber: 1,
      version: 1,
      status: 'draft',
      content: '原稿',
    })
  })

  it('keeps a legacy review readable but marks its generation source as unavailable', () => {
    const contentId = ContentRepository.create('{"summary":"legacy"}')
    const legacy = db.prepare(`
      INSERT INTO reviews (base_draft_id, review_index, content_id) VALUES (1, 1, ?)
    `).run(contentId)

    expect(ReviewRepository.getFull(Number(legacy.lastInsertRowid))).toMatchObject({
      content: '{"summary":"legacy"}',
      sourceDraft: null,
    })
  })
})

describe('ReviewRepository report / confirmation lifecycle', () => {
  const frozenSource = {
    id: 1,
    chapterNumber: 1,
    version: 1,
    status: 'draft' as const,
    content: '原稿',
  }

  function createReport(content = '{"summary":"report"}'): { id: number; reviewIndex: number } {
    return ReviewRepository.create({
      baseDraftId: 1,
      content,
      expectedSource: frozenSource,
    })
  }

  it('keeps human confirmation snapshots out of the report list', () => {
    const report = createReport()
    const confirmation = ReviewRepository.create({
      baseDraftId: 1,
      content: JSON.stringify({ kind: 'human-confirmed-review', schemaVersion: 1, sourceReviewId: report.id }),
      expectedSource: frozenSource,
      kind: 'confirmation',
      sourceReviewId: report.id,
    })

    expect(ReviewRepository.getMeta(confirmation.id)).toMatchObject({
      kind: 'confirmation',
      sourceReviewId: report.id,
    })
    expect(ReviewRepository.listByDraft(1).map(row => row.kind)).toEqual(['review', 'confirmation'])
    expect(ReviewRepository.listSummaries({ chapterNumber: 1 }).map(row => row.id)).toEqual([report.id])
  })

  it('rejects a confirmation snapshot that does not point at a review on the same draft', () => {
    expect(() => ReviewRepository.create({
      baseDraftId: 1,
      content: '{"kind":"human-confirmed-review"}',
      expectedSource: frozenSource,
      kind: 'confirmation',
      sourceReviewId: 999,
    })).toThrow('确认快照的来源审稿不存在')
  })

  it('deletes derived confirmations together with their source report and reclaims both bodies', () => {
    const report = createReport()
    const confirmation = ReviewRepository.create({
      baseDraftId: 1,
      content: '{"kind":"human-confirmed-review"}',
      expectedSource: frozenSource,
      kind: 'confirmation',
      sourceReviewId: report.id,
    })
    const reportContentId = ReviewRepository.getMeta(report.id)!.contentId
    const confirmationContentId = ReviewRepository.getMeta(confirmation.id)!.contentId
    const revision = db.prepare(`
      INSERT INTO revisions (base_draft_id, revision_index, status, review_source_id, content_id)
      VALUES (1, 1, 'merged', ?, ?)
    `).run(confirmation.id, ContentRepository.create('修稿结果'))
    expect(revision.lastInsertRowid).toBeTruthy()

    expect(ReviewRepository.deleteById(report.id)).toEqual({ success: true })

    expect(ReviewRepository.getMeta(report.id)).toBeNull()
    expect(ReviewRepository.getMeta(confirmation.id)).toBeNull()
    expect(ContentRepository.getBody(reportContentId)).toBeNull()
    expect(ContentRepository.getBody(confirmationContentId)).toBeNull()
    expect(db.prepare('SELECT review_source_id FROM revisions WHERE id = ?')
      .get(revision.lastInsertRowid)).toEqual({ review_source_id: null })
  })

  it('refuses to delete while a pending revision still references the report or its confirmation', () => {
    const report = createReport()
    const confirmation = ReviewRepository.create({
      baseDraftId: 1,
      content: '{"kind":"human-confirmed-review"}',
      expectedSource: frozenSource,
      kind: 'confirmation',
      sourceReviewId: report.id,
    })
    db.prepare(`
      INSERT INTO revisions (base_draft_id, revision_index, status, review_source_id, content_id)
      VALUES (1, 1, 'pending', ?, ?)
    `).run(confirmation.id, ContentRepository.create('在途修稿'))

    expect(ReviewRepository.deleteById(report.id)).toMatchObject({
      success: false,
      errorCode: 'REVIEW_IN_USE_BY_PENDING_REVISION',
    })
    expect(ReviewRepository.listByDraft(1)).toHaveLength(2)
  })
})
