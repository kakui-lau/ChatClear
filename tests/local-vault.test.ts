import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testPath = vi.hoisted(() => ({ value: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: () => testPath.value
  }
}))

import { isLocalVaultEnvelope, LocalVault } from '../electron/main/local-vault'

beforeEach(async () => {
  testPath.value = await mkdtemp(join(tmpdir(), 'chatclear-vault-'))
})

afterEach(async () => {
  await rm(testPath.value, { recursive: true, force: true })
})

describe('LocalVault', () => {
  it('encrypts and decrypts without storing plaintext', async () => {
    const vault = new LocalVault()
    const encrypted = await vault.encryptString('api-hash-secret', 'connection-settings')

    expect(isLocalVaultEnvelope(encrypted)).toBe(true)
    expect(encrypted.toString()).not.toContain('api-hash-secret')
    await expect(vault.decryptString(encrypted, 'connection-settings')).resolves.toBe(
      'api-hash-secret'
    )
    expect((await readFile(join(testPath.value, 'local-vault.key'))).length).toBe(32)
  })

  it('rejects tampering and cross-purpose ciphertext reuse', async () => {
    const vault = new LocalVault()
    const encrypted = await vault.encryptString('secret', 'connection-settings')
    const tampered = Buffer.from(encrypted)
    tampered[tampered.length - 1] ^= 1

    await expect(vault.decryptString(tampered, 'connection-settings')).rejects.toThrow()
    await expect(vault.decryptString(encrypted, 'tdlib-database-key:default')).rejects.toThrow()
  })

  it.runIf(process.platform !== 'win32')('repairs restrictive master-key permissions', async () => {
    const firstVault = new LocalVault()
    await firstVault.encryptString('secret', 'connection-settings')
    const keyPath = join(testPath.value, 'local-vault.key')
    await chmod(keyPath, 0o644)

    const secondVault = new LocalVault()
    await secondVault.encryptString('secret', 'connection-settings')

    expect((await stat(keyPath)).mode & 0o777).toBe(0o600)
  })
})
