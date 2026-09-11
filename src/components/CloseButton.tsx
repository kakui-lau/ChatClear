import type { Locale } from '../../shared/contracts'
import { tx } from '../i18n'

interface CloseButtonProps {
  locale: Locale
  onClick(): void
  compact?: boolean
}

export function CloseButton({ locale, onClick, compact = false }: CloseButtonProps) {
  const label = tx(locale, '关闭', 'Close')

  return (
    <button
      aria-label={label}
      className={`dialog-close-button${compact ? ' is-compact' : ''}`}
      title={label}
      type="button"
      onClick={onClick}
    >
      <svg
        aria-hidden="true"
        className="dialog-close-icon"
        fill="none"
        focusable="false"
        viewBox="0 0 24 24"
      >
        <path
          d="m7 7 10 10M17 7 7 17"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
      <span>{label}</span>
    </button>
  )
}
