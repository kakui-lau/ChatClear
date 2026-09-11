import { useState, type FormEvent } from 'react'
import type { AccountSummary, AuthEvent, AuthInputKind, Locale } from '../../shared/contracts'
import { tx } from '../i18n'
import { Brand } from './Brand'

interface LoginScreenProps {
  accounts: AccountSummary[]
  activeAccountId: string
  authEvent: AuthEvent
  busy: boolean
  error: string | null
  locale: Locale
  proxyEnabled: boolean
  onStart(phoneNumber: string): Promise<void>
  onSubmit(kind: AuthInputKind, value: string): Promise<void>
  onChangeSettings(): Promise<void>
  onSwitchAccount(accountId: string): Promise<void>
  onAddAccount(): Promise<void>
}

const getStageDetails = (
  locale: Locale,
  stage: AuthEvent['stage']
): { kind: AuthInputKind; label: string; type: string; placeholder: string } | undefined => {
  switch (stage) {
    case 'code':
      return {
        kind: 'code',
        label: tx(locale, '登录验证码', 'Login code'),
        type: 'text',
        placeholder: tx(locale, '输入 Telegram 中收到的验证码…', 'Enter the code from Telegram…')
      }
    case 'password':
      return {
        kind: 'password',
        label: tx(locale, '两步验证密码', 'Two-step verification password'),
        type: 'password',
        placeholder: tx(
          locale,
          '输入你的两步验证密码…',
          'Enter your two-step verification password…'
        )
      }
    case 'email':
      return {
        kind: 'email',
        label: tx(locale, '验证邮箱', 'Verification email'),
        type: 'email',
        placeholder: 'name@example.com'
      }
    case 'emailCode':
      return {
        kind: 'emailCode',
        label: tx(locale, '邮箱验证码', 'Email verification code'),
        type: 'text',
        placeholder: tx(locale, '输入邮箱验证码…', 'Enter the email verification code…')
      }
    default:
      return undefined
  }
}

export function LoginScreen({
  accounts,
  activeAccountId,
  authEvent,
  busy,
  error,
  locale,
  proxyEnabled,
  onStart,
  onSubmit,
  onChangeSettings,
  onSwitchAccount,
  onAddAccount
}: LoginScreenProps) {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [authValue, setAuthValue] = useState('')
  const details = getStageDetails(locale, authEvent.stage)

  const handlePhoneSubmit = async (event: FormEvent) => {
    event.preventDefault()
    await onStart(phoneNumber)
  }

  const handleAuthSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!details) return
    await onSubmit(details.kind, authValue)
    setAuthValue('')
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-heading">
        <Brand />
        <div className="auth-copy">
          <p className="eyebrow">LOCAL-FIRST DESKTOP UTILITY</p>
          <h1 id="login-heading">
            {tx(locale, '安静地整理你的群组列表', 'A calmer Telegram community list')}
          </h1>
          <p>
            {tx(
              locale,
              'ChatClear（群清）使用 Telegram API。登录信息、群组数据和操作记录只保存在这台电脑上。',
              'ChatClear uses the Telegram API. Login data, community metadata and activity history stay on this computer.'
            )}
          </p>
        </div>

        {accounts.length > 1 ? (
          <label className="account-picker">
            <span>{tx(locale, '登录账号', 'Account')}</span>
            <select
              disabled={busy}
              value={activeAccountId}
              onChange={(event) => void onSwitchAccount(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.displayName}
                  {account.authorized ? '' : tx(locale, '（未登录）', ' (signed out)')}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {details ? (
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label htmlFor="auth-value">{details.label}</label>
            <input
              id="auth-value"
              autoFocus
              autoComplete={details.type === 'password' ? 'current-password' : 'one-time-code'}
              inputMode={
                details.kind.includes('Code') || details.kind === 'code' ? 'numeric' : 'text'
              }
              name={details.kind}
              spellCheck={false}
              type={details.type}
              placeholder={details.placeholder}
              value={authValue}
              onChange={(event) => setAuthValue(event.target.value)}
            />
            {authEvent.hint ? (
              <p className="field-hint">
                {tx(locale, '密码提示', 'Password hint')}：{authEvent.hint}
              </p>
            ) : null}
            <button className="primary-button" disabled={busy || !authValue.trim()} type="submit">
              {busy
                ? tx(locale, '正在验证…', 'Verifying…')
                : tx(locale, '验证并继续', 'Verify & continue')}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handlePhoneSubmit}>
            <label htmlFor="phone-number">
              {tx(locale, 'Telegram 手机号', 'Telegram phone number')}
            </label>
            <input
              id="phone-number"
              autoFocus
              autoComplete="tel"
              inputMode="tel"
              name="phone-number"
              spellCheck={false}
              type="tel"
              placeholder={tx(locale, '例如：+8613812345678', 'For example: +12025550123')}
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
            />
            <p className="field-hint">
              {tx(
                locale,
                '请包含国家或地区代码。验证码通常发送到 Telegram 客户端内。',
                'Include the country or region code. Telegram usually sends the code to another signed-in client.'
              )}
            </p>
            <button className="primary-button" disabled={busy || !phoneNumber.trim()} type="submit">
              {busy
                ? tx(locale, '正在连接…', 'Connecting…')
                : tx(locale, '发送验证码', 'Send code')}
            </button>
          </form>
        )}

        {authEvent.stage === 'otherDevice' ? (
          <div className="notice" role="status">
            {authEvent.message}
          </div>
        ) : null}
        {authEvent.message &&
        authEvent.stage !== 'idle' &&
        authEvent.stage !== 'otherDevice' &&
        authEvent.stage !== 'error' ? (
          <p className="status-line" role="status">
            {authEvent.message}
          </p>
        ) : null}
        {error ? (
          <p className="error-line" role="alert">
            {error}
          </p>
        ) : null}

        <div className="privacy-note">
          <span aria-hidden="true">◆</span>
          <p>
            {tx(
              locale,
              '不会读取消息正文，不会上传 session，也不会在未经确认时执行退出操作。',
              'ChatClear never reads message bodies, uploads sessions, or leaves conversations without confirmation.'
            )}
          </p>
        </div>
        <div className="login-actions">
          <button className="connection-settings-button" type="button" onClick={onChangeSettings}>
            {tx(locale, '连接设置', 'Connection settings')}
            {proxyEnabled ? tx(locale, ' · 已启用代理', ' · Proxy enabled') : ''}
          </button>
          <button className="connection-settings-button" type="button" onClick={onAddAccount}>
            {tx(locale, '添加账号', 'Add account')}
          </button>
        </div>
      </section>
    </main>
  )
}
