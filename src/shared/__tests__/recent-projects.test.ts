import { describe, expect, it } from 'vitest'

import { recentProjectExcerpt } from '../recent-projects'

describe('recentProjectExcerpt', () => {
  it('collapses whitespace and strips markdown heading markers', () => {
    expect(recentProjectExcerpt('# 第四十七章 归途\n\n  雨夜的山门\n亮了整夜。'))
      .toBe('第四十七章 归途 雨夜的山门 亮了整夜。')
  })

  it('truncates long prose with an ellipsis', () => {
    const excerpt = recentProjectExcerpt('字'.repeat(100), 12)
    expect(excerpt).toBe(`${'字'.repeat(12)}…`)
  })

  it('returns undefined for blank content', () => {
    expect(recentProjectExcerpt(' \n\t ')).toBeUndefined()
  })
})
