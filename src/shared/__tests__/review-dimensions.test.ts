import { describe, expect, it } from 'vitest'

import {
  REVIEW_DIMENSIONS,
  REVIEW_DIMENSION_KEYS,
  formatReviewDimensionLabels,
  formatReviewFocus,
  isReviewDimensionKey,
  normalizeReviewDimensions,
  reviewDimensionLabel,
} from '../review-dimensions'

describe('review dimensions', () => {
  it('exposes the four canonical dimensions in render order', () => {
    expect(REVIEW_DIMENSION_KEYS).toEqual(['continuity', 'logic', 'character', 'foreshadow'])
    expect(REVIEW_DIMENSIONS.map(d => d.key)).toEqual([...REVIEW_DIMENSION_KEYS])
    expect(REVIEW_DIMENSIONS.map(d => d.label.zhCN)).toEqual([
      '剧情连贯性',
      '剧情合理性',
      '角色状态',
      '前后章节串联',
    ])
  })

  it('normalizes model-supplied keys into canonical order', () => {
    expect(normalizeReviewDimensions(['foreshadow', 'continuity'])).toEqual([
      'continuity',
      'foreshadow',
    ])
  })

  it('drops unknown keys without failing the whole delegation', () => {
    expect(normalizeReviewDimensions(['logic', 'pacing', 42, null])).toEqual(['logic'])
  })

  it('deduplicates repeated keys', () => {
    expect(normalizeReviewDimensions(['logic', 'logic', 'character', 'logic'])).toEqual([
      'logic',
      'character',
    ])
  })

  it('treats non-array input as no selection', () => {
    expect(normalizeReviewDimensions(undefined)).toEqual([])
    expect(normalizeReviewDimensions('continuity')).toEqual([])
    expect(normalizeReviewDimensions({ continuity: true })).toEqual([])
  })

  it('recognizes only canonical keys', () => {
    expect(isReviewDimensionKey('character')).toBe(true)
    expect(isReviewDimensionKey('Character')).toBe(false)
    expect(isReviewDimensionKey(undefined)).toBe(false)
  })

  it('labels dimensions in the requested writing language', () => {
    expect(reviewDimensionLabel('continuity', 'zh-CN')).toBe('剧情连贯性')
    expect(reviewDimensionLabel('continuity', 'en-US')).toBe('Story continuity')
  })

  it('joins labels with the language separator', () => {
    expect(formatReviewDimensionLabels(['continuity', 'character'], 'zh-CN')).toBe(
      '剧情连贯性、角色状态',
    )
    expect(formatReviewDimensionLabels(['continuity', 'character'], 'en-US')).toBe(
      'Story continuity, Character state',
    )
    expect(formatReviewDimensionLabels([], 'zh-CN')).toBe('')
  })

  it('states the focus sentence and falls back to all dimensions when empty', () => {
    expect(formatReviewFocus(['continuity', 'logic'], 'zh-CN')).toBe(
      '重点检查维度：剧情连贯性、剧情合理性',
    )
    expect(formatReviewFocus(['continuity', 'logic'], 'en-US')).toBe(
      'Review focus: Story continuity, Story logic',
    )
    expect(formatReviewFocus([], 'zh-CN')).toBe('重点检查维度：全部维度')
    expect(formatReviewFocus([], 'en-US')).toBe('Review focus: all dimensions')
  })
})
