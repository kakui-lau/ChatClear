import { useState, type FormEvent } from 'react'
import type { ConnectionSettingsInput, Locale, ProxyType } from '../../shared/contracts'
import { tx } from '../i18n'
import { Brand } from './Brand'

interface SetupRequiredProps {
  busy: boolean
  error: string | null
  locale: Locale
  onSave(settings: ConnectionSettingsInput): Promise<void>
}

export function SetupRequired({ busy, error, locale, onSave }: SetupRequiredProps) {
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [proxyType, setProxyType] = useState<ProxyType>('none')
  const [proxyServer, setProxyServer] = useState('127.0.0.1')
  const [proxyPort, setProxyPort] = useState('')
  const [proxyUsername, setProxyUsername] = useState('')
  const [proxyPassword, setProxyPassword] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    await onSave({
      apiId,
      apiHash,
      proxy: {
        type: proxyType,
        server: proxyServer,
        port: Number(proxyPort),
        username: proxyUsername,
        password: proxyPassword
      }
    })
  }

  return (
    <main className="auth-shell setup-shell">
      <section className="auth-card setup-card" aria-labelledby="setup-heading">
        <Brand />
        <p className="eyebrow">FIRST-RUN SETUP</p>
        <h1 id="setup-heading">{tx(locale, '配置 Telegram 连接', 'Connect to Telegram')}</h1>
        <p>
          {tx(
            locale,
            '使用你自己在 Telegram 申请的 API 凭证。ChatClear 不内置开发者凭证，保存后仅在本机加密存储。',
            'Use your own Telegram API credentials. ChatClear never bundles developer credentials; saved values are encrypted locally.'
          )}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field-row">
            <label htmlFor="api-id">API ID</label>
            <button
              className="inline-link"
              type="button"
              onClick={() => void window.chatclear.openExternal('https://my.telegram.org/apps')}
            >
              {tx(locale, '前往申请', 'Get credentials')}
            </button>
          </div>
          <input
            id="api-id"
            autoFocus
            autoComplete="off"
            inputMode="numeric"
            name="telegram-api-id"
            placeholder={tx(locale, '例如：12345678', 'For example: 12345678')}
            value={apiId}
            onChange={(event) => setApiId(event.target.value)}
          />

          <label htmlFor="api-hash">API Hash</label>
          <input
            id="api-hash"
            autoCapitalize="none"
            autoComplete="off"
            name="telegram-api-hash"
            spellCheck={false}
            type="password"
            placeholder={tx(
              locale,
              '填写 32 位十六进制字符…',
              'Enter the 32-character hexadecimal value…'
            )}
            value={apiHash}
            onChange={(event) => setApiHash(event.target.value)}
          />

          <label htmlFor="proxy-type">
            {tx(locale, '网络代理（可选）', 'Network proxy (optional)')}
          </label>
          <select
            id="proxy-type"
            name="proxy-type"
            value={proxyType}
            onChange={(event) => setProxyType(event.target.value as ProxyType)}
          >
            <option value="none">{tx(locale, '不使用代理', 'No proxy')}</option>
            <option value="socks5">SOCKS5</option>
            <option value="http">HTTP CONNECT</option>
          </select>

          {proxyType !== 'none' ? (
            <div className="proxy-fields">
              <label htmlFor="proxy-server">{tx(locale, '代理地址', 'Proxy server')}</label>
              <input
                id="proxy-server"
                autoComplete="off"
                name="proxy-server"
                placeholder={tx(locale, '例如：127.0.0.1', 'For example: 127.0.0.1')}
                value={proxyServer}
                onChange={(event) => setProxyServer(event.target.value)}
              />
              <label htmlFor="proxy-port">{tx(locale, '端口', 'Port')}</label>
              <input
                id="proxy-port"
                inputMode="numeric"
                max="65535"
                min="1"
                name="proxy-port"
                placeholder={tx(locale, '例如：7890', 'For example: 7890')}
                type="number"
                value={proxyPort}
                onChange={(event) => setProxyPort(event.target.value)}
              />
              <label htmlFor="proxy-username">
                {tx(locale, '用户名（可选）', 'Username (optional)')}
              </label>
              <input
                id="proxy-username"
                autoComplete="off"
                name="proxy-username"
                spellCheck={false}
                value={proxyUsername}
                onChange={(event) => setProxyUsername(event.target.value)}
              />
              <label htmlFor="proxy-password">
                {tx(locale, '密码（可选）', 'Password (optional)')}
              </label>
              <input
                id="proxy-password"
                autoComplete="off"
                name="proxy-password"
                type="password"
                value={proxyPassword}
                onChange={(event) => setProxyPassword(event.target.value)}
              />
              <p className="field-hint">
                {tx(
                  locale,
                  '请填写代理软件实际显示的 SOCKS5 或 HTTP 端口。',
                  'Use the SOCKS5 or HTTP port displayed by your proxy application.'
                )}
              </p>
            </div>
          ) : null}

          <button
            className="primary-button"
            disabled={
              busy ||
              !apiId.trim() ||
              !apiHash.trim() ||
              (proxyType !== 'none' && (!proxyServer.trim() || !proxyPort))
            }
            type="submit"
          >
            {busy
              ? tx(locale, '正在安全保存…', 'Saving securely…')
              : tx(locale, '保存连接设置', 'Save connection settings')}
          </button>
        </form>

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
              'API 凭证及代理认证信息由操作系统安全存储加密，不会写入安装包或上传。',
              'API credentials and proxy authentication are encrypted by the operating system and never bundled or uploaded.'
            )}
          </p>
        </div>
      </section>
    </main>
  )
}
