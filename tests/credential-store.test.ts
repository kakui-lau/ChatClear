import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionSettingsInput } from '../shared/contracts'

const testPath = vi.hoisted(() => ({ value: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: () => testPath.value
  }
}))

import { CredentialStore } from '../electron/main/credential-store'

const input: ConnectionSettingsInput = {
  apiId: '123456',
  apiHash: '0123456789abcdef0123456789abcdef',
  proxy: {
    type: 'socks5',
    server: '127.0.0.1',
    port: 7890,
    username: 'proxy-user',
    password: 'proxy-secret'
  }
}

beforeEach(async () => {
  testPath.value = await mkdtemp(join(tmpdir(), 'chatclear-credentials-'))
})

afterEach(async () => {
  await rm(testPath.value, { recursive: true, force: true })
})

describe('CredentialStore', () => {
  it('persists locally encrypted connection settings', async () => {
    const store = new CredentialStore()
    await expect(store.save(input)).resolves.toMatchObject({ apiId: 123456 })

    const bytes = await readFile(join(testPath.value, 'connection-settings.local-v1.bin'))
    expect(bytes.toString()).not.toContain(input.apiHash)
    expect(bytes.toString()).not.toContain(input.proxy.password)
    await expect(new CredentialStore().load()).resolves.toMatchObject({
      apiId: 123456,
      apiHash: input.apiHash,
      proxy: { password: input.proxy.password }
    })
  })

  it('returns no settings when the new local-encryption file does not exist', async () => {
    await expect(new CredentialStore().load()).resolves.toBeNull()
  })

  it('detects legacy keychain settings without reading or decrypting them', async () => {
    await writeFile(join(testPath.value, 'connection-settings.bin'), 'legacy-keychain-data')
    const store = new CredentialStore()

    await expect(store.hasLegacySettings()).resolves.toBe(true)
    await expect(store.load()).resolves.toBeNull()
  })
})
