import { Check } from 'lucide-react'
import { useLocaleStore } from '../../stores/locale-store'

/**
 * 通用菜单项按钮
 * 统一替换 AgentHeader.MoreMenuItem 和 ActivityBar.MenuAction
 */
export interface MenuItemProps {
  label: string
  onClick: () => void
  icon?: React.ReactNode
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  /** 单选菜单项的当前项标记 */
  checked?: boolean
  /** 置灰项右侧的说明（默认「即将推出」） */
  disabledHint?: string
}

export function MenuItem({ label, onClick, icon, shortcut, disabled, danger, checked, disabledHint }: MenuItemProps) {
  const text = useLocaleStore(state => state.text)
  return (
    <button
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
      aria-pressed={checked}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors"
      style={{
        color: danger
          ? 'var(--color-error-text)'
          : disabled
          ? 'var(--color-text-muted)'
          : 'var(--color-text)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={e => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = danger
            ? 'color-mix(in srgb, var(--color-error) 10%, transparent)'
            : 'var(--color-hover)'
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      {icon && (
        <span style={{ color: danger ? 'var(--color-error)' : 'var(--color-text-secondary)' }}>
          {icon}
        </span>
      )}
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-[0.7rem] opacity-40 font-mono ml-2 flex-shrink-0">{shortcut}</span>
      )}
      {checked && (
        <span className="ml-2 flex-shrink-0" style={{ color: 'var(--color-accent)' }}>
          <Check size={12} strokeWidth={2.2} />
        </span>
      )}
      {disabled && (
        <span className="ml-auto text-[0.7rem] opacity-40">{disabledHint ?? text('即将推出', 'Coming soon')}</span>
      )}
    </button>
  )
}
