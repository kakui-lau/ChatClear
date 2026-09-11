import { describe, expect, it } from 'vitest'
import {
  createDatabaseEncryptionKey,
  normalizeDatabaseEncryptionKey
} from '../electron/main/database-key'

describe('TDLib database encryption key', () => {
  it('creates a padded 32-byte standard Base64 value', () => {
    const key = createDatabaseEncryptionKey()
    expect(key).toMatch(/^[A-Za-z\d+/]{43}=$/)
    expect(Buffer.from(key, 'base64')).toHaveLength(32)
  })

  it('converts the legacy unpadded Base64URL format', () => {
    const source = Buffer.alloc(32, 0xff)
    const legacy = source.toString('base64url')
    const normalized = normalizeDatabaseEncryptionKey(legacy)

    expect(normalized).toBe(source.toString('base64'))
    expect(normalized).toHaveLength(44)
  })

  it.each(['', 'not-a-key', 'a'.repeat(42), 'a'.repeat(45)])('rejects malformed key %s', (key) =>
    expect(() => normalizeDatabaseEncryptionKey(key)).toThrow(/数据库密钥/)
  )
})
