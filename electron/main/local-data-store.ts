import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type {
  AccountPreferences,
  ActivityLogEntry,
  BatchAction,
  BatchTask,
  DesktopPreferences,
  Observation,
  SavedFilter
} from '../../shared/contracts'

interface AccountLocalData {
  preferences: AccountPreferences
  history: ActivityLogEntry[]
  pendingBatch: BatchTask | null
  failedBatch: { action: BatchAction; chatIds: number[] } | null
}

interface LocalDataFile {
  version: 1
  desktop: DesktopPreferences
  accounts: Record<string, AccountLocalData>
}

interface LocalDataBackup {
  version: 1
  desktop: DesktopPreferences
  accounts: Record<string, { preferences: AccountPreferences }>
}

const batchActions: BatchAction[] = ['leave', 'archive', 'unarchive', 'mute', 'clearHistory']

const isBatchAction = (value: unknown): value is BatchAction =>
  batchActions.includes(value as BatchAction)

const defaultDesktopPreferences = (): DesktopPreferences => ({
  version: 1,
  locale: 'zh-CN',
  theme: 'system',
  protectAdmins: true,
  automaticUpdateChecks: true,
  crashReporting: false
})

const defaultAccountPreferences = (): AccountPreferences => ({
  version: 1,
  protectedIds: [],
  savedFilters: [],
  observations: []
})

const defaultAccountData = (): AccountLocalData => ({
  preferences: defaultAccountPreferences(),
  history: [],
  pendingBatch: null,
  failedBatch: null
})

const toObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const safeIds = (value: unknown): number[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((id): id is number => Number.isSafeInteger(id)))].slice(0, 10_000)
    : []

const parseFilters = (value: unknown): SavedFilter[] =>
  !Array.isArray(value)
    ? []
    : value.flatMap((entry): SavedFilter[] => {
        const filter = toObject(entry)
        if (typeof filter.id !== 'string' || typeof filter.name !== 'string') return []
        const kind = filter.kind === 'group' || filter.kind === 'channel' ? filter.kind : 'all'
        const location =
          filter.location === 'main' || filter.location === 'archive' ? filter.location : 'all'
        const role =
          filter.role === 'owner' || filter.role === 'admin' || filter.role === 'member'
            ? filter.role
            : 'all'
        const observation =
          filter.observation === 'watching' || filter.observation === 'due'
            ? filter.observation
            : 'all'
        return [
          {
            id: filter.id.slice(0, 64),
            name: filter.name.slice(0, 60),
            search: typeof filter.search === 'string' ? filter.search.slice(0, 200) : '',
            exclude: typeof filter.exclude === 'string' ? filter.exclude.slice(0, 200) : '',
            kind,
            location,
            role,
            observation,
            inactiveDays:
              typeof filter.inactiveDays === 'number' && filter.inactiveDays >= 0
                ? Math.min(filter.inactiveDays, 3650)
                : 0,
            minMembers:
              typeof filter.minMembers === 'number' && filter.minMembers >= 0
                ? filter.minMembers
                : null,
            maxMembers:
              typeof filter.maxMembers === 'number' && filter.maxMembers >= 0
                ? filter.maxMembers
                : null
          }
        ]
      })

const parseObservations = (value: unknown): Observation[] =>
  !Array.isArray(value)
    ? []
    : value.flatMap((entry): Observation[] => {
        const observation = toObject(entry)
        return Number.isSafeInteger(observation.chatId) && typeof observation.dueAt === 'number'
          ? [{ chatId: observation.chatId as number, dueAt: observation.dueAt }]
          : []
      })

const normalizeAccountPreferences = (value: unknown): AccountPreferences => {
  const preferences = toObject(value)
  return {
    version: 1,
    protectedIds: safeIds(preferences.protectedIds),
    savedFilters: parseFilters(preferences.savedFilters).slice(0, 50),
    observations: parseObservations(preferences.observations).slice(0, 10_000)
  }
}

const normalizeDesktopPreferences = (value: unknown): DesktopPreferences => {
  const preferences = toObject(value)
  const defaults = defaultDesktopPreferences()
  return {
    version: 1,
    locale: preferences.locale === 'en' ? 'en' : defaults.locale,
    theme:
      preferences.theme === 'light' || preferences.theme === 'dark'
        ? preferences.theme
        : defaults.theme,
    protectAdmins:
      typeof preferences.protectAdmins === 'boolean'
        ? preferences.protectAdmins
        : defaults.protectAdmins,
    automaticUpdateChecks:
      typeof preferences.automaticUpdateChecks === 'boolean'
        ? preferences.automaticUpdateChecks
        : defaults.automaticUpdateChecks,
    crashReporting:
      typeof preferences.crashReporting === 'boolean'
        ? preferences.crashReporting
        : defaults.crashReporting
  }
}

const parseHistory = (value: unknown, accountId: string): ActivityLogEntry[] =>
  !Array.isArray(value)
    ? []
    : value.slice(0, 5_000).flatMap((entry): ActivityLogEntry[] => {
        const item = toObject(entry)
        if (
          typeof item.id !== 'string' ||
          !isBatchAction(item.action) ||
          !Number.isSafeInteger(item.chatId) ||
          typeof item.title !== 'string' ||
          (item.status !== 'success' && item.status !== 'failed') ||
          typeof item.createdAt !== 'number' ||
          !Number.isFinite(item.createdAt)
        ) {
          return []
        }
        return [
          {
            id: item.id.slice(0, 100),
            accountId,
            action: item.action,
            chatId: item.chatId as number,
            title: item.title.slice(0, 300),
            status: item.status,
            createdAt: item.createdAt,
            ...(typeof item.message === 'string' ? { message: item.message.slice(0, 300) } : {})
          }
        ]
      })

const parsePendingBatch = (value: unknown): BatchTask | null => {
  const task = toObject(value)
  if (
    typeof task.id !== 'string' ||
    !isBatchAction(task.action) ||
    typeof task.createdAt !== 'number' ||
    !Number.isFinite(task.createdAt)
  ) {
    return null
  }
  const chatIds = safeIds(task.chatIds).slice(0, 1_000)
  if (chatIds.length === 0) return null
  const chatIdSet = new Set(chatIds)
  const remainingChatIds = safeIds(task.remainingChatIds)
    .filter((id) => chatIdSet.has(id))
    .slice(0, 1_000)
  if (remainingChatIds.length === 0) return null
  return {
    id: task.id.slice(0, 100),
    action: task.action,
    chatIds,
    remainingChatIds,
    completed: chatIds.length - remainingChatIds.length,
    createdAt: task.createdAt
  }
}

const parseFailedBatch = (value: unknown): { action: BatchAction; chatIds: number[] } | null => {
  const batch = toObject(value)
  if (!isBatchAction(batch.action)) return null
  const chatIds = safeIds(batch.chatIds).slice(0, 1_000)
  return chatIds.length > 0 ? { action: batch.action, chatIds } : null
}

export class LocalDataStore {
  private readonly filePath = join(app.getPath('userData'), 'chatclear-data.json')
  private data: LocalDataFile | null = null
  private writeQueue: Promise<void> = Promise.resolve()

  async getDesktopPreferences(): Promise<DesktopPreferences> {
    return { ...(await this.load()).desktop }
  }

  async saveDesktopPreferences(preferences: DesktopPreferences): Promise<DesktopPreferences> {
    const normalized = normalizeDesktopPreferences(preferences)
    await this.update((data) => {
      data.desktop = normalized
    })
    return normalized
  }

  async getAccountPreferences(accountId: string): Promise<AccountPreferences> {
    return structuredClone(this.account(await this.load(), accountId).preferences)
  }

  async saveAccountPreferences(
    accountId: string,
    preferences: AccountPreferences
  ): Promise<AccountPreferences> {
    const normalized = normalizeAccountPreferences(preferences)
    await this.update((data) => {
      this.account(data, accountId).preferences = normalized
    })
    return normalized
  }

  async appendHistory(entry: ActivityLogEntry): Promise<void> {
    await this.update((data) => {
      const history = this.account(data, entry.accountId).history
      history.unshift(entry)
      if (history.length > 5_000) history.length = 5_000
    })
  }

  async getHistory(accountId: string): Promise<ActivityLogEntry[]> {
    return structuredClone(this.account(await this.load(), accountId).history)
  }

  async getPendingBatch(accountId: string): Promise<BatchTask | null> {
    return structuredClone(this.account(await this.load(), accountId).pendingBatch)
  }

  async savePendingBatch(accountId: string, task: BatchTask | null): Promise<void> {
    await this.update((data) => {
      this.account(data, accountId).pendingBatch = task
    })
  }

  async getFailedBatch(
    accountId: string
  ): Promise<{ action: BatchAction; chatIds: number[] } | null> {
    return structuredClone(this.account(await this.load(), accountId).failedBatch)
  }

  async saveFailedBatch(
    accountId: string,
    batch: { action: BatchAction; chatIds: number[] } | null
  ): Promise<void> {
    await this.update((data) => {
      this.account(data, accountId).failedBatch = batch
    })
  }

  async exportData(): Promise<LocalDataBackup> {
    const data = await this.load()
    return {
      version: 1,
      desktop: structuredClone(data.desktop),
      accounts: Object.fromEntries(
        Object.entries(data.accounts).map(([accountId, account]) => [
          accountId,
          { preferences: structuredClone(account.preferences) }
        ])
      )
    }
  }

  async importData(value: unknown): Promise<void> {
    const object = toObject(value)
    if (object.version !== 1) throw new Error('备份文件版本不受支持')
    const accountObjects = toObject(object.accounts)
    const accounts: Record<string, AccountLocalData> = {}
    for (const [accountId, raw] of Object.entries(accountObjects)) {
      if (!/^[a-zA-Z0-9-]{1,64}$/.test(accountId)) continue
      const account = toObject(raw)
      accounts[accountId] = {
        ...defaultAccountData(),
        preferences: normalizeAccountPreferences(account.preferences)
      }
    }
    await this.update((data) => {
      data.desktop = normalizeDesktopPreferences(object.desktop)
      for (const [accountId, account] of Object.entries(accounts)) {
        const current = this.account(data, accountId)
        current.preferences = account.preferences
      }
    })
  }

  async removeAccount(accountId: string): Promise<void> {
    await this.update((data) => {
      delete data.accounts[accountId]
    })
  }

  private account(data: LocalDataFile, accountId: string): AccountLocalData {
    data.accounts[accountId] ??= defaultAccountData()
    return data.accounts[accountId]
  }

  private async load(): Promise<LocalDataFile> {
    if (this.data) return this.data
    try {
      const object = toObject(JSON.parse(await readFile(this.filePath, 'utf8')))
      if (object.version !== 1) throw new Error('本地数据版本不受支持')
      this.data = {
        version: 1,
        desktop: normalizeDesktopPreferences(object.desktop),
        accounts: {}
      }
      const rawAccounts = toObject(object.accounts)
      for (const [accountId, raw] of Object.entries(rawAccounts)) {
        if (!/^[a-zA-Z0-9-]{1,64}$/.test(accountId)) continue
        const account = toObject(raw)
        this.data.accounts[accountId] = {
          preferences: normalizeAccountPreferences(account.preferences),
          history: parseHistory(account.history, accountId),
          pendingBatch: parsePendingBatch(account.pendingBatch),
          failedBatch: parseFailedBatch(account.failedBatch)
        }
      }
    } catch (error) {
      if (toObject(error).code !== 'ENOENT')
        throw new Error('本地偏好数据无法读取', { cause: error })
      this.data = { version: 1, desktop: defaultDesktopPreferences(), accounts: {} }
      await this.persist()
    }
    return this.data
  }

  private async update(mutator: (data: LocalDataFile) => void): Promise<void> {
    const data = await this.load()
    mutator(data)
    this.writeQueue = this.writeQueue.catch(() => undefined).then(() => this.persist())
    await this.writeQueue
  }

  private async persist(): Promise<void> {
    if (!this.data) return
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 })
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
    try {
      await writeFile(temporaryPath, JSON.stringify(this.data, null, 2), {
        flag: 'wx',
        mode: 0o600
      })
      await rename(temporaryPath, this.filePath)
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }
}
