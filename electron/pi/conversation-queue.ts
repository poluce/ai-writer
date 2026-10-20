import { randomUUID } from 'node:crypto'

export interface QueuedTask<T> {
  id: string
  label?: string
  run: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
  aborted?: boolean
}

/**
 * 会话级异步消息/任务排队队列（Mailbox / Message Queue）。
 * 保证同一会话内的并发消息或委派任务按 FIFO 严格串行执行，
 * 在忙碌时平滑排队缓冲，杜绝并发冲突或因繁忙被动创建碎片会话。
 */
export class ConversationQueue {
  private queue: QueuedTask<any>[] = []
  private active = false

  /** 当前队列中的总任务数（排队中 + 执行中） */
  get size(): number {
    return this.queue.length + (this.active ? 1 : 0)
  }

  /** 正在排队等待执行的任务数 */
  get pendingCount(): number {
    return this.queue.length
  }

  /** 当前是否有任务正在执行中 */
  isBusy(): boolean {
    return this.active
  }

  /**
   * 将一个任务放入队列中排队。
   * 若当前空闲，任务立即执行；若前序任务正在运行，则排队等待其完成后自动执行。
   */
  enqueue<T>(run: () => Promise<T>, label?: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        id: randomUUID(),
        label,
        run,
        resolve,
        reject,
      }
      this.queue.push(task)
      void this.processNext()
    })
  }

  private async processNext(): Promise<void> {
    if (this.active) return
    const next = this.queue.shift()
    if (!next) return

    this.active = true
    try {
      if (next.aborted) {
        next.reject(new Error('任务在排队中被取消'))
        return
      }
      const result = await next.run()
      next.resolve(result)
    } catch (error) {
      next.reject(error)
    } finally {
      this.active = false
      void this.processNext()
    }
  }

  /**
   * 终止所有还在排队中、尚未开始执行的任务。
   */
  abortPending(reason = '排队任务已终止'): void {
    const pending = this.queue.splice(0)
    for (const task of pending) {
      task.aborted = true
      task.reject(new Error(reason))
    }
  }

  /**
   * 清空队列并拒绝所有排队任务。
   */
  clear(): void {
    this.abortPending('会话已关闭')
  }
}
