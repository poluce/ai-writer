import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getProjectDb } from '../../database'
import { DraftRepository } from '../draft-repository'

vi.mock('../../database', () => ({
  getProjectDb: vi.fn(),
}))

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')

let db: BetterSqlite3.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE contents (id INTEGER PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE drafts (
      id INTEGER PRIMARY KEY,
      chapter_number INTEGER NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'write',
      content_id INTEGER NOT NULL,
      word_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE finalization_outbox (
      finalization_id TEXT PRIMARY KEY,
      draft_id INTEGER NOT NULL UNIQUE,
      chapter_number INTEGER NOT NULL,
      chapter_title TEXT NOT NULL
    );
  `)
  const insertContent = db.prepare('INSERT INTO contents (id, body) VALUES (?, ?)')
  insertContent.run(1, '第一章正文')
  insertContent.run(2, '第二章旧稿')
  insertContent.run(3, '第二章正文：雨夜的山门亮了一整夜，她把账册按在桌上。')
  insertContent.run(4, '第三章旧稿')

  const insertDraft = db.prepare(`
    INSERT INTO drafts (id, chapter_number, version, status, content_id, word_count, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  insertDraft.run(1, 1, 1, 'finalized', 1, 4000, '2026-01-01 10:00:00')
  insertDraft.run(2, 2, 1, 'draft', 2, 3000, '2026-01-10 10:00:00')
  insertDraft.run(3, 2, 2, 'draft', 3, 3200, '2026-02-01 10:00:00')
  insertDraft.run(4, 3, 1, 'draft', 4, 1200, '2026-01-15 10:00:00')

  db.prepare(`
    INSERT INTO finalization_outbox (finalization_id, draft_id, chapter_number, chapter_title)
    VALUES (?, ?, ?, ?)
  `).run('finalization-1', 1, 1, '第一章 归途')

  vi.mocked(getProjectDb).mockReturnValue(db)
})

afterEach(() => {
  db.close()
  vi.clearAllMocks()
})

describe('DraftRepository.getLauncherSummary', () => {
  it('reports the most recently edited chapter, latest-draft totals and a prose excerpt', () => {
    expect(DraftRepository.getLauncherSummary()).toEqual({
      lastChapterNumber: 2,
      totalWords: 4000 + 3200 + 1200,
      finalizedChapters: 1,
      excerpt: '第二章正文：雨夜的山门亮了一整夜，她把账册按在桌上。',
    })
  })

  it('returns null for an empty project', () => {
    db.exec('DELETE FROM drafts')
    expect(DraftRepository.getLauncherSummary()).toBeNull()
  })
})
