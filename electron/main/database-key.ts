import { randomBytes } from 'node:crypto'

const keyLength = 32

export const createDatabaseEncryptionKey = (): string => randomBytes(keyLength).toString('base64')

export const normalizeDatabaseEncryptionKey = (value: string): string => {
  if (!/^[A-Za-z\d+/_-]{43}=?$/.test(value)) {
    throw new Error('本地 Telegram 数据库密钥格式无效')
  }

  const decoded = Buffer.from(value, 'base64')
  if (decoded.length !== keyLength) throw new Error('本地 Telegram 数据库密钥长度无效')
  return decoded.toString('base64')
}
