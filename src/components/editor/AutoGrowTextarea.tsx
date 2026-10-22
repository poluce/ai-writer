/**
 * 自适应高度文本域 — 随内容增减及窗口/容器宽度变化自适应撑开高度。
 * 从 SynopsisEditor 拆出的通用展示组件。
 */

import { useEffect, useRef } from 'react'

export interface AutoGrowTextareaProps {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  placeholder: string
}

export function AutoGrowTextarea({
  value,
  onChange,
  ariaLabel,
  placeholder,
}: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const resize = () => {
      element.style.height = 'auto'
      element.style.height = `${Math.max(element.scrollHeight, 24)}px`
    }
    resize()

    let prevWidth = element.offsetWidth
    const observer = new ResizeObserver(() => {
      if (element.offsetWidth !== prevWidth) {
        prevWidth = element.offsetWidth
        requestAnimationFrame(resize)
      }
    })
    observer.observe(element)

    window.addEventListener('resize', resize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={event => onChange(event.target.value)}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className="w-full resize-none bg-transparent outline-none rounded-sm px-1 py-0.5 text-xs leading-relaxed font-mono overflow-hidden"
      style={{
        color: 'var(--color-text-secondary)',
        minHeight: 24,
        overflow: 'hidden',
        overflowY: 'hidden',
        overflowX: 'hidden',
      }}
      onFocus={event => { event.currentTarget.style.backgroundColor = 'var(--color-panel)' }}
      onBlur={event => { event.currentTarget.style.backgroundColor = 'transparent' }}
    />
  )
}
