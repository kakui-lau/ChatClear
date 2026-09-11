import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'
import type { ConnectionSettingsInput } from '../../shared/contracts'
import {
  normalizeConnectionSettings,
  parseStoredSettings,
  type StoredConnectionSettings
} from './connection-settings'
import { assertSecureStorageAvailable } from './secure-storage'

const toObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}

export class CredentialStore {
  private readonly filePath = join(app.getPath('userData'), 'connection-settings.bin')

  async load(): Promise<StoredConnectionSettings | null> {
    assertSecureStorageAvailable('读取本地凭证')
    try {
      const encrypted = await readFile(this.filePath)
      return parseStoredSettings(JSON.parse(safeStorage.decryptString(encrypted)))
    } catch (error) {
      if (toObject(error).code === 'ENOENT') return null
      throw new Error('本地凭证无法读取或已损坏，请重置连接设置', { cause: error })
    }
  }

  async save(input: ConnectionSettingsInput): Promise<StoredConnectionSettings> {
    assertSecureStorageAvailable('保存 API 凭证')
    const settings = normalizeConnectionSettings(input)
    const encrypted = safeStorage.encryptString(JSON.stringify(settings))
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 })
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
    try {
      await writeFile(temporaryPath, encrypted, { flag: 'wx', mode: 0o600 })
      await rename(temporaryPath, this.filePath)
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
    return settings
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.filePath)
    } catch (error) {
      if (toObject(error).code !== 'ENOENT') throw error
    }
  }
}
