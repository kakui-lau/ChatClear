import type { ConnectionSettingsInput, ProxyType } from '../../shared/contracts'

interface StoredProxySettings {
  type: Exclude<ProxyType, 'none'>
  server: string
  port: number
  username: string
  password: string
}

export interface StoredConnectionSettings {
  version: 1
  apiId: number
  apiHash: string
  proxy: StoredProxySettings | null
}

const toObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const validateApiId = (value: string): number => {
  if (!/^\d{4,12}$/.test(value.trim())) {
    throw new Error('API ID 应为 4 至 12 位正整数')
  }
  const apiId = Number(value)
  if (!Number.isSafeInteger(apiId) || apiId <= 0) throw new Error('API ID 无效')
  return apiId
}

const validateApiHash = (value: string): string => {
  const apiHash = value.trim()
  if (!/^[a-f\d]{32}$/i.test(apiHash)) {
    throw new Error('API Hash 应为 32 位十六进制字符')
  }
  return apiHash
}

const validateProxy = (input: ConnectionSettingsInput['proxy']): StoredProxySettings | null => {
  if (input.type === 'none') return null
  if (input.type !== 'socks5' && input.type !== 'http') throw new Error('代理类型无效')

  const server = input.server.trim()
  if (!server || server.length > 255 || /\s|:\/\//.test(server)) {
    throw new Error('代理服务器地址无效，请只填写主机名或 IP')
  }
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error('代理端口应为 1 至 65535')
  }
  if (input.username.length > 256 || input.password.length > 256) {
    throw new Error('代理认证信息过长')
  }

  return {
    type: input.type,
    server,
    port: input.port,
    username: input.username,
    password: input.password
  }
}

export const normalizeConnectionSettings = (
  input: ConnectionSettingsInput
): StoredConnectionSettings => ({
  version: 1,
  apiId: validateApiId(input.apiId),
  apiHash: validateApiHash(input.apiHash),
  proxy: validateProxy(input.proxy)
})

export const parseStoredSettings = (value: unknown): StoredConnectionSettings => {
  const object = toObject(value)
  if (object.version !== 1) throw new Error('本地凭证格式无效，请重置连接设置')

  const proxy = toObject(object.proxy)
  let normalizedProxy: ConnectionSettingsInput['proxy']
  if (object.proxy === null) {
    normalizedProxy = { type: 'none', server: '', port: 0, username: '', password: '' }
  } else {
    const proxyType = proxy.type
    if (proxyType !== 'socks5' && proxyType !== 'http') {
      throw new Error('本地代理设置无效，请重置连接设置')
    }
    normalizedProxy = {
      type: proxyType,
      server: typeof proxy.server === 'string' ? proxy.server : '',
      port: typeof proxy.port === 'number' ? proxy.port : 0,
      username: typeof proxy.username === 'string' ? proxy.username : '',
      password: typeof proxy.password === 'string' ? proxy.password : ''
    }
  }

  return normalizeConnectionSettings({
    apiId: String(object.apiId ?? ''),
    apiHash: typeof object.apiHash === 'string' ? object.apiHash : '',
    proxy: normalizedProxy
  })
}
