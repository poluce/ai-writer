/**
 * ReviewRepository — 审稿 (reviews 表 + contents 联动)
 *
 * 审稿是对某版草稿的评审反馈报告。
 */
import { getProjectDb } from '../database'
import { ContentRepository } from './content-repository'
import type { ExpectedDraftSource } from '../../src/shared/contracts/draft'
import type { ReviewFull, ReviewKind, ReviewMeta } from '../../src/shared/contracts/review'
import { assertExpectedDraftSource, SourceDraftChangedError } from './draft-source-guard'

export type { ReviewFull, ReviewMeta }

/** 审稿列表行：在元数据上补出所属草稿的章节与版本，供主智能体按章节检索。 */
export interface ReviewSummary extends ReviewMeta {
    chapterNumber: number
    draftVersion: number
}

export type ReviewDeleteErrorCode = 'REVIEW_NOT_FOUND' | 'REVIEW_IN_USE_BY_PENDING_REVISION'

export type ReviewDeleteResult =
    | { success: true }
    | { success: false; errorCode: ReviewDeleteErrorCode; error: string }

function rowToSourceDraft(row: Record<string, unknown>): ExpectedDraftSource | null {
    if (
        typeof row.source_draft_chapter_number !== 'number'
        || typeof row.source_draft_version !== 'number'
        || typeof row.source_draft_status !== 'string'
        || typeof row.source_content !== 'string'
    ) return null
    return {
        id: row.base_draft_id as number,
        chapterNumber: row.source_draft_chapter_number,
        version: row.source_draft_version,
        status: row.source_draft_status as ExpectedDraftSource['status'],
        content: row.source_content,
    }
}

function rowToMeta(row: Record<string, unknown>): ReviewMeta {
    return {
        id: row.id as number,
        baseDraftId: row.base_draft_id as number,
        reviewIndex: row.review_index as number,
        contentId: row.content_id as number,
        createdAt: row.created_at as string,
        kind: (row.kind === 'confirmation' ? 'confirmation' : 'review') as ReviewKind,
        sourceReviewId: typeof row.source_review_id === 'number' ? row.source_review_id : null,
    }
}

export class ReviewRepository {
    /** 创建审稿（事务：先入内容池再建元数据） */
    static create(params: {
        baseDraftId: number
        reviewIndex?: number
        content: string
        expectedSource?: ExpectedDraftSource
        /** 默认 review；人工确认快照必须显式声明 confirmation 并给出 sourceReviewId。 */
        kind?: ReviewKind
        sourceReviewId?: number
    }): { id: number; reviewIndex: number } {
        const db = getProjectDb()
        if (!db) throw new Error('[ReviewRepository] 数据库未连接')

        // 事务内原子分配 review_index，避免 getNextIndex + create 竞态
        const kind: ReviewKind = params.kind ?? 'review'
        const tx = db.transaction(() => {
            if (!params.expectedSource) throw new SourceDraftChangedError()
            assertExpectedDraftSource(db, params.baseDraftId, params.expectedSource)
            if (kind === 'confirmation') {
                if (!Number.isSafeInteger(params.sourceReviewId) || (params.sourceReviewId ?? 0) <= 0) {
                    throw new Error('[ReviewRepository] 人工确认快照必须指向原始审稿报告')
                }
                const source = db.prepare(
                    'SELECT base_draft_id FROM reviews WHERE id = ?'
                ).get(params.sourceReviewId) as { base_draft_id: number } | undefined
                if (!source || source.base_draft_id !== params.baseDraftId) {
                    throw new Error('[ReviewRepository] 确认快照的来源审稿不存在或不属于同一草稿')
                }
            }
            const row = db.prepare(`
        SELECT MAX(review_index) as maxIdx FROM reviews WHERE base_draft_id = ?
      `).get(params.baseDraftId) as { maxIdx: number | null }
            const reviewIndex = (row.maxIdx ?? 0) + 1

            const contentId = ContentRepository.create(params.content)
            const result = db.prepare(`
        INSERT INTO reviews (
          base_draft_id, review_index,
          source_draft_chapter_number, source_draft_version, source_draft_status, source_content,
          kind, source_review_id,
          content_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
                params.baseDraftId,
                reviewIndex,
                params.expectedSource?.chapterNumber ?? null,
                params.expectedSource?.version ?? null,
                params.expectedSource?.status ?? null,
                params.expectedSource?.content ?? null,
                kind,
                kind === 'confirmation' ? (params.sourceReviewId ?? null) : null,
                contentId,
            )
            return { id: Number(result.lastInsertRowid), reviewIndex }
        })

        return tx()
    }

    /** 列出某草稿的所有审稿 */
    static listByDraft(baseDraftId: number): ReviewMeta[] {
        const db = getProjectDb()
        if (!db) return []

        const rows = db.prepare(`
      SELECT * FROM reviews
      WHERE base_draft_id = ?
      ORDER BY review_index ASC
    `).all(baseDraftId) as Record<string, unknown>[]

        return rows.map(rowToMeta)
    }

    /** 按 review_id / draft_id / chapter_number 列出审稿元数据（不读取报告正文） */
    static listSummaries(filter: {
        reviewId?: number
        draftId?: number
        chapterNumber?: number
    } = {}): ReviewSummary[] {
        const db = getProjectDb()
        if (!db) return []

        const clauses: string[] = []
        const args: number[] = []
        if (filter.reviewId !== undefined) {
            clauses.push('reviews.id = ?')
            args.push(filter.reviewId)
        }
        if (filter.draftId !== undefined) {
            clauses.push('reviews.base_draft_id = ?')
            args.push(filter.draftId)
        }
        if (filter.chapterNumber !== undefined) {
            clauses.push('drafts.chapter_number = ?')
            args.push(filter.chapterNumber)
        }
        clauses.push("reviews.kind = 'review'")
        const where = `WHERE ${clauses.join(' AND ')}`

        const rows = db.prepare(`
      SELECT reviews.*, drafts.chapter_number, drafts.version
      FROM reviews
      JOIN drafts ON drafts.id = reviews.base_draft_id
      ${where}
      ORDER BY drafts.chapter_number ASC, reviews.base_draft_id ASC, reviews.review_index ASC
    `).all(...args) as Record<string, unknown>[]

        return rows.map(row => ({
            ...rowToMeta(row),
            chapterNumber: row.chapter_number as number,
            draftVersion: row.version as number,
        }))
    }

    /** 获取审稿元数据（不含报告正文） */
    static getMeta(id: number): ReviewMeta | null {
        const db = getProjectDb()
        if (!db) return null

        const row = db.prepare(
            'SELECT * FROM reviews WHERE id = ?'
        ).get(id) as Record<string, unknown> | undefined

        return row ? rowToMeta(row) : null
    }

    /** 获取某草稿的最新审稿 */
    static getLatestByDraft(baseDraftId: number): ReviewFull | null {
        const db = getProjectDb()
        if (!db) return null

        const row = db.prepare(`
      SELECT * FROM reviews
      WHERE base_draft_id = ?
      ORDER BY review_index DESC LIMIT 1
    `).get(baseDraftId) as Record<string, unknown> | undefined

        if (!row) return null
        const meta = rowToMeta(row)
        const body = ContentRepository.getBody(meta.contentId)
        return { ...meta, content: body ?? '', sourceDraft: rowToSourceDraft(row) }
    }

    /** 获取审稿完整数据 */
    static getFull(id: number): ReviewFull | null {
        const db = getProjectDb()
        if (!db) return null

        const row = db.prepare(
            'SELECT * FROM reviews WHERE id = ?'
        ).get(id) as Record<string, unknown> | undefined

        if (!row) return null
        const meta = rowToMeta(row)
        const body = ContentRepository.getBody(meta.contentId)
        return { ...meta, content: body ?? '', sourceDraft: rowToSourceDraft(row) }
    }

    /** 获取下一个审稿序号 */
    static getNextIndex(baseDraftId: number): number {
        const db = getProjectDb()
        if (!db) return 1

        const row = db.prepare(`
      SELECT MAX(review_index) as maxIdx FROM reviews WHERE base_draft_id = ?
    `).get(baseDraftId) as { maxIdx: number | null }

        return (row.maxIdx ?? 0) + 1
    }

    /**
     * 删除一条审稿报告（事务）。
     *
     * - 报告不存在 → REVIEW_NOT_FOUND。
     * - 仍被 pending 修稿引用 → REVIEW_IN_USE_BY_PENDING_REVISION：修稿正在进行，
     *   删除会让在途修稿失去审稿来源，必须等修稿结束。
     * - 否则解除所有历史修订（含 merged / discarded）的 review_source_id 溯源关联，
     *   删除 reviews 行；报告正文所在 contents 行只有在不再被任何表引用时才回收。
     */
    static deleteById(reviewId: number): ReviewDeleteResult {
        const db = getProjectDb()
        if (!db) throw new Error('[ReviewRepository] 数据库未连接')

        const tx = db.transaction((): ReviewDeleteResult => {
            const target = db.prepare(
                'SELECT content_id, kind FROM reviews WHERE id = ?'
            ).get(reviewId) as { content_id: number; kind: ReviewKind } | undefined
            if (!target) {
                return {
                    success: false,
                    errorCode: 'REVIEW_NOT_FOUND',
                    error: `审稿报告不存在：${reviewId}`,
                }
            }

            // 删除 AI 审稿报告时，级联清理它派生出来的人工确认快照；
            // 否则每次确认都会留下孤儿记录，形成只增不减的漏斗。
            const removedIds = [reviewId]
            const removedContentIds = [target.content_id]
            if (target.kind === 'review') {
                const derived = db.prepare(`
                  SELECT id, content_id FROM reviews WHERE source_review_id = ?
                `).all(reviewId) as Array<{ id: number; content_id: number }>
                for (const row of derived) {
                    removedIds.push(row.id)
                    removedContentIds.push(row.content_id)
                }
            }
            const placeholders = removedIds.map(() => '?').join(', ')

            const pendingUsage = db.prepare(`
              SELECT id FROM revisions
              WHERE review_source_id IN (${placeholders}) AND status = 'pending'
              LIMIT 1
            `).get(...removedIds) as { id: number } | undefined
            if (pendingUsage) {
                return {
                    success: false,
                    errorCode: 'REVIEW_IN_USE_BY_PENDING_REVISION',
                    error: `审稿报告 #${reviewId} 正在被修稿 #${pendingUsage.id} 使用，完成修稿前不能删除`,
                }
            }

            db.prepare(
                `UPDATE revisions SET review_source_id = NULL WHERE review_source_id IN (${placeholders})`
            ).run(...removedIds)
            db.prepare(
                `DELETE FROM reviews WHERE id IN (${placeholders})`
            ).run(...removedIds)

            for (const contentId of removedContentIds) {
                const references = db.prepare(`
                  SELECT
                    (SELECT COUNT(*) FROM drafts WHERE content_id = ?)
                    + (SELECT COUNT(*) FROM revisions WHERE content_id = ?)
                    + (SELECT COUNT(*) FROM reviews WHERE content_id = ?) AS total
                `).get(contentId, contentId, contentId) as { total: number }
                if (references.total === 0) {
                    db.prepare('DELETE FROM contents WHERE id = ?').run(contentId)
                }
            }

            return { success: true }
        })

        return tx()
    }
}
