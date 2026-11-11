import { describe, expect, it, vi } from 'vitest'
import { createDelegateToAssistantTool } from '../delegate-to-assistant.tool'

describe('createDelegateToAssistantTool', () => {
  it('has valid tool metadata and write operation declaration', () => {
    const handler = vi.fn()
    const tool = createDelegateToAssistantTool('zh-CN', handler)
    expect(tool.name).toBe('delegate_to_assistant')
    expect(tool.description).toContain('向专门领域助手（架构助手、章节蓝图助手、写作助手或审稿助手）委派专门任务')
    expect(tool.isWriteOperation?.({ assistant: 'architect', task: '完善设定' })).toBe(true)
  })

  it('delegates task to architect and returns structured response', async () => {
    const handler = vi.fn().mockResolvedValue({
      success: true,
      result: '千机阁设定已完成，拥有三大支系。',
      conversationId: 'architect-123',
    })

    const tool = createDelegateToAssistantTool('zh-CN', handler)
    const result = await tool.execute('call-1', {
      assistant: 'architect',
      task: '梳理千机阁设定',
      instructions: '主角第10章潜入',
    })

    expect(handler).toHaveBeenCalledWith({
      target: 'architect',
      task: '梳理千机阁设定',
      chapter_number: undefined,
      instructions: '主角第10章潜入',
    })
    const textContent = result.content[0] as { type: 'text'; text: string }
    expect(textContent.text).toContain('【架构助手已完成任务】')
    expect(textContent.text).toContain('千机阁设定已完成')
    expect(result.details).toEqual({
      assistant: 'architect',
      conversationId: 'architect-123',
      result: '千机阁设定已完成，拥有三大支系。',
    })
  })

  it('delegates task to blueprint in English locale with chapter_number', async () => {
    const handler = vi.fn().mockResolvedValue({
      success: true,
      result: 'Chapter 10 blueprint designed with cliffhanger.',
      conversationId: 'blueprint-456',
    })

    const tool = createDelegateToAssistantTool('en-US', handler)
    const result = await tool.execute('call-2', {
      assistant: 'blueprint',
      task: 'Plan chapter scene beats',
      chapter_number: 10,
    })

    expect(handler).toHaveBeenCalledWith({
      target: 'blueprint',
      task: 'Plan chapter scene beats',
      chapter_number: 10,
      instructions: undefined,
    })
    const textContent = result.content[0] as { type: 'text'; text: string }
    expect(textContent.text).toContain('[Chapter Blueprint Assistant completed the task]')
    expect(textContent.text).toContain('Chapter 10 blueprint designed with cliffhanger.')
  })

  it('delegates task to review assistant with chapter_number and instructions', async () => {
    const handler = vi.fn().mockResolvedValue({
      success: true,
      result: '第1章审稿完成，已生成审稿报告。发现2处伏笔遗漏。',
      conversationId: 'review-789',
    })

    const tool = createDelegateToAssistantTool('zh-CN', handler)
    const result = await tool.execute('call-3', {
      assistant: 'review',
      task: '审查草稿并提交审稿报告',
      chapter_number: 1,
      instructions: '重点关注开篇节奏',
    })

    expect(handler).toHaveBeenCalledWith({
      target: 'review',
      task: '审查草稿并提交审稿报告',
      chapter_number: 1,
      instructions: '重点关注开篇节奏',
    })
    const textContent = result.content[0] as { type: 'text'; text: string }
    expect(textContent.text).toContain('【审稿助手已完成任务】')
    expect(textContent.text).toContain('第1章审稿完成')
    expect(result.details).toEqual({
      assistant: 'review',
      conversationId: 'review-789',
      result: '第1章审稿完成，已生成审稿报告。发现2处伏笔遗漏。',
    })
  })

  it('passes author-selected review dimensions through in canonical order', async () => {
    const handler = vi.fn().mockResolvedValue({
      success: true,
      result: '审稿完成，报告已生成。',
      conversationId: 'review-321',
      reviewId: 7,
    })

    const tool = createDelegateToAssistantTool('zh-CN', handler)
    const result = await tool.execute('call-7', {
      assistant: 'review',
      task: '审查草稿并提交审稿报告',
      chapter_number: 3,
      review_dimensions: ['foreshadow', 'continuity', 'continuity'],
    })

    expect(handler).toHaveBeenCalledWith({
      target: 'review',
      task: '审查草稿并提交审稿报告',
      chapter_number: 3,
      instructions: undefined,
      review_dimensions: ['continuity', 'foreshadow'],
    })
    expect(result.details).toMatchObject({
      reviewId: 7,
      reviewDimensions: ['continuity', 'foreshadow'],
    })
  })

  it('ignores review dimensions when delegating to non-review assistants', async () => {
    const handler = vi.fn().mockResolvedValue({
      success: true,
      result: '设定完成',
      conversationId: 'architect-2',
    })

    const tool = createDelegateToAssistantTool('zh-CN', handler)
    const result = await tool.execute('call-8', {
      assistant: 'architect',
      task: '梳理设定',
      review_dimensions: ['continuity'],
    })

    expect(handler).toHaveBeenCalledWith({
      target: 'architect',
      task: '梳理设定',
      chapter_number: undefined,
      instructions: undefined,
    })
    expect(result.details).not.toHaveProperty('reviewDimensions')
  })

  it('throws an error when delegation fails', async () => {
    const handler = vi.fn().mockResolvedValue({
      success: false,
      error: '模型推理中断',
    })

    const tool = createDelegateToAssistantTool('zh-CN', handler)
    await expect(tool.execute('call-3', {
      assistant: 'architect',
      task: '规划分卷大纲',
    })).rejects.toThrow('模型推理中断')
  })

  it('saves the active draft before delegating to the review assistant', async () => {
    const handler = vi.fn().mockResolvedValue({
      success: true,
      result: '审稿完成，报告已生成。',
      conversationId: 'review-999',
      reviewId: 42,
    })
    const rendererAction = vi.fn().mockResolvedValue({ ok: true, summary: '已保存第 2 章草稿。' })

    const tool = createDelegateToAssistantTool('zh-CN', handler, rendererAction)
    const result = await tool.execute('call-4', {
      assistant: 'review',
      task: '审查草稿并提交审稿报告',
      chapter_number: 2,
      instructions: '重点看节奏',
    })

    expect(rendererAction).toHaveBeenCalledWith({ type: 'save_draft_for_ai', chapterNumber: 2 })
    expect(handler).toHaveBeenCalledWith({
      target: 'review',
      task: '审查草稿并提交审稿报告',
      chapter_number: 2,
      instructions: '重点看节奏',
    })
    expect(result.details).toMatchObject({
      assistant: 'review',
      conversationId: 'review-999',
      reviewId: 42,
      savedDraft: '已保存第 2 章草稿。',
    })
  })

  it('aborts review delegation when the current draft cannot be saved', async () => {
    const handler = vi.fn()
    const rendererAction = vi.fn().mockResolvedValue({ ok: false, error: '磁盘写入失败' })

    const tool = createDelegateToAssistantTool('zh-CN', handler, rendererAction)
    await expect(tool.execute('call-5', {
      assistant: 'review',
      task: '审查草稿',
      chapter_number: 1,
    })).rejects.toThrow('审稿前保存当前草稿失败：磁盘写入失败')
    expect(handler).not.toHaveBeenCalled()
  })

  it('saves the active draft before delegating to the writer assistant', async () => {
    const handler = vi.fn().mockResolvedValue({
      success: true,
      result: '第 4 章正文已写入。',
      conversationId: 'writer-888',
    })
    const rendererAction = vi.fn().mockResolvedValue({ ok: true, summary: '已保存第 4 章草稿。' })

    const tool = createDelegateToAssistantTool('zh-CN', handler, rendererAction)
    const result = await tool.execute('call-writer-1', {
      assistant: 'writer',
      task: '润色并扩写打斗段落',
      chapter_number: 4,
      instructions: '突出人物动作感',
    })

    expect(rendererAction).toHaveBeenCalledWith({ type: 'save_draft_for_ai', chapterNumber: 4 })
    expect(handler).toHaveBeenCalledWith({
      target: 'writer',
      task: '润色并扩写打斗段落',
      chapter_number: 4,
      instructions: '突出人物动作感',
    })
    const textContent = result.content[0] as { type: 'text'; text: string }
    expect(textContent.text).toContain('【写作助手已完成任务】')
    expect(result.details).toMatchObject({
      assistant: 'writer',
      conversationId: 'writer-888',
      savedDraft: '已保存第 4 章草稿。',
    })
  })

  it('aborts writer delegation when the current draft cannot be saved', async () => {
    const handler = vi.fn()
    const rendererAction = vi.fn().mockResolvedValue({ ok: false, error: '磁盘写入失败' })

    const tool = createDelegateToAssistantTool('zh-CN', handler, rendererAction)
    await expect(tool.execute('call-writer-fail', {
      assistant: 'writer',
      task: '修改第 4 章',
      chapter_number: 4,
    })).rejects.toThrow('写作前保存当前草稿失败：磁盘写入失败')
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not save drafts before delegating to architect or blueprint assistants', async () => {
    const handler = vi.fn().mockResolvedValue({
      success: true,
      result: '设定完成',
      conversationId: 'architect-1',
    })
    const rendererAction = vi.fn()

    const tool = createDelegateToAssistantTool('zh-CN', handler, rendererAction)
    await tool.execute('call-6', { assistant: 'architect', task: '梳理设定' })

    expect(rendererAction).not.toHaveBeenCalled()
  })
})
