import { useEffect, useRef } from 'react'
import type {
  AccountSummary,
  DesktopPreferences,
  Locale,
  UpdateStatus
} from '../../shared/contracts'
import { tx } from '../i18n'
import { CloseButton } from './CloseButton'

interface SettingsDialogProps {
  accounts: AccountSummary[]
  activeAccountId: string
  preferences: DesktopPreferences
  updateStatus: UpdateStatus
  onClose(): void
  onPreferencesChange(preferences: DesktopPreferences): void
  onSwitchAccount(accountId: string): void
  onAddAccount(): void
  onRemoveAccount(): void
  onBackup(): void
  onRestore(): void
  onCheckUpdates(): void
  onOpenRelease(): void
}

export function SettingsDialog({
  accounts,
  activeAccountId,
  preferences,
  updateStatus,
  onClose,
  onPreferencesChange,
  onSwitchAccount,
  onAddAccount,
  onRemoveAccount,
  onBackup,
  onRestore,
  onCheckUpdates,
  onOpenRelease
}: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const locale: Locale = preferences.locale
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  const update = <Key extends keyof DesktopPreferences>(key: Key, value: DesktopPreferences[Key]) =>
    onPreferencesChange({ ...preferences, [key]: value })

  return (
    <dialog ref={dialogRef} className="panel-dialog settings-dialog" onCancel={onClose}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">PREFERENCES</p>
          <h2>{tx(locale, '设置与账号', 'Settings & accounts')}</h2>
        </div>
        <CloseButton locale={locale} onClick={onClose} />
      </div>

      <section>
        <h3>{tx(locale, '账号', 'Accounts')}</h3>
        <label>
          <span>{tx(locale, '当前 Telegram 账号', 'Current Telegram account')}</span>
          <select value={activeAccountId} onChange={(event) => onSwitchAccount(event.target.value)}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName}
                {account.authorized ? '' : tx(locale, '（未登录）', ' (signed out)')}
              </option>
            ))}
          </select>
        </label>
        <div className="inline-actions">
          <button className="secondary-button" type="button" onClick={onAddAccount}>
            {tx(locale, '添加账号', 'Add account')}
          </button>
          <button className="text-button danger-text" type="button" onClick={onRemoveAccount}>
            {tx(locale, '移除当前账号', 'Remove current account')}
          </button>
        </div>
      </section>

      <section>
        <h3>{tx(locale, '界面与安全', 'Interface & safety')}</h3>
        <label>
          <span>{tx(locale, '语言', 'Language')}</span>
          <select
            value={preferences.locale}
            onChange={(event) => update('locale', event.target.value as Locale)}
          >
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          <span>{tx(locale, '外观', 'Appearance')}</span>
          <select
            value={preferences.theme}
            onChange={(event) => update('theme', event.target.value as DesktopPreferences['theme'])}
          >
            <option value="system">{tx(locale, '跟随系统', 'System')}</option>
            <option value="light">{tx(locale, '浅色', 'Light')}</option>
            <option value="dark">{tx(locale, '深色', 'Dark')}</option>
          </select>
        </label>
        <label className="check-setting">
          <input
            checked={preferences.protectAdmins}
            type="checkbox"
            onChange={(event) => update('protectAdmins', event.target.checked)}
          />
          <span>
            {tx(locale, '默认保护管理员会话', 'Protect administrator conversations by default')}
          </span>
        </label>
        <label className="check-setting">
          <input
            checked={preferences.automaticUpdateChecks}
            type="checkbox"
            onChange={(event) => update('automaticUpdateChecks', event.target.checked)}
          />
          <span>{tx(locale, '启动时检查更新', 'Check for updates at startup')}</span>
        </label>
        <label className="check-setting">
          <input
            checked={preferences.crashReporting}
            type="checkbox"
            onChange={(event) => update('crashReporting', event.target.checked)}
          />
          <span>
            {tx(
              locale,
              '允许匿名崩溃报告（默认关闭）',
              'Allow anonymous crash reports (off by default)'
            )}
          </span>
        </label>
      </section>

      <section>
        <h3>{tx(locale, '本地数据', 'Local data')}</h3>
        <p>
          {tx(
            locale,
            '备份只包含筛选方案、白名单和偏好，不导出 API 凭证或 Telegram session。',
            'Backups include filters, allowlists and preferences. API credentials and Telegram sessions are never exported.'
          )}
        </p>
        <div className="inline-actions">
          <button className="secondary-button" type="button" onClick={onBackup}>
            {tx(locale, '导出备份', 'Export backup')}
          </button>
          <button className="secondary-button" type="button" onClick={onRestore}>
            {tx(locale, '恢复备份', 'Restore backup')}
          </button>
        </div>
      </section>

      <section>
        <h3>{tx(locale, '软件更新', 'Software updates')}</h3>
        <p>
          {updateStatus.message ??
            tx(
              locale,
              `当前版本 ${updateStatus.currentVersion}`,
              `Current version ${updateStatus.currentVersion}`
            )}
        </p>
        <div className="inline-actions">
          <button className="secondary-button" type="button" onClick={onCheckUpdates}>
            {updateStatus.state === 'checking'
              ? tx(locale, '正在检查…', 'Checking…')
              : tx(locale, '检查更新', 'Check for updates')}
          </button>
          {updateStatus.state === 'available' && updateStatus.releaseUrl ? (
            <button className="primary-button compact-button" type="button" onClick={onOpenRelease}>
              {tx(locale, '打开下载页面', 'Open download page')}
            </button>
          ) : null}
        </div>
      </section>
    </dialog>
  )
}
