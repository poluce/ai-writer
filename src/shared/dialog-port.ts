/**
 * 弹窗反馈端口 — 状态层（Store）与服务层（Service）调用 UI 对话框的唯一 Seam。
 *
 * 分层规则要求 Store/Service 不得反向依赖 components/ui 视图实现；需要弹窗
 * 反馈时统一通过本端口转发。main.tsx 作为组合根在启动时注入真实实现，测试
 * 通过 setDialogPort 注入 mock，未注入时走 console 降级路径，保证任何环境
 * 下都不崩溃。
 */

export interface AlertDialogOptions {
  /** 弹窗标题 */
  title?: string
  /** 确认按钮文字 */
  confirmText?: string
}

export interface ConfirmDialogOptions {
  /** 弹窗标题 */
  title?: string
  /** 确认按钮文字 */
  confirmText?: string
  /** 取消按钮文字 */
  cancelText?: string
  /** 危险操作时确认按钮使用破坏性样式 */
  danger?: boolean
  /** 默认有全屏遮罩；轻量确认可关闭 */
  overlay?: boolean
}

export interface DialogPort {
  alertError(message: string, options?: AlertDialogOptions): Promise<void>
  confirm(message: string, options?: Partial<ConfirmDialogOptions>): Promise<boolean>
}

let alertErrorImpl: DialogPort['alertError'] | null = null
let confirmImpl: DialogPort['confirm'] | null = null

/**
 * 注入对话框实现，可只注入部分方法。main.tsx 启动时注册 components/ui 的
 * 真实弹窗；测试按需注册 mock 以断言调用行为；未注入的方法走 console 降级。
 */
export function setDialogPort(port: Partial<DialogPort>): void {
  if (port.alertError) alertErrorImpl = port.alertError
  if (port.confirm) confirmImpl = port.confirm
}

/** 显示错误弹窗。端口未注入时降级为 console.error，绝不中断调用方。 */
export function alertError(message: string, options?: AlertDialogOptions): Promise<void> {
  if (alertErrorImpl) return alertErrorImpl(message, options)
  console.error(message)
  return Promise.resolve()
}

/** 显示确认对话框。端口未注入时降级为 console 并自动放行。 */
export function confirm(message: string, options?: Partial<ConfirmDialogOptions>): Promise<boolean> {
  if (confirmImpl) return confirmImpl(message, options)
  console.error(`[dialog-port] confirm 端口未注入，自动放行：${message}`)
  return Promise.resolve(true)
}