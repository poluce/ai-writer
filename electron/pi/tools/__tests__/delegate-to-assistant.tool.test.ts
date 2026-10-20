import { describe, expect, it, vi } from 'vitest'
import { createDelegateToAssistantTool } from '../delegate-to-assistant.tool'

describe('createDelegateToAssistantTool', () => {
  it('has valid tool metadata and write operation declaration', () => {
    const handler = vi.fn()
    const tool = createDelegateToAssistantTool('zh-CN', handler)
    expect(tool.name).toBe('delegate_to_assistant')
    expect(tool.description).toContain('向架构助手或章节蓝图助手委派专门任务')
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
      context: '主角第10章潜入',
    })

    expect(handler).toHaveBeenCalledWith({
      target: 'architect',
      task: '梳理千机阁设定',
      context: '主角第10章潜入',
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

  it('delegates task to blueprint in English locale', async () => {
    const handler = vi.fn().mockResolvedValue({
      success: true,
      result: 'Chapter 10 blueprint designed with cliffhanger.',
      conversationId: 'blueprint-456',
    })

    const tool = createDelegateToAssistantTool('en-US', handler)
    const result = await tool.execute('call-2', {
      assistant: 'blueprint',
      task: 'Plan chapter 10 scene beats',
    })

    expect(handler).toHaveBeenCalledWith({
      target: 'blueprint',
      task: 'Plan chapter 10 scene beats',
      context: undefined,
    })
    const textContent = result.content[0] as { type: 'text'; text: string }
    expect(textContent.text).toContain('[Chapter Blueprint Assistant completed the task]')
    expect(textContent.text).toContain('Chapter 10 blueprint designed with cliffhanger.')
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
})
