import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { AccountSummary, UserProfile } from '../../shared/contracts'

interface AccountRegistry {
  version: 1
  activeAccountId: string
  accounts: AccountSummary[]
}

const defaultAccount = (): AccountSummary => ({
  id: 'default',
  displayName: 'Telegram 账号',
  username: null,
  authorized: false,
  createdAt: Date.now()
})

const toObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const parseRegistry = (value: unknown): AccountRegistry => {
  const object = toObject(value)
  if (object.version !== 1 || !Array.isArray(object.accounts)) throw new Error('账号索引格式无效')
  const accounts = object.accounts.flatMap((entry): AccountSummary[] => {
    const account = toObject(entry)
    if (
      typeof account.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(account.id) ||
      typeof account.displayName !== 'string' ||
      typeof account.authorized !== 'boolean' ||
      typeof account.createdAt !== 'number'
    ) {
      return []
    }
    return [
      {
        id: account.id,
        displayName: account.displayName.slice(0, 100),
        username: typeof account.username === 'string' ? account.username.slice(0, 100) : null,
        authorized: account.authorized,
        createdAt: account.createdAt
      }
    ]
  })
  if (accounts.length === 0) accounts.push(defaultAccount())
  const activeAccountId =
    typeof object.activeAccountId === 'string' &&
    accounts.some((account) => account.id === object.activeAccountId)
      ? object.activeAccountId
      : accounts[0].id
  return { version: 1, activeAccountId, accounts }
}

export class AccountStore {
  private readonly filePath = join(app.getPath('userData'), 'accounts.json')
  private registry: AccountRegistry | null = null

  async list(): Promise<AccountSummary[]> {
    return [...(await this.load()).accounts]
  }

  async getActiveId(): Promise<string> {
    return (await this.load()).activeAccountId
  }

  async createAndActivate(): Promise<string> {
    const registry = await this.load()
    if (registry.accounts.length >= 10) throw new Error('最多可添加 10 个账号')
    const id = randomUUID()
    registry.accounts.push({
      id,
      displayName: `新账号 ${registry.accounts.length + 1}`,
      username: null,
      authorized: false,
      createdAt: Date.now()
    })
    registry.activeAccountId = id
    await this.save(registry)
    return id
  }

  async switchTo(accountId: string): Promise<void> {
    const registry = await this.load()
    if (!registry.accounts.some((account) => account.id === accountId)) {
      throw new Error('找不到要切换的账号')
    }
    registry.activeAccountId = accountId
    await this.save(registry)
  }

  async updateActiveProfile(profile: UserProfile): Promise<void> {
    const registry = await this.load()
    await this.updateProfile(registry.activeAccountId, profile)
  }

  async updateProfile(accountId: string, profile: UserProfile): Promise<void> {
    const registry = await this.load()
    const account = registry.accounts.find((item) => item.id === accountId)
    if (!account) throw new Error('账号不存在')
    account.displayName = profile.displayName
    account.username = profile.username
    account.authorized = true
    await this.save(registry)
  }

  async markActiveLoggedOut(): Promise<void> {
    const registry = await this.load()
    await this.markLoggedOut(registry.activeAccountId)
  }

  async markLoggedOut(accountId: string): Promise<void> {
    const registry = await this.load()
    const account = registry.accounts.find((item) => item.id === accountId)
    if (!account) return
    account.authorized = false
    await this.save(registry)
  }

  async remove(accountId: string): Promise<{ removed: AccountSummary; nextActiveId: string }> {
    const registry = await this.load()
    const removed = registry.accounts.find((account) => account.id === accountId)
    if (!removed) throw new Error('找不到要删除的账号')
    registry.accounts = registry.accounts.filter((account) => account.id !== accountId)
    if (registry.accounts.length === 0) registry.accounts.push(defaultAccount())
    if (registry.activeAccountId === accountId) registry.activeAccountId = registry.accounts[0].id
    await this.save(registry)
    return { removed, nextActiveId: registry.activeAccountId }
  }

  private async load(): Promise<AccountRegistry> {
    if (this.registry) return this.registry
    try {
      this.registry = parseRegistry(JSON.parse(await readFile(this.filePath, 'utf8')))
    } catch (error) {
      if (toObject(error).code !== 'ENOENT') {
        throw new Error('本地账号索引无法读取或已损坏', { cause: error })
      }
      this.registry = { version: 1, activeAccountId: 'default', accounts: [defaultAccount()] }
      await this.save(this.registry)
    }
    return this.registry
  }

  private async save(registry: AccountRegistry): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 })
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
    try {
      await writeFile(temporaryPath, JSON.stringify(registry, null, 2), { flag: 'wx', mode: 0o600 })
      await rename(temporaryPath, this.filePath)
      this.registry = registry
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }
}
