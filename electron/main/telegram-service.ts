import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import { getTdjson } from 'prebuilt-tdlib'
import * as tdl from 'tdl'
import type { Client } from 'tdl'
import type {
  AppStatus,
  AuthEvent,
  AuthInputKind,
  Community,
  CommunityRole,
  ConnectionSettingsInput,
  LeaveProgress,
  LeaveSummary,
  UserProfile
} from '../../shared/contracts'
import type { StoredConnectionSettings } from './connection-settings'
import { CredentialStore } from './credential-store'
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

const getUnauthenticatedStatus = (settings: StoredConnectionSettings): AppStatus => ({
  configured: true,
  authorized: false,
  profile: null,
  proxyEnabled: settings.proxy !== null
})

export class TelegramService {
  private client: Client | null = null
  private clientTask: Promise<Client> | null = null
  private settings: StoredConnectionSettings | null | undefined
  private pendingInput: PendingInput | null = null
  private loginTask: Promise<Client> | null = null
  private loginTimeout: ReturnType<typeof setTimeout> | null = null
  private loginTimedOut = false
  private suppressLoginErrors = false
  private leaveTaskActive = false
  private cancelRequested = false
  private readonly credentialStore = new CredentialStore()

  constructor(private readonly emit: EventSink) {
    const tdjsonPath = getTdjson()
    tdl.configure({
      tdjson: app.isPackaged ? tdjsonPath.replace('app.asar', 'app.asar.unpacked') : tdjsonPath,
      verbosityLevel: 1
    })
  }

  async getStatus(): Promise<AppStatus> {
    const settings = await this.getSettings()
    if (!settings) {
      return { configured: false, authorized: false, profile: null, proxyEnabled: false }
    }

    const statusTask = this.resolveConfiguredStatus(settings)
    const status = await Promise.race([statusTask, sleep(3_000).then(() => null)])
    if (status) return status

    void statusTask
      .then((lateStatus) => {
        if (lateStatus.authorized) {
          this.emit({
            stage: 'ready',
            message: `已恢复 ${lateStatus.profile?.displayName ?? '本地会话'}`
          })
        }
      })
      .catch(() => undefined)
    return getUnauthenticatedStatus(settings)
  }

  async saveConnectionSettings(input: ConnectionSettingsInput): Promise<AppStatus> {
    await this.stopClientForReconfiguration()
    this.settings = await this.credentialStore.save(input)
    return getUnauthenticatedStatus(this.settings)
  }

  async clearConnectionSettings(): Promise<AppStatus> {
    await this.stopClientForReconfiguration()
    await this.credentialStore.clear()
    this.settings = null
    return { configured: false, authorized: false, profile: null, proxyEnabled: false }
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

    const task = this.runLogin(normalizedPhone)
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
        this.emit({ stage: 'ready', message: `已登录 ${profile.displayName}` })
      })
      .catch((error: unknown) => {
        this.clearLoginTimeout()
        this.rejectPendingInput('登录已终止')
        if (!this.loginTimedOut && !this.suppressLoginErrors) {
          this.emit({ stage: 'error', message: sanitizeError(error) })
        }
      })
      .finally(() => {
        this.loginTask = null
        this.loginTimedOut = false
      })
  }

  private async runLogin(normalizedPhone: string): Promise<Client> {
    const client = await this.ensureClient()
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

  async leaveCommunities(chatIds: number[]): Promise<LeaveSummary> {
    if (this.leaveTaskActive) throw new Error('已有退出任务正在进行')
    const uniqueIds = [...new Set(chatIds)]
    if (uniqueIds.length === 0 || uniqueIds.length > 1000) {
      throw new Error('请选择 1 至 1000 个群组')
    }
    if (!uniqueIds.every((id) => Number.isSafeInteger(id))) {
      throw new Error('群组列表包含无效标识')
    }

    const client = await this.requireAuthorizedClient()
    this.leaveTaskActive = true
    this.cancelRequested = false
    let succeeded = 0
    let failed = 0
    let completed = 0

    this.emit({ status: 'started', total: uniqueIds.length, completed: 0 })

    try {
      for (const chatId of uniqueIds) {
        if (this.cancelRequested) break

        let community: Community | null
        try {
          community = await this.toCommunity(client, chatId, false)
        } catch (error) {
          failed += 1
          completed += 1
          this.emit({
            status: 'failed',
            total: uniqueIds.length,
            completed,
            chatId,
            message: sanitizeError(error)
          })
          continue
        }

        if (!community) {
          failed += 1
          completed += 1
          this.emit({
            status: 'failed',
            total: uniqueIds.length,
            completed,
            chatId,
            message: '该会话不是群组或频道'
          })
          continue
        }

        if (community.role === 'owner') {
          failed += 1
          completed += 1
          this.emit({
            status: 'failed',
            total: uniqueIds.length,
            completed,
            chatId,
            title: community.title,
            message: '为避免意外转移所有权，群主创建的群已跳过'
          })
          continue
        }

        this.emit({
          status: 'leaving',
          total: uniqueIds.length,
          completed,
          chatId,
          title: community.title
        })

        try {
          await client.invoke({ _: 'leaveChat', chat_id: chatId })
          succeeded += 1
          completed += 1
          this.emit({
            status: 'success',
            total: uniqueIds.length,
            completed,
            chatId,
            title: community.title
          })
        } catch (error) {
          failed += 1
          completed += 1
          this.emit({
            status: 'failed',
            total: uniqueIds.length,
            completed,
            chatId,
            title: community.title,
            message: sanitizeError(error)
          })
        }

        if (!this.cancelRequested && completed < uniqueIds.length) await sleep(1400)
      }
    } finally {
      this.leaveTaskActive = false
    }

    const cancelled = this.cancelRequested
    this.emit({
      status: cancelled ? 'cancelled' : 'done',
      total: uniqueIds.length,
      completed,
      message: cancelled ? '任务已安全停止' : `已完成：成功 ${succeeded}，失败 ${failed}`
    })

    return { total: uniqueIds.length, succeeded, failed, cancelled }
  }

  cancelLeaving(): void {
    this.cancelRequested = true
  }

  async logout(): Promise<void> {
    if (this.leaveTaskActive) throw new Error('请先停止并等待退出任务结束')
    this.cancelRequested = true
    this.clearLoginTimeout()
    this.rejectPendingInput('用户已注销')
    const client = this.client
    if (!client || client.isClosed()) return
    try {
      await client.invoke({ _: 'logOut' })
    } finally {
      if (!client.isClosed()) await client.close().catch(() => undefined)
      if (this.client === client) this.client = null
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
  }

  private async ensureClient(): Promise<Client> {
    if (this.client && !this.client.isClosed()) return this.client
    if (this.clientTask) return this.clientTask

    this.clientTask = this.createClient()
    try {
      return await this.clientTask
    } finally {
      this.clientTask = null
    }
  }

  private async createClient(): Promise<Client> {
    if (this.client && !this.client.isClosed()) return this.client

    const settings = await this.getSettings()
    if (!settings) throw new Error('应用尚未配置 Telegram API 凭证')

    const baseDirectory = join(app.getPath('userData'), 'telegram-data', String(settings.apiId))
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

    const databaseEncryptionKey = await this.getDatabaseEncryptionKey()
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
      if (this.loginTask) this.emit({ stage: 'error', message: sanitizeError(error) })
    })
    client.on('update', (update) => {
      if (update._ !== 'updateConnectionState' || !this.loginTask || this.pendingInput) return
      const message = connectionMessages[update.state._]
      if (message) this.emit({ stage: 'connecting', message })
    })
    this.client = client

    try {
      await this.configureProxy(client, settings)
    } catch (error) {
      await client.close().catch(() => undefined)
      if (this.client === client) this.client = null
      throw error
    }

    return client
  }

  private async resolveConfiguredStatus(settings: StoredConnectionSettings): Promise<AppStatus> {
    const client = await this.ensureClient()
    const state = await client.invoke({ _: 'getAuthorizationState' })
    if (state._ !== 'authorizationStateReady') return getUnauthenticatedStatus(settings)

    return {
      configured: true,
      authorized: true,
      profile: await this.getProfile(client),
      proxyEnabled: settings.proxy !== null
    }
  }

  private async requireAuthorizedClient(): Promise<Client> {
    if (!(await this.getSettings())) throw new Error('应用尚未配置 Telegram API 凭证')
    const client = await this.ensureClient()
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
    return {
      id: chatId,
      title: typeof chat.title === 'string' ? chat.title : '未命名会话',
      kind: details.kind,
      role: details.role,
      archived,
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

  private async getDatabaseEncryptionKey(): Promise<string> {
    assertSecureStorageAvailable('保存 Telegram 登录会话')

    const keyPath = join(app.getPath('userData'), 'tdlib-key.bin')
    try {
      const encrypted = await readFile(keyPath)
      return safeStorage.decryptString(encrypted)
    } catch (error) {
      const code = toObject(error).code
      if (code !== 'ENOENT') throw error
    }

    const key = randomBytes(32).toString('base64url')
    const encrypted = safeStorage.encryptString(key)
    try {
      await writeFile(keyPath, encrypted, { flag: 'wx', mode: 0o600 })
      return key
    } catch (error) {
      if (toObject(error).code !== 'EEXIST') throw error
      return safeStorage.decryptString(await readFile(keyPath))
    }
  }
}
