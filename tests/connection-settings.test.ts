import { describe, expect, it } from 'vitest'
import {
  normalizeConnectionSettings,
  parseStoredSettings
} from '../electron/main/connection-settings'
import type { ConnectionSettingsInput } from '../shared/contracts'

const validHash = '0123456789abcdef0123456789abcdef'

const settings = (overrides: Partial<ConnectionSettingsInput> = {}): ConnectionSettingsInput => ({
  apiId: '123456',
  apiHash: validHash,
  proxy: { type: 'none', server: '', port: 0, username: '', password: '' },
  ...overrides
})

describe('normalizeConnectionSettings', () => {
  it('trims credentials and normalizes a direct connection', () => {
    expect(
      normalizeConnectionSettings(settings({ apiId: ' 123456 ', apiHash: ` ${validHash} ` }))
    ).toEqual({ version: 1, apiId: 123456, apiHash: validHash, proxy: null })
  })

  it.each(['socks5', 'http'] as const)('accepts a valid %s proxy', (type) => {
    expect(
      normalizeConnectionSettings(
        settings({
          proxy: {
            type,
            server: ' proxy.example.com ',
            port: 1080,
            username: 'user',
            password: 'secret'
          }
        })
      ).proxy
    ).toEqual({
      type,
      server: 'proxy.example.com',
      port: 1080,
      username: 'user',
      password: 'secret'
    })
  })

  it.each(['123', '-1234', '12ab34', '1234567890123'])('rejects invalid API ID %s', (apiId) => {
    expect(() => normalizeConnectionSettings(settings({ apiId }))).toThrow(/API ID/)
  })

  it.each(['short', 'z'.repeat(32), 'a'.repeat(31), 'a'.repeat(33)])(
    'rejects invalid API Hash %s',
    (apiHash) => {
      expect(() => normalizeConnectionSettings(settings({ apiHash }))).toThrow(/API Hash/)
    }
  )

  it.each(['https://proxy.example.com', 'proxy host', ''])('rejects proxy server %s', (server) => {
    expect(() =>
      normalizeConnectionSettings(
        settings({ proxy: { type: 'http', server, port: 8080, username: '', password: '' } })
      )
    ).toThrow(/代理服务器/)
  })

  it.each([0, 65536, 1.5])('rejects proxy port %s', (port) => {
    expect(() =>
      normalizeConnectionSettings(
        settings({
          proxy: { type: 'socks5', server: '127.0.0.1', port, username: '', password: '' }
        })
      )
    ).toThrow(/代理端口/)
  })
})

describe('parseStoredSettings', () => {
  it('accepts the versioned direct-connection format', () => {
    expect(
      parseStoredSettings({ version: 1, apiId: 123456, apiHash: validHash, proxy: null })
    ).toEqual({ version: 1, apiId: 123456, apiHash: validHash, proxy: null })
  })

  it.each([
    {},
    { version: 2, apiId: 123456, apiHash: validHash, proxy: null },
    { version: 1, apiId: 123456, apiHash: validHash, proxy: {} },
    { version: 1, apiId: 123456, apiHash: validHash, proxy: { type: 'unknown' } }
  ])('rejects malformed or tampered stored data', (value) => {
    expect(() => parseStoredSettings(value)).toThrow()
  })
})
