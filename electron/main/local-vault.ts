import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'

const algorithm = 'aes-256-gcm'
const keyLength = 32
const nonceLength = 12
const authenticationTagLength = 16
const envelopeMagic = Buffer.from('CCLV1', 'ascii')

const toObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}

const validateMasterKey = (key: Buffer): Buffer => {
  if (key.length !== keyLength) throw new Error('本地加密密钥无效，请恢复该文件或重新配置应用')
  return key
}

export const isLocalVaultEnvelope = (value: Buffer): boolean =>
  value.length >= envelopeMagic.length &&
  value.subarray(0, envelopeMagic.length).equals(envelopeMagic)

export class LocalVault {
  private readonly keyPath = join(app.getPath('userData'), 'local-vault.key')
  private keyTask: Promise<Buffer> | null = null

  async encryptString(value: string, purpose: string): Promise<Buffer> {
    const key = await this.getMasterKey()
    const nonce = randomBytes(nonceLength)
    const cipher = createCipheriv(algorithm, key, nonce, { authTagLength: authenticationTagLength })
    cipher.setAAD(Buffer.from(`ChatClear:${purpose}:v1`, 'utf8'))
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return Buffer.concat([envelopeMagic, nonce, cipher.getAuthTag(), ciphertext])
  }

  async decryptString(envelope: Buffer, purpose: string): Promise<string> {
    const minimumLength = envelopeMagic.length + nonceLength + authenticationTagLength
    if (!isLocalVaultEnvelope(envelope) || envelope.length < minimumLength) {
      throw new Error('本地加密数据格式无效')
    }

    const key = await this.getMasterKey()
    const nonceStart = envelopeMagic.length
    const tagStart = nonceStart + nonceLength
    const ciphertextStart = tagStart + authenticationTagLength
    const decipher = createDecipheriv(algorithm, key, envelope.subarray(nonceStart, tagStart), {
      authTagLength: authenticationTagLength
    })
    decipher.setAAD(Buffer.from(`ChatClear:${purpose}:v1`, 'utf8'))
    decipher.setAuthTag(envelope.subarray(tagStart, ciphertextStart))
    return Buffer.concat([
      decipher.update(envelope.subarray(ciphertextStart)),
      decipher.final()
    ]).toString('utf8')
  }

  private getMasterKey(): Promise<Buffer> {
    this.keyTask ??= this.readOrCreateMasterKey().catch((error) => {
      this.keyTask = null
      throw error
    })
    return this.keyTask
  }

  private async readOrCreateMasterKey(): Promise<Buffer> {
    try {
      const key = validateMasterKey(await readFile(this.keyPath))
      if (process.platform !== 'win32') await chmod(this.keyPath, 0o600)
      return key
    } catch (error) {
      if (toObject(error).code !== 'ENOENT') throw error
    }

    await mkdir(dirname(this.keyPath), { recursive: true, mode: 0o700 })
    const candidate = randomBytes(keyLength)
    try {
      await writeFile(this.keyPath, candidate, { flag: 'wx', mode: 0o600 })
      return candidate
    } catch (error) {
      if (toObject(error).code !== 'EEXIST') throw error
      return validateMasterKey(await readFile(this.keyPath))
    }
  }
}
