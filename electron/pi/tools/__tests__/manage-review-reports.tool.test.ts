import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { closeProjectDatabase, getProjectDb, initProjectDatabase } from '../../../database'
import { DraftRepository } from '../../../repositories/draft-repository'
import { ReviewRepository } from '../../../repositories/review-repository'
import { RevisionRepository } from '../../../repositories/revision-repository'
import type { DraftStatus } from '../../../../src/shared/draft-status'
import type { RendererAction } from '../../renderer-action'
import { createManageReviewReportsTool } from '../manage-review-reports.tool'
import { createDeleteReviewReportTool } from '../delete-review-report.tool'

const DRAFT_BODY = '陆舟站在山门前，雨声很密。他握紧玉佩，忽然听见脚步。'
const REVIEW_CONTENT = JSON.stringify({
    summary: '本章节奏稳定，但有一处人物动机需要补足。',
    items: [{
        category: '人物动机',
        severity: 'warning',
        description: '听见脚步就握紧玉佩，缺少警觉来源的铺垫。',
        quote: '他握紧玉佩，忽然听见脚步',
    }],
}, null, 2)

let projectRoot = ''

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
    const first = result.content[0]
    if (!first || first.type !== 'text' || typeof first.text !== 'string') {
        throw new Error('expected text content')
    }
    return first.text
}

function createDraft(chapterNumber: number, content = DRAFT_BODY): number {
    return DraftRepository.create({
        chapterNumber,
        source: 'write',
        content,
        wordCount: content.length,
    })
}

function expectedSourceOf(draftId: number) {
    const draft = DraftRepository.getFull(draftId)
    if (!draft) throw new Error(`seed draft missing: ${draftId}`)
    return {
        id: draft.id,
        chapterNumber: draft.chapterNumber,
        version: draft.version,
        status: draft.status as DraftStatus,
        content: draft.content,
    }
}

function createReview(draftId: number): { id: number; reviewIndex: number } {
    return ReviewRepository.create({
        baseDraftId: draftId,
        content: REVIEW_CONTENT,
        expectedSource: expectedSourceOf(draftId),
    })
}

function createRevision(draftId: number, reviewId: number): number {
    return RevisionRepository.create({
        baseDraftId: draftId,
        revisionType: 'review-fix',
        reviewSourceId: reviewId,
        content: '修稿后的正文',
        wordCount: 6,
        expectedSource: expectedSourceOf(draftId),
    }).id
}

describe('manage_review_reports / delete_review_report tools', () => {
    beforeEach(() => {
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-review-lifecycle-'))
        initProjectDatabase(projectRoot)
    })

    afterEach(() => {
        closeProjectDatabase()
    })

    describe('manage_review_reports', () => {
        it('lists review report metadata and filters by chapter / report id', async () => {
            const chapterOneDraft = createDraft(1)
            const chapterTwoDraft = createDraft(2, '第二章正文，夜半钟声。')
            const first = createReview(chapterOneDraft)
            const second = createReview(chapterOneDraft)
            const third = createReview(chapterTwoDraft)

            const tool = createManageReviewReportsTool('zh-CN', () => {})

            const all = await tool.execute('call-1', { action: 'list' })
            const allDetails = all.details as {
                total: number
                reports: Array<{ id: number; chapterNumber: number; reviewIndex: number; createdAt: string }>
            }
            expect(allDetails.total).toBe(3)
            expect(allDetails.reports.map(report => report.id)).toEqual([first.id, second.id, third.id])
            expect(allDetails.reports[0]).toMatchObject({
                chapterNumber: 1,
                reviewIndex: 1,
                createdAt: expect.any(String),
            })
            expect(textOf(all)).toContain(`第 2 章 r1（ID: ${third.id}`)

            const chapterTwo = await tool.execute('call-2', { action: 'list', chapter_number: 2 })
            expect((chapterTwo.details as { reports: Array<{ id: number }> }).reports.map(report => report.id))
                .toEqual([third.id])

            const single = await tool.execute('call-3', { action: 'list', review_id: second.id })
            expect((single.details as { reports: Array<{ id: number; reviewIndex: number }> }).reports)
                .toEqual([expect.objectContaining({ id: second.id, reviewIndex: 2 })])

            const empty = await tool.execute('call-4', { action: 'list', chapter_number: 9 })
            expect(textOf(empty)).toContain('没有匹配的审稿报告')
        })

        it('closes review report tabs by report id or chapter number', async () => {
            const draftId = createDraft(3)
            const review = createReview(draftId)
            const actions: RendererAction[] = []
            const tool = createManageReviewReportsTool('zh-CN', action => { actions.push(action) })

            const byId = await tool.execute('call-1', { action: 'close', review_id: review.id })
            expect(actions).toEqual([{
                type: 'close_editor_tab',
                target: 'review-report',
                reviewId: review.id,
                chapterNumber: 3,
            }])
            expect(textOf(byId)).toContain('已关闭第 3 章审稿报告')

            actions.length = 0
            await tool.execute('call-2', { action: 'close', chapter_number: 3 })
            expect(actions).toEqual([{
                type: 'close_editor_tab',
                target: 'review-report',
                chapterNumber: 3,
            }])
        })

        it('rejects closing a report that does not exist', async () => {
            const tool = createManageReviewReportsTool('zh-CN', () => {})

            await expect(tool.execute('call-1', { action: 'close', review_id: 9999 }))
                .rejects.toThrow('未找到 ID 为 9999 的审稿报告')
        })
    })

    describe('delete_review_report', () => {
        it('deletes the report, detaches historical revisions, and emits close + refresh', async () => {
            const draftId = createDraft(2)
            const review = createReview(draftId)
            const meta = ReviewRepository.getMeta(review.id)
            expect(meta).not.toBeNull()
            if (!meta) return

            // 历史修稿（已弃用）仍引用该审稿：删除允许，但必须解除溯源关联。
            const revisionId = createRevision(draftId, review.id)
            RevisionRepository.markDiscarded(revisionId)

            const actions: RendererAction[] = []
            const tool = createDeleteReviewReportTool('zh-CN', action => { actions.push(action) })

            const result = await tool.execute('call-1', { review_id: review.id })

            expect(ReviewRepository.getFull(review.id)).toBeNull()
            expect(RevisionRepository.getFull(revisionId)?.reviewSourceId).toBeNull()
            expect(actions).toEqual([
                {
                    type: 'close_editor_tab',
                    target: 'review-report',
                    reviewId: review.id,
                    chapterNumber: 2,
                },
                { type: 'refresh_reviews' },
            ])
            expect(textOf(result)).toContain('已永久删除第 2 章审稿报告')
            expect(result.details).toMatchObject({ reviewId: review.id, reviewIndex: 1, chapterNumber: 2 })

            const db = getProjectDb()
            expect(db).not.toBeNull()
            const contents = db?.prepare('SELECT COUNT(*) AS total FROM contents WHERE id = ?')
                .get(meta.contentId) as { total: number } | undefined
            expect(contents?.total).toBe(0)
        })

        it('refuses to delete a report that is still driving a pending revision', async () => {
            const draftId = createDraft(1)
            const review = createReview(draftId)
            createRevision(draftId, review.id)

            const actions: RendererAction[] = []
            const tool = createDeleteReviewReportTool('zh-CN', action => { actions.push(action) })

            await expect(tool.execute('call-1', { review_id: review.id }))
                .rejects.toThrow('审稿正在用于修稿，请等修稿完成后再删除')

            expect(ReviewRepository.getFull(review.id)).not.toBeNull()
            expect(actions).toHaveLength(0)
        })

        it('reports a readable error when the report does not exist', async () => {
            const tool = createDeleteReviewReportTool('zh-CN', () => {})

            await expect(tool.execute('call-1', { review_id: 424242 }))
                .rejects.toThrow('审稿报告不存在')
        })
    })
})
