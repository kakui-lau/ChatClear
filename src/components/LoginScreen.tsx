import { useState, type FormEvent } from 'react'
import type { AuthEvent, AuthInputKind } from '../../shared/contracts'
import { Brand } from './Brand'

interface LoginScreenProps {
  authEvent: AuthEvent
  busy: boolean
  error: string | null
  proxyEnabled: boolean
  onStart(phoneNumber: string): Promise<void>
  onSubmit(kind: AuthInputKind, value: string): Promise<void>
  onChangeSettings(): Promise<void>
}

const stageDetails: Partial<
  Record<
    AuthEvent['stage'],
    { kind: AuthInputKind; label: string; type: string; placeholder: string }
  >
> = {
  code: {
    kind: 'code',
    label: '登录验证码',
    type: 'text',
    placeholder: '输入 Telegram 中收到的验证码…'
  },
  password: {
    kind: 'password',
    label: '两步验证密码',
    type: 'password',
    placeholder: '输入你的两步验证密码…'
  },
  email: { kind: 'email', label: '验证邮箱', type: 'email', placeholder: '例如：name@example.com' },
  emailCode: {
    kind: 'emailCode',
    label: '邮箱验证码',
    type: 'text',
    placeholder: '输入邮箱验证码…'
  }
}

export function LoginScreen({
  authEvent,
  busy,
  error,
  proxyEnabled,
  onStart,
  onSubmit,
  onChangeSettings
}: LoginScreenProps) {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [authValue, setAuthValue] = useState('')
  const details = stageDetails[authEvent.stage]

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
          <h1 id="login-heading">安静地整理你的群组列表</h1>
          <p>
            ChatClear（群清）使用 Telegram API。登录信息、群组数据和操作记录只保存在这台电脑上。
          </p>
        </div>

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
            {authEvent.hint ? <p className="field-hint">密码提示：{authEvent.hint}</p> : null}
            <button className="primary-button" disabled={busy || !authValue.trim()} type="submit">
              {busy ? '正在验证…' : '验证并继续'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handlePhoneSubmit}>
            <label htmlFor="phone-number">Telegram 手机号</label>
            <input
              id="phone-number"
              autoFocus
              autoComplete="tel"
              inputMode="tel"
              name="phone-number"
              spellCheck={false}
              type="tel"
              placeholder="例如：+8613812345678"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
            />
            <p className="field-hint">请包含国家或地区代码。验证码通常发送到 Telegram 客户端内。</p>
            <button className="primary-button" disabled={busy || !phoneNumber.trim()} type="submit">
              {busy ? '正在连接…' : '发送验证码'}
            </button>
          </form>
        )}

        {authEvent.stage === 'otherDevice' ? (
          <div className="notice" role="status">
            {authEvent.message}
          </div>
        ) : null}
        {authEvent.message && authEvent.stage !== 'idle' && authEvent.stage !== 'otherDevice' ? (
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
          <p>不会读取消息正文，不会上传 session，也不会在未经确认时执行退出操作。</p>
        </div>
        <button className="connection-settings-button" type="button" onClick={onChangeSettings}>
          连接设置{proxyEnabled ? ' · 已启用代理' : ''}
        </button>
      </section>
    </main>
  )
}
