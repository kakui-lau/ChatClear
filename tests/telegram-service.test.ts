import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthEvent, ConnectionSettingsInput, LeaveProgress } from '../shared/contracts'

const mocks = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  configure: vi.fn(),
  createClient: vi.fn(),
  invoke: vi.fn(),
  isClosed: vi.fn(() => false),
  login: vi.fn(),
  loadSettings: vi.fn(async () => null),
  saveSettings: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/chatclear-test',
    getVersion: () => '0.2.1',
    isPackaged: false
  },
  safeStorage: {}
}))

vi.mock('prebuilt-tdlib', () => ({ getTdjson: () => '/tmp/libtdjson.dylib' }))

vi.mock('tdl', () => ({
  configure: mocks.configure,
  createClient: mocks.createClient
}))

vi.mock('../electron/main/credential-store', () => ({
  CredentialStore: class {
    load = mocks.loadSettings
    save = mocks.saveSettings
    clear = vi.fn(async () => undefined)
  }
}))

import { TelegramService } from '../electron/main/telegram-service'

const input: ConnectionSettingsInput = {
  apiId: '123456',
  apiHash: '0123456789abcdef0123456789abcdef',
  proxy: {
    type: 'socks5',
    server: '127.0.0.1',
    port: 7890,
    username: '',
    password: ''
  }
}

const storedSettings = {
  version: 1 as const,
  apiId: 123456,
  apiHash: input.apiHash,
  proxy: {
    type: 'socks5' as const,
    server: '127.0.0.1',
    port: 7890,
    username: '',
    password: ''
  }
}

const createService = () => {
  const events: Array<AuthEvent | LeaveProgress> = []
  return { events, service: new TelegramService((event) => events.push(event)) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isClosed.mockReturnValue(false)
  mocks.saveSettings.mockResolvedValue(storedSettings)
  mocks.createClient.mockReturnValue({
    close: mocks.close,
    invoke: mocks.invoke,
    isClosed: mocks.isClosed,
    login: mocks.login,
    on: vi.fn()
  })
})

afterEach(() => vi.useRealTimers())

describe('TelegramService connection orchestration', () => {
  it('saves settings without waiting for TDLib or the proxy', async () => {
    const { service } = createService()

    await expect(service.saveConnectionSettings(input)).resolves.toEqual({
      configured: true,
      authorized: false,
      profile: null,
      proxyEnabled: true
    })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns a usable startup state when client initialization exceeds three seconds', async () => {
    vi.useFakeTimers()
    mocks.invoke.mockImplementation(() => new Promise(() => undefined))
    const { service } = createService()
    await service.saveConnectionSettings(input)

    const statusTask = service.getStatus()
    await vi.advanceTimersByTimeAsync(3_000)

    await expect(statusTask).resolves.toMatchObject({ configured: true, authorized: false })
  })

  it('starts the login timeout before client and proxy initialization completes', async () => {
    vi.useFakeTimers()
    mocks.saveSettings.mockResolvedValue({ ...storedSettings, proxy: null })
    mocks.invoke.mockImplementation(() => new Promise(() => undefined))
    const { events, service } = createService()
    await service.saveConnectionSettings(input)

    await service.startLogin('+8613812345678')
    await vi.advanceTimersByTimeAsync(25_000)

    expect(events).toContainEqual({ stage: 'connecting', message: '正在连接 Telegram…' })
    expect(events).toContainEqual({
      stage: 'error',
      message: '连接 Telegram 超时。请检查网络，或返回连接设置配置可用的代理后重试。'
    })
    expect(mocks.login).not.toHaveBeenCalled()
  })
})
