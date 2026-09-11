import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { ConnectionSettingsInput } from '../../shared/contracts'
import {
  normalizeConnectionSettings,
  parseStoredSettings,
  type StoredConnectionSettings
} from './connection-settings'
import { LocalVault } from './local-vault'

const toObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}

export class CredentialStore {
  private readonly filePath = join(app.getPath('userData'), 'connection-settings.local-v1.bin')
  private readonly legacyFilePath = join(app.getPath('userData'), 'connection-settings.bin')
  private readonly localVault = new LocalVault()

  async load(): Promise<StoredConnectionSettings | null> {
    try {
      const encrypted = await readFile(this.filePath)
      return parseStoredSettings(
        JSON.parse(await this.localVault.decryptString(encrypted, 'connection-settings'))
      )
    } catch (error) {
      if (toObject(error).code === 'ENOENT') return null
      throw new Error('本地凭证无法读取或已损坏，请重置连接设置', { cause: error })
    }
  }

  async hasLegacySettings(): Promise<boolean> {
    try {
      return (await stat(this.legacyFilePath)).isFile()
    } catch (error) {
      if (toObject(error).code === 'ENOENT') return false
      throw error
    }
  }

  async save(input: ConnectionSettingsInput): Promise<StoredConnectionSettings> {
    const settings = normalizeConnectionSettings(input)
    const encrypted = await this.localVault.encryptString(
      JSON.stringify(settings),
      'connection-settings'
    )
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 })
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
    try {
      await writeFile(temporaryPath, encrypted, { flag: 'wx', mode: 0o600 })
      await rename(temporaryPath, this.filePath)
      await unlink(this.legacyFilePath).catch(() => undefined)
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
    return settings
  }

  async clear(): Promise<void> {
    await Promise.all(
      [this.filePath, this.legacyFilePath].map(async (path) => {
        try {
          await unlink(path)
        } catch (error) {
          if (toObject(error).code !== 'ENOENT') throw error
        }
      })
    )
  }
}
