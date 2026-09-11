import type { ReactNode } from 'react'
import type { Locale, UserProfile } from '../../shared/contracts'
import { tx } from '../i18n'
import { Brand } from './Brand'

type IconName = 'contact' | 'history' | 'settings' | 'signout'

interface TopbarProps {
  locale: Locale
  profile: UserProfile | null
  onContact(): void
  onHistory(): void
  onLogout(): void
  onSettings(): void
}

function TopbarIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    contact: (
      <>
        <path d="M20 11.5a8 8 0 0 1-8 8 8.7 8.7 0 0 1-3.45-.71L4 20l1.21-4.55A8.7 8.7 0 0 1 4.5 12a8 8 0 0 1 8-8 7.5 7.5 0 0 1 7.5 7.5Z" />
        <path d="M8.75 11.85h.01M12.25 11.85h.01M15.75 11.85h.01" />
      </>
    ),
    history: (
      <>
        <path d="M4.7 7.4A8 8 0 1 1 4 14" />
        <path d="M4.7 3.8v3.6h3.6M12 7.5V12l3 1.8" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="2.7" />
        <path d="M19.1 13.5a7.6 7.6 0 0 0 0-3l2-1.55-2-3.45-2.48 1a8 8 0 0 0-2.58-1.5L13.7 2h-4l-.34 3a8 8 0 0 0-2.58 1.5L4.3 5.5l-2 3.45 2 1.55a7.6 7.6 0 0 0 0 3l-2 1.55 2 3.45 2.48-1a8 8 0 0 0 2.58 1.5l.34 3h4l.34-3a8 8 0 0 0 2.58-1.5l2.48 1 2-3.45Z" />
      </>
    ),
    signout: (
      <>
        <path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10" />
        <path d="m15 8 4 4-4 4M9 12h10" />
      </>
    )
  }

  return (
    <svg
      aria-hidden="true"
      className="topbar-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        {paths[name]}
      </g>
    </svg>
  )
}

export function Topbar({
  locale,
  profile,
  onContact,
  onHistory,
  onLogout,
  onSettings
}: TopbarProps) {
  const displayName = profile?.displayName || tx(locale, 'Telegram 用户', 'Telegram user')
  const contactLabel = tx(locale, '联系', 'Contact')
  const historyLabel = tx(locale, '历史', 'History')
  const settingsLabel = tx(locale, '设置', 'Settings')
  const signOutLabel = tx(locale, '注销', 'Sign out')

  return (
    <header className="topbar">
      <div className="topbar-brand-area">
        <Brand />
        <span className="topbar-local-status">
          <span aria-hidden="true" />
          {tx(locale, '本地模式', 'Local mode')}
        </span>
      </div>

      <div className="topbar-actions">
        <nav
          aria-label={tx(locale, '应用快捷操作', 'Application shortcuts')}
          className="topbar-nav"
        >
          <button
            aria-label={contactLabel}
            className="topbar-control is-accent"
            title={contactLabel}
            type="button"
            onClick={onContact}
          >
            <TopbarIcon name="contact" />
            <span>{contactLabel}</span>
          </button>
          <button
            aria-label={historyLabel}
            className="topbar-control"
            title={historyLabel}
            type="button"
            onClick={onHistory}
          >
            <TopbarIcon name="history" />
            <span>{historyLabel}</span>
          </button>
          <button
            aria-label={settingsLabel}
            className="topbar-control"
            title={settingsLabel}
            type="button"
            onClick={onSettings}
          >
            <TopbarIcon name="settings" />
            <span>{settingsLabel}</span>
          </button>
        </nav>

        <div className="profile-block">
          <span className="profile-avatar" aria-hidden="true">
            {displayName.slice(0, 1).toUpperCase()}
          </span>
          <span className="profile-copy">
            <strong>{displayName}</strong>
            <small>
              {profile?.username ? `@${profile.username}` : tx(locale, '已连接', 'Connected')}
            </small>
          </span>
          <span aria-hidden="true" className="profile-divider" />
          <button
            aria-label={signOutLabel}
            className="topbar-signout"
            title={signOutLabel}
            type="button"
            onClick={onLogout}
          >
            <TopbarIcon name="signout" />
            <span>{signOutLabel}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
