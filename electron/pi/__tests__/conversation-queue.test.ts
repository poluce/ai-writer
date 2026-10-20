import { describe, expect, it } from 'vitest'
import { ConversationQueue } from '../conversation-queue'

describe('ConversationQueue', () => {
  it('executes a single task immediately when idle', async () => {
    const queue = new ConversationQueue()
    expect(queue.isBusy()).toBe(false)
    expect(queue.pendingCount).toBe(0)

    const result = await queue.enqueue(async () => {
      expect(queue.isBusy()).toBe(true)
      return 'done'
    })

    expect(result).toBe('done')
    expect(queue.isBusy()).toBe(false)
  })

  it('queues concurrent tasks and executes them in strict FIFO order', async () => {
    const queue = new ConversationQueue()
    const log: string[] = []

    let resolveTask1: () => void
    const task1Promise = new Promise<void>((r) => { resolveTask1 = r })

    const p1 = queue.enqueue(async () => {
      log.push('task1-start')
      await task1Promise
      log.push('task1-end')
      return 1
    })

    const p2 = queue.enqueue(async () => {
      log.push('task2-start')
      log.push('task2-end')
      return 2
    })

    const p3 = queue.enqueue(async () => {
      log.push('task3-start')
      log.push('task3-end')
      return 3
    })

    expect(queue.isBusy()).toBe(true)
    expect(queue.pendingCount).toBe(2)

    // 完成 task1
    resolveTask1!()

    const results = await Promise.all([p1, p2, p3])
    expect(results).toEqual([1, 2, 3])
    expect(log).toEqual([
      'task1-start',
      'task1-end',
      'task2-start',
      'task2-end',
      'task3-start',
      'task3-end',
    ])
    expect(queue.isBusy()).toBe(false)
    expect(queue.pendingCount).toBe(0)
  })

  it('continues executing queued tasks even if a prior task throws', async () => {
    const queue = new ConversationQueue()

    const p1 = queue.enqueue(async () => {
      throw new Error('task 1 failed')
    })

    const p2 = queue.enqueue(async () => {
      return 'task 2 success'
    })

    await expect(p1).rejects.toThrow('task 1 failed')
    await expect(p2).resolves.toBe('task 2 success')
  })

  it('aborts pending tasks without affecting running task', async () => {
    const queue = new ConversationQueue()

    let finishRunning: () => void
    const runningBarrier = new Promise<void>((r) => { finishRunning = r })

    const running = queue.enqueue(async () => {
      await runningBarrier
      return 'finished'
    })

    const pending1 = queue.enqueue(async () => 'never')
    const pending2 = queue.enqueue(async () => 'never')

    expect(queue.pendingCount).toBe(2)

    queue.abortPending('用户取消生成')

    await expect(pending1).rejects.toThrow('用户取消生成')
    await expect(pending2).rejects.toThrow('用户取消生成')

    finishRunning!()
    await expect(running).resolves.toBe('finished')
  })
})
