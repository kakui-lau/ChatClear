import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { dirname, join } from 'node:path'
import { app, safeStorage, shell } from 'electron'
import { getTdjson } from 'prebuilt-tdlib'
import * as tdl from 'tdl'
import type { Client } from 'tdl'
import type {
  AccountPreferences,
  AccountSummary,
  ActivityLogEntry,
  AppStatus,
  AuthEvent,
  AuthInputKind,
  BatchAction,
  BatchResult,
  BatchTask,
  Community,
  CommunityRole,
  ConnectionSettingsInput,
  DesktopPreferences,
  LeaveProgress,
  LeaveSummary,
  UserProfile
} from '../../shared/contracts'
import { AccountStore } from './account-store'
import type { StoredConnectionSettings } from './connection-settings'
import { CredentialStore } from './credential-store'
import { createDatabaseEncryptionKey, normalizeDatabaseEncryptionKey } from './database-key'
import { LocalDataStore } from './local-data-store'
import { assertSecureStorageAvailable } from './secure-storage'

type JsonObject = Record<string, unknown>
type EventSink = (event: AuthEvent | LeaveProgress) => void

interface PendingInput {
  kind: AuthInputKind
  resolve(value: string): void
  reject(error: Error): void
}

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const toObject = (value: unknown): JsonObject =>
  value !== null && typeof value === 'object' ? (value as JsonObject) : {}

const toNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null

const sanitizeError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replaceAll(app.getPath('userData'), '[应用数据目录]')
    .replace(/\+[1-9]\d{6,14}/g, '[手机号]')
    .replace(/\b[a-f\d]{32}\b/gi, '[凭证]')
    .slice(0, 300)
}

const connectionMessages: Record<string, string> = {
  connectionStateWaitingForNetwork: '正在等待可用网络…',
  connectionStateConnectingToProxy: '正在连接代理服务器…',
  connectionStateConnecting: '正在连接 Telegram…',
  connectionStateUpdating: '已连接，正在同步状态…',
  connectionStateReady: '已连接，正在请求验证码…'
}

const getErrorCode = (error: unknown): number | null => toNumber(toObject(error).code)

const assertProxyReachable = (
  proxy: NonNullable<StoredConnectionSettings['proxy']>
): Promise<void> =>
  new Promise((resolve, reject) => {
    const socket = createConnection({ host: proxy.server, port: proxy.port })
    const finish = (error?: Error) => {
      clearTimeout(timeout)
      socket.removeAllListeners()
      socket.destroy()
      if (error) reject(error)
      else resolve()
    }
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            `无法连接代理服务器 ${proxy.server}:${proxy.port}，请确认代理软件正在运行且端口正确`
          )
        ),
      5_000
    )
    socket.once('connect', () => finish())
    socket.once('error', () =>
      finish(
        new Error(
          `无法连接代理服务器 ${proxy.server}:${proxy.port}，请确认代理软件正在运行且端口正确`
        )
      )
    )
  })

const getUnauthenticatedStatus = (
  settings: StoredConnectionSettings,
  activeAccountId: string
): AppStatus => ({
  configured: true,
  authorized: false,
  profile: null,
  proxyEnabled: settings.proxy !== null,
  activeAccountId
})

const batchActions: BatchAction[] = ['leave', 'archive', 'unarchive', 'mute', 'clearHistory']

const getFloodWaitSeconds = (error: unknown): number | null => {
  if (getErrorCode(error) !== 429) return null
  const message = error instanceof Error ? error.message : String(toObject(error).message ?? error)
  const match = message.match(/(?:retry after|FLOOD_WAIT_?)\s*(\d+)/i)
  if (!match) return 5
  const seconds = Number(match[1])
  return Number.isSafeInteger(seconds) ? Math.min(Math.max(seconds, 1), 3_600) : 5
}

export class TelegramService {
  private client: Client | null = null
  private clientAccountId: string | null = null
  private clientTask: Promise<Client> | null = null
  private settings: StoredConnectionSettings | null | undefined
  private pendingInput: PendingInput | null = null
  private loginTask: Promise<Client> | null = null
  private loginTimeout: ReturnType<typeof setTimeout> | null = null
  private loginTimedOut = false
  private suppressLoginErrors = false
  private clientFailureMessage: string | null = null
  private leaveTaskActive = false
  private cancelRequested = false
  private readonly credentialStore = new CredentialStore()
  private readonly accountStore = new AccountStore()
  private readonly localDataStore = new LocalDataStore()

  constructor(private readonly emit: EventSink) {
    const tdjsonPath = getTdjson()
    tdl.configure({
      tdjson: app.isPackaged ? tdjsonPath.replace('app.asar', 'app.asar.unpacked') : tdjsonPath,
      verbosityLevel: 1
    })
  }

  async getStatus(): Promise<AppStatus> {
    const settings = await this.getSettings()
    const activeAccountId = await this.accountStore.getActiveId()
    if (!settings) {
      return {
        configured: false,
        authorized: false,
        profile: null,
        proxyEnabled: false,
        activeAccountId
      }
    }

    const statusTask = this.resolveConfiguredStatus(settings)
    const status = await Promise.race([statusTask, sleep(3_000).then(() => null)])
    if (status) return status

    void statusTask
      .then(async (lateStatus) => {
        if (
          lateStatus.authorized &&
          lateStatus.activeAccountId === (await this.accountStore.getActiveId())
        ) {
          this.emit({
            stage: 'ready',
            message: `已恢复 ${lateStatus.profile?.displayName ?? '本地会话'}`
          })
        }
      })
      .catch(() => undefined)
    return getUnauthenticatedStatus(settings, activeAccountId)
  }

  async saveConnectionSettings(input: ConnectionSettingsInput): Promise<AppStatus> {
    await this.stopClientForReconfiguration()
    this.settings = await this.credentialStore.save(input)
    return getUnauthenticatedStatus(this.settings, await this.accountStore.getActiveId())
  }

  async clearConnectionSettings(): Promise<AppStatus> {
    await this.stopClientForReconfiguration()
    await this.credentialStore.clear()
    this.settings = null
    return {
      configured: false,
      authorized: false,
      profile: null,
      proxyEnabled: false,
      activeAccountId: await this.accountStore.getActiveId()
    }
  }

  getDesktopPreferences(): Promise<DesktopPreferences> {
    return this.localDataStore.getDesktopPreferences()
  }

  saveDesktopPreferences(preferences: DesktopPreferences): Promise<DesktopPreferences> {
    return this.localDataStore.saveDesktopPreferences(preferences)
  }

  async getAccountPreferences(): Promise<AccountPreferences> {
    return this.localDataStore.getAccountPreferences(await this.accountStore.getActiveId())
  }

  async saveAccountPreferences(preferences: AccountPreferences): Promise<AccountPreferences> {
    return this.localDataStore.saveAccountPreferences(
      await this.accountStore.getActiveId(),
      preferences
    )
  }

  listAccounts(): Promise<AccountSummary[]> {
    return this.accountStore.list()
  }

  async addAccount(): Promise<AppStatus> {
    if (!(await this.getSettings())) throw new Error('请先配置 Telegram API 凭证')
    await this.stopClientPreservingSession()
    await this.accountStore.createAndActivate()
    return this.getStatus()
  }

  async switchAccount(accountId: string): Promise<AppStatus> {
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(accountId)) throw new Error('账号标识无效')
    if (accountId === (await this.accountStore.getActiveId())) return this.getStatus()
    await this.stopClientPreservingSession()
    await this.accountStore.switchTo(accountId)
    return this.getStatus()
  }

  async removeAccount(accountId: string): Promise<AppStatus> {
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(accountId)) throw new Error('账号标识无效')
    const activeId = await this.accountStore.getActiveId()
    if (activeId === accountId) await this.stopClientPreservingSession()
    const settings = await this.getSettings()
    const { nextActiveId } = await this.accountStore.remove(accountId)
    await this.localDataStore.removeAccount(accountId)

    if (settings) {
      const baseDirectory = this.getAccountBaseDirectory(accountId, settings)
      await shell.trashItem(baseDirectory).catch(() => undefined)
      const keyPath = this.getDatabaseKeyPath(accountId)
      if (accountId !== 'default') await shell.trashItem(keyPath).catch(() => undefined)
    }

    if (nextActiveId !== activeId) {
      this.client = null
      this.clientAccountId = null
    }
    return this.getStatus()
  }

  async startLogin(phoneNumber: string): Promise<void> {
    if (!(await this.getSettings())) {
      throw new Error('应用尚未配置 Telegram API 凭证')
    }
    if (this.loginTask) {
      throw new Error('登录流程已经开始')
    }

    const normalizedPhone = phoneNumber.replace(/[\s()-]/g, '')
    if (!/^\+[1-9]\d{6,14}$/.test(normalizedPhone)) {
      throw new Error('请输入带国家区号的手机号，例如 +8613812345678')
    }

    this.emit({ stage: 'connecting', message: '正在连接 Telegram…' })
    this.loginTimedOut = false
    this.suppressLoginErrors = false
    this.clientFailureMessage = null

    const accountId = await this.accountStore.getActiveId()
    const task = this.runLogin(normalizedPhone, accountId)
    this.loginTask = task
    this.loginTimeout = setTimeout(() => {
      if (!this.loginTask || this.pendingInput) return
      this.loginTimedOut = true
      this.emit({
        stage: 'error',
        message: '连接 Telegram 超时。请检查网络，或返回连接设置配置可用的代理后重试。'
      })
      void this.abortLoginClient()
    }, 25_000)
    void task
      .then(async (client) => {
        this.clearLoginTimeout()
        const profile = await this.getProfile(client)
        await this.accountStore.updateProfile(accountId, profile)
        this.emit({ stage: 'ready', message: `已登录 ${profile.displayName}` })
      })
      .catch((error: unknown) => {
        this.clearLoginTimeout()
        this.rejectPendingInput('登录已终止')
        if (!this.loginTimedOut && !this.suppressLoginErrors) {
          this.emit({
            stage: 'error',
            message: this.clientFailureMessage ?? sanitizeError(error)
          })
        }
      })
      .finally(() => {
        this.loginTask = null
        this.loginTimedOut = false
        this.clientFailureMessage = null
      })
  }

  private async runLogin(normalizedPhone: string, accountId: string): Promise<Client> {
    const settings = await this.getSettings()
    if (!settings) throw new Error('应用尚未配置 Telegram API 凭证')
    if (settings.proxy) await assertProxyReachable(settings.proxy)

    const client = await this.ensureClient(accountId)
    await client.login({
      type: 'user',
      getPhoneNumber: async (retry) => {
        if (retry) throw new Error('手机号无效，请重新开始登录')
        return normalizedPhone
      },
      getAuthCode: (retry) =>
        this.waitForInput('code', {
          stage: 'code',
          retry,
          message: retry ? '验证码无效，请重新输入' : '验证码已发送到 Telegram'
        }),
      getPassword: (hint, retry) =>
        this.waitForInput('password', {
          stage: 'password',
          hint,
          retry,
          message: retry ? '两步验证密码错误' : '请输入两步验证密码'
        }),
      getEmailAddress: () =>
        this.waitForInput('email', {
          stage: 'email',
          message: 'Telegram 要求绑定验证邮箱'
        }),
      getEmailCode: () =>
        this.waitForInput('emailCode', {
          stage: 'emailCode',
          message: '请输入邮箱验证码'
        }),
      confirmOnAnotherDevice: (link) => {
        this.emit({
          stage: 'otherDevice',
          link,
          message: '请在已登录的 Telegram 设备上确认本次登录'
        })
      },
      getName: async () => {
        throw new Error('ChatClear 不创建新账号，请先使用 Telegram 官方客户端完成注册')
      }
    })
    return client
  }

  submitAuthInput(kind: AuthInputKind, value: string): void {
    const pending = this.pendingInput
    if (!pending || pending.kind !== kind) {
      throw new Error('当前登录步骤不需要该输入')
    }

    const normalized = value.trim()
    if (!normalized || normalized.length > 256) {
      throw new Error('输入不能为空或过长')
    }

    this.pendingInput = null
    pending.resolve(normalized)
  }

  async listCommunities(): Promise<Community[]> {
    const client = await this.requireAuthorizedClient()
    const [mainIds, archivedIds] = await Promise.all([
      this.getChatIds(client, 'chatListMain'),
      this.getChatIds(client, 'chatListArchive')
    ])

    const archived = new Set(archivedIds)
    const ids = [...new Set([...mainIds, ...archivedIds])]
    const communities: Community[] = []

    for (let index = 0; index < ids.length; index += 24) {
      const batch = ids.slice(index, index + 24)
      const items = await Promise.allSettled(
        batch.map((chatId) => this.toCommunity(client, chatId, archived.has(chatId)))
      )
      for (const item of items) {
        if (item.status === 'fulfilled' && item.value) communities.push(item.value)
      }
    }

    return communities.toSorted(
      (left, right) => (right.lastActivity ?? 0) - (left.lastActivity ?? 0)
    )
  }

  async runBatchAction(action: BatchAction, chatIds: number[]): Promise<LeaveSummary> {
    if (!batchActions.includes(action)) throw new Error('批量操作类型无效')
    const uniqueIds = [...new Set(chatIds)]
    this.assertValidChatIds(uniqueIds)
    const task: BatchTask = {
      id: randomUUID(),
      action,
      chatIds: uniqueIds,
      remainingChatIds: uniqueIds,
      completed: 0,
      createdAt: Date.now()
    }
    return this.executeBatch(task)
  }

  leaveCommunities(chatIds: number[]): Promise<LeaveSummary> {
    return this.runBatchAction('leave', chatIds)
  }

  async getPendingBatch(): Promise<BatchTask | null> {
    return this.localDataStore.getPendingBatch(await this.accountStore.getActiveId())
  }

  async resumePendingBatch(): Promise<LeaveSummary> {
    const accountId = await this.accountStore.getActiveId()
    const task = await this.localDataStore.getPendingBatch(accountId)
    if (!task) throw new Error('没有可恢复的批量任务')
    return this.executeBatch(task)
  }

  async retryFailedBatch(): Promise<LeaveSummary> {
    const accountId = await this.accountStore.getActiveId()
    const failed = await this.localDataStore.getFailedBatch(accountId)
    if (!failed || failed.chatIds.length === 0) throw new Error('没有可重试的失败项目')
    await this.localDataStore.saveFailedBatch(accountId, null)
    return this.runBatchAction(failed.action, failed.chatIds)
  }

  async getActivityHistory(): Promise<ActivityLogEntry[]> {
    return this.localDataStore.getHistory(await this.accountStore.getActiveId())
  }

  exportLocalData(): Promise<unknown> {
    return this.localDataStore.exportData()
  }

  importLocalData(value: unknown): Promise<void> {
    if (this.leaveTaskActive) throw new Error('请先暂停并等待批量任务结束')
    return this.localDataStore.importData(value)
  }

  private async executeBatch(task: BatchTask): Promise<LeaveSummary> {
    if (this.leaveTaskActive) throw new Error('已有批量任务正在进行')
    this.assertValidChatIds(task.remainingChatIds)
    const client = await this.requireAuthorizedClient()
    const accountId = await this.accountStore.getActiveId()
    this.leaveTaskActive = true
    this.cancelRequested = false
    const total = task.chatIds.length
    let succeeded = 0
    let failed = 0
    const results: BatchResult[] = []
    const failedIds: number[] = []

    await this.localDataStore.savePendingBatch(accountId, task)
    this.emit({ action: task.action, status: 'started', total, completed: task.completed })

    try {
      for (const chatId of [...task.remainingChatIds]) {
        if (this.cancelRequested) break

        let community: Community | null = null
        let failure: string | null = null
        try {
          community = await this.toCommunity(client, chatId, false)
          if (!community) failure = '该会话不是群组或频道'
          else if (task.action === 'leave' && community.role === 'owner') {
            failure = '为避免意外转移所有权，群主创建的群已跳过'
          }
        } catch (error) {
          failure = sanitizeError(error)
        }

        if (!failure && community) {
          this.emit({
            action: task.action,
            status: 'processing',
            total,
            completed: task.completed,
            chatId,
            title: community.title
          })
          try {
            await this.performBatchAction(client, task.action, chatId, community, task)
          } catch (error) {
            if (this.cancelRequested) break
            failure = sanitizeError(error)
          }
        }

        const result: BatchResult = failure
          ? {
              chatId,
              title: community?.title ?? `会话 ${chatId}`,
              status: 'failed',
              message: failure
            }
          : { chatId, title: community?.title ?? `会话 ${chatId}`, status: 'success' }
        results.push(result)
        if (result.status === 'success') succeeded += 1
        else {
          failed += 1
          failedIds.push(chatId)
        }

        task.completed += 1
        task.remainingChatIds = task.remainingChatIds.filter((id) => id !== chatId)
        await Promise.all([
          this.localDataStore.savePendingBatch(accountId, task),
          this.localDataStore.appendHistory({
            ...result,
            id: randomUUID(),
            accountId,
            action: task.action,
            createdAt: Date.now()
          })
        ])
        this.emit({
          action: task.action,
          status: result.status,
          total,
          completed: task.completed,
          chatId,
          title: result.title,
          message: result.message
        })
        if (!this.cancelRequested && task.remainingChatIds.length > 0) await sleep(1_200)
      }
    } finally {
      this.leaveTaskActive = false
    }

    const cancelled = this.cancelRequested
    if (!cancelled) await this.localDataStore.savePendingBatch(accountId, null)
    await this.localDataStore.saveFailedBatch(
      accountId,
      failedIds.length > 0 ? { action: task.action, chatIds: failedIds } : null
    )
    this.emit({
      action: task.action,
      status: cancelled ? 'cancelled' : 'done',
      total,
      completed: task.completed,
      message: cancelled
        ? '任务已安全暂停，可稍后继续'
        : `已完成：成功 ${succeeded}，失败 ${failed}`
    })

    return { action: task.action, total, succeeded, failed, cancelled, results }
  }

  private assertValidChatIds(chatIds: number[]): void {
    if (chatIds.length === 0 || chatIds.length > 1_000) {
      throw new Error('请选择 1 至 1000 个群组')
    }
    if (!chatIds.every((id) => Number.isSafeInteger(id))) {
      throw new Error('群组列表包含无效标识')
    }
  }

  private async performBatchAction(
    client: Client,
    action: BatchAction,
    chatId: number,
    community: Community,
    task: BatchTask
  ): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        if (action === 'leave') {
          await client.invoke({ _: 'leaveChat', chat_id: chatId })
        } else if (action === 'archive' || action === 'unarchive') {
          await client.invoke({
            _: 'addChatToList',
            chat_id: chatId,
            chat_list: { _: action === 'archive' ? 'chatListArchive' : 'chatListMain' }
          })
        } else if (action === 'mute') {
          const chat = await client.invoke({ _: 'getChat', chat_id: chatId })
          await client.invoke({
            _: 'setChatNotificationSettings',
            chat_id: chatId,
            notification_settings: {
              ...chat.notification_settings,
              _: 'chatNotificationSettings',
              use_default_mute_for: false,
              mute_for: 366 * 24 * 60 * 60
            }
          })
        } else {
          await client.invoke({
            _: 'deleteChatHistory',
            chat_id: chatId,
            remove_from_chat_list: false,
            revoke: false
          })
        }
        return
      } catch (error) {
        const waitSeconds = getFloodWaitSeconds(error)
        if (waitSeconds === null || attempt === 3) throw error
        const retryAt = Date.now() + waitSeconds * 1_000
        this.emit({
          action,
          status: 'waiting',
          total: task.chatIds.length,
          completed: task.completed,
          chatId,
          title: community.title,
          retryAt,
          message: `Telegram 请求受限，将在 ${waitSeconds} 秒后自动继续`
        })
        let remaining = waitSeconds * 1_000
        while (remaining > 0) {
          if (this.cancelRequested) throw error
          const duration = Math.min(remaining, 1_000)
          await sleep(duration)
          remaining -= duration
        }
      }
    }
  }

  cancelLeaving(): void {
    this.cancelRequested = true
  }

  async logout(): Promise<void> {
    if (this.leaveTaskActive) throw new Error('请先停止并等待退出任务结束')
    this.cancelRequested = true
    this.clearLoginTimeout()
    this.rejectPendingInput('用户已注销')
    const accountId = await this.accountStore.getActiveId()
    const client = this.client
    if (!client || client.isClosed()) {
      await this.accountStore.markLoggedOut(accountId)
      return
    }
    try {
      await client.invoke({ _: 'logOut' })
    } finally {
      if (!client.isClosed()) await client.close().catch(() => undefined)
      if (this.client === client) this.client = null
      this.clientAccountId = null
      await this.accountStore.markLoggedOut(accountId)
    }
  }

  async close(): Promise<void> {
    this.cancelRequested = true
    this.clearLoginTimeout()
    this.rejectPendingInput('应用正在关闭')
    let client = this.client
    if (!client && this.clientTask) client = await this.clientTask.catch(() => null)
    if (client && !client.isClosed()) await client.close()
    this.client = null
    this.clientAccountId = null
  }

  private async ensureClient(expectedAccountId?: string): Promise<Client> {
    const activeAccountId = await this.accountStore.getActiveId()
    if (expectedAccountId && activeAccountId !== expectedAccountId) {
      throw new Error('账号已切换，请重试')
    }
    if (this.client && !this.client.isClosed() && this.clientAccountId === activeAccountId) {
      return this.client
    }
    if (this.client && !this.client.isClosed()) await this.client.close()
    this.client = null
    this.clientAccountId = null
    if (this.clientTask) return this.clientTask

    this.clientTask = this.createClient(activeAccountId)
    try {
      return await this.clientTask
    } finally {
      this.clientTask = null
    }
  }

  private async createClient(accountId: string): Promise<Client> {
    if (this.client && !this.client.isClosed()) return this.client

    const settings = await this.getSettings()
    if (!settings) throw new Error('应用尚未配置 Telegram API 凭证')

    if (accountId !== (await this.accountStore.getActiveId())) throw new Error('账号已切换，请重试')
    const baseDirectory = this.getAccountBaseDirectory(accountId, settings)
    const databaseDirectory = join(baseDirectory, 'database')
    const filesDirectory = join(baseDirectory, 'files')
    await Promise.all([
      mkdir(databaseDirectory, { recursive: true, mode: 0o700 }),
      mkdir(filesDirectory, { recursive: true, mode: 0o700 })
    ])
    if (process.platform !== 'win32') {
      await Promise.all([
        chmod(baseDirectory, 0o700),
        chmod(databaseDirectory, 0o700),
        chmod(filesDirectory, 0o700)
      ])
    }

    const databaseEncryptionKey = await this.getDatabaseEncryptionKey(accountId)
    const client = tdl.createClient({
      apiId: settings.apiId,
      apiHash: settings.apiHash,
      databaseDirectory,
      filesDirectory,
      databaseEncryptionKey,
      skipOldUpdates: true,
      tdlibParameters: {
        use_message_database: false,
        use_secret_chats: false,
        use_file_database: false,
        system_language_code: 'zh-Hans',
        device_model: 'ChatClear Desktop',
        system_version: `${process.platform} ${process.arch}`,
        application_version: app.getVersion()
      }
    })

    client.on('error', (error) => {
      if (!this.loginTask || this.suppressLoginErrors || this.clientFailureMessage) return
      this.clientFailureMessage = sanitizeError(error)
      void this.abortLoginClient()
    })
    client.on('update', (update) => {
      if (update._ !== 'updateConnectionState' || !this.loginTask || this.pendingInput) return
      const message = connectionMessages[update.state._]
      if (message) this.emit({ stage: 'connecting', message })
    })
    this.client = client
    this.clientAccountId = accountId

    try {
      await this.configureProxy(client, settings)
    } catch (error) {
      await client.close().catch(() => undefined)
      if (this.client === client) this.client = null
      if (this.clientAccountId === accountId) this.clientAccountId = null
      throw error
    }

    return client
  }

  private async resolveConfiguredStatus(settings: StoredConnectionSettings): Promise<AppStatus> {
    const activeAccountId = await this.accountStore.getActiveId()
    const client = await this.ensureClient(activeAccountId)
    const state = await client.invoke({ _: 'getAuthorizationState' })
    if (state._ !== 'authorizationStateReady') {
      return getUnauthenticatedStatus(settings, activeAccountId)
    }

    const profile = await this.getProfile(client)
    if (activeAccountId !== (await this.accountStore.getActiveId())) {
      throw new Error('账号已切换，请重试')
    }
    await this.accountStore.updateProfile(activeAccountId, profile)

    return {
      configured: true,
      authorized: true,
      profile,
      proxyEnabled: settings.proxy !== null,
      activeAccountId
    }
  }

  private async requireAuthorizedClient(): Promise<Client> {
    if (!(await this.getSettings())) throw new Error('应用尚未配置 Telegram API 凭证')
    const accountId = await this.accountStore.getActiveId()
    const client = await this.ensureClient(accountId)
    const state = await client.invoke({ _: 'getAuthorizationState' })
    if (state._ !== 'authorizationStateReady') throw new Error('请先登录 Telegram')
    return client
  }

  private async getProfile(client: Client): Promise<UserProfile> {
    const me = await client.invoke({ _: 'getMe' })
    const firstName = typeof me.first_name === 'string' ? me.first_name : ''
    const lastName = typeof me.last_name === 'string' ? me.last_name : ''
    const username = toObject(me.usernames).active_usernames
    const usernames = Array.isArray(username) ? username : []

    return {
      id: toNumber(me.id) ?? 0,
      displayName: `${firstName} ${lastName}`.trim() || 'Telegram 用户',
      username: typeof usernames[0] === 'string' ? usernames[0] : null
    }
  }

  private async getChatIds(client: Client, list: 'chatListMain' | 'chatListArchive') {
    for (let page = 0; page < 20; page += 1) {
      try {
        await client.invoke({ _: 'loadChats', chat_list: { _: list }, limit: 500 })
      } catch (error) {
        if (getErrorCode(error) === 404) break
        throw error
      }
    }

    const result = await client.invoke({ _: 'getChats', chat_list: { _: list }, limit: 10_000 })
    return Array.isArray(result.chat_ids)
      ? result.chat_ids.filter((id): id is number => Number.isSafeInteger(id))
      : []
  }

  private async toCommunity(
    client: Client,
    chatId: number,
    archived: boolean
  ): Promise<Community | null> {
    const chat = await client.invoke({ _: 'getChat', chat_id: chatId })
    const type = toObject(chat.type)
    const typeName = type._
    if (typeName !== 'chatTypeBasicGroup' && typeName !== 'chatTypeSupergroup') return null

    let details: Pick<Community, 'kind' | 'role' | 'memberCount'>

    if (typeName === 'chatTypeBasicGroup') {
      const groupId = toNumber(type.basic_group_id)
      if (groupId === null) return null
      const group = await client.invoke({ _: 'getBasicGroup', basic_group_id: groupId })
      details = {
        kind: 'group',
        role: this.roleFromStatus(toObject(group.status)),
        memberCount: toNumber(group.member_count)
      }
    } else {
      const supergroupId = toNumber(type.supergroup_id)
      if (supergroupId === null) return null
      const supergroup = await client.invoke({ _: 'getSupergroup', supergroup_id: supergroupId })
      details = {
        kind: type.is_channel === true ? 'channel' : 'group',
        role: this.roleFromStatus(toObject(supergroup.status)),
        memberCount: toNumber(supergroup.member_count)
      }
    }

    const lastMessage = toObject(chat.last_message)
    const notificationSettings = toObject(chat.notification_settings)
    return {
      id: chatId,
      title: typeof chat.title === 'string' ? chat.title : '未命名会话',
      kind: details.kind,
      role: details.role,
      archived,
      muted:
        notificationSettings.use_default_mute_for === false &&
        (toNumber(notificationSettings.mute_for) ?? 0) > 0,
      memberCount: details.memberCount,
      lastActivity: toNumber(lastMessage.date)
    }
  }

  private roleFromStatus(status: JsonObject): CommunityRole {
    if (status._ === 'chatMemberStatusCreator') return 'owner'
    if (status._ === 'chatMemberStatusAdministrator') return 'admin'
    return 'member'
  }

  private waitForInput(kind: AuthInputKind, event: AuthEvent): Promise<string> {
    this.clearLoginTimeout()
    this.rejectPendingInput('登录步骤已更新')
    this.emit(event)
    return new Promise((resolve, reject) => {
      this.pendingInput = { kind, resolve, reject }
    })
  }

  private rejectPendingInput(message: string): void {
    const pending = this.pendingInput
    this.pendingInput = null
    pending?.reject(new Error(message))
  }

  private async getSettings(): Promise<StoredConnectionSettings | null> {
    if (this.settings === undefined) this.settings = await this.credentialStore.load()
    return this.settings
  }

  private clearLoginTimeout(): void {
    if (this.loginTimeout) clearTimeout(this.loginTimeout)
    this.loginTimeout = null
  }

  private async abortLoginClient(): Promise<void> {
    this.rejectPendingInput('登录连接已终止')
    const client = this.client
    if (client && !client.isClosed()) await client.close().catch(() => undefined)
    if (this.client === client) this.client = null
    this.clientAccountId = null
  }

  private async stopClientPreservingSession(): Promise<void> {
    if (this.leaveTaskActive) throw new Error('请先暂停并等待批量任务结束')
    this.cancelRequested = true
    this.clearLoginTimeout()
    this.suppressLoginErrors = true
    this.rejectPendingInput('账号已切换')
    let client = this.client
    if (!client && this.clientTask) client = await this.clientTask.catch(() => null)
    if (client && !client.isClosed()) await client.close().catch(() => undefined)
    this.client = null
    this.clientAccountId = null
    this.clientTask = null
    this.loginTask = null
  }

  private async stopClientForReconfiguration(): Promise<void> {
    if (this.leaveTaskActive) throw new Error('请先等待退出任务结束')
    if (this.client && !this.client.isClosed()) {
      const state = await this.client.invoke({ _: 'getAuthorizationState' })
      if (state._ === 'authorizationStateReady') throw new Error('请先注销 Telegram 再更改连接设置')
    }

    this.clearLoginTimeout()
    this.suppressLoginErrors = true
    this.rejectPendingInput('连接设置已更改')
    const client = this.client
    if (client && !client.isClosed()) await client.close()
    this.client = null
    this.clientAccountId = null
    this.clientTask = null
    this.loginTask = null
  }

  private async configureProxy(client: Client, settings: StoredConnectionSettings): Promise<void> {
    const configured = await client.invoke({ _: 'getProxies' })
    const ownedProxies = configured.proxies.filter((proxy) => proxy.comment === 'ChatClear')
    await Promise.allSettled(
      ownedProxies.map((proxy) => client.invoke({ _: 'removeProxy', proxy_id: proxy.id }))
    )

    if (!settings.proxy) {
      await client.invoke({ _: 'disableProxy' })
      return
    }

    await client.invoke({
      _: 'addProxy',
      proxy: {
        _: 'proxy',
        server: settings.proxy.server,
        port: settings.proxy.port,
        type:
          settings.proxy.type === 'socks5'
            ? {
                _: 'proxyTypeSocks5',
                username: settings.proxy.username,
                password: settings.proxy.password
              }
            : {
                _: 'proxyTypeHttp',
                username: settings.proxy.username,
                password: settings.proxy.password,
                http_only: false
              }
      },
      enable: true,
      comment: 'ChatClear'
    })
  }

  private getAccountBaseDirectory(accountId: string, settings: StoredConnectionSettings): string {
    return accountId === 'default'
      ? join(app.getPath('userData'), 'telegram-data', String(settings.apiId))
      : join(app.getPath('userData'), 'telegram-data', 'accounts', accountId)
  }

  private getDatabaseKeyPath(accountId: string): string {
    return accountId === 'default'
      ? join(app.getPath('userData'), 'tdlib-key.bin')
      : join(app.getPath('userData'), 'tdlib-keys', `${accountId}.bin`)
  }

  private async getDatabaseEncryptionKey(accountId: string): Promise<string> {
    assertSecureStorageAvailable('保存 Telegram 登录会话')

    const keyPath = this.getDatabaseKeyPath(accountId)
    try {
      const encrypted = await readFile(keyPath)
      return normalizeDatabaseEncryptionKey(safeStorage.decryptString(encrypted))
    } catch (error) {
      const code = toObject(error).code
      if (code !== 'ENOENT') throw error
    }

    const key = createDatabaseEncryptionKey()
    const encrypted = safeStorage.encryptString(key)
    await mkdir(dirname(keyPath), { recursive: true, mode: 0o700 })
    try {
      await writeFile(keyPath, encrypted, { flag: 'wx', mode: 0o600 })
      return key
    } catch (error) {
      if (toObject(error).code !== 'EEXIST') throw error
      return normalizeDatabaseEncryptionKey(safeStorage.decryptString(await readFile(keyPath)))
    }
  }
}
