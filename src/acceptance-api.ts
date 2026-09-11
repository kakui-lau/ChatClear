import type {
  AccountPreferences,
  ActivityLogEntry,
  AppStatus,
  AuthEvent,
  BatchAction,
  ChatClearApi,
  Community,
  DesktopPreferences,
  LeaveProgress,
  LeaveSummary
} from '../shared/contracts'

const mockCommunities: Community[] = [
  {
    id: 101,
    title: '产品交流测试群',
    kind: 'group',
    role: 'member',
    archived: false,
    muted: false,
    memberCount: 238,
    lastActivity: 1_788_800_000
  },
  {
    id: 102,
    title: '公告频道测试',
    kind: 'channel',
    role: 'admin',
    archived: true,
    muted: false,
    memberCount: 1_260,
    lastActivity: 1_788_700_000
  },
  {
    id: 103,
    title: '我创建的测试群',
    kind: 'group',
    role: 'owner',
    archived: false,
    muted: false,
    memberCount: 18,
    lastActivity: 1_788_600_000
  }
]

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

export const createAcceptanceApi = (): ChatClearApi => {
  const startAuthorized =
    new URLSearchParams(window.location.search).get('acceptance') === 'dashboard'
  let status: AppStatus = {
    configured: startAuthorized,
    authorized: startAuthorized,
    profile: startAuthorized ? { id: 1, displayName: '验收用户', username: 'acceptance' } : null,
    proxyEnabled: false,
    activeAccountId: 'default'
  }
  let communities = [...mockCommunities]
  let desktopPreferences: DesktopPreferences = {
    version: 1,
    locale: 'zh-CN',
    theme: 'system',
    protectAdmins: true,
    automaticUpdateChecks: true,
    crashReporting: false
  }
  let accountPreferences: AccountPreferences = {
    version: 1,
    protectedIds: [],
    savedFilters: [],
    observations: []
  }
  const history: ActivityLogEntry[] = []
  const authListeners = new Set<(event: AuthEvent) => void>()
  const progressListeners = new Set<(event: LeaveProgress) => void>()

  const runBatch = async (action: BatchAction, chatIds: number[]): Promise<LeaveSummary> => {
    progressListeners.forEach((listener) =>
      listener({ action, status: 'started', total: chatIds.length, completed: 0 })
    )
    const results: LeaveSummary['results'] = []
    let completed = 0
    for (const chatId of chatIds) {
      const community = communities.find((item) => item.id === chatId)
      await wait(40)
      completed += 1
      const result = {
        chatId,
        title: community?.title ?? `会话 ${chatId}`,
        status: 'success' as const
      }
      results.push(result)
      history.unshift({
        ...result,
        id: `${Date.now()}-${chatId}`,
        accountId: 'default',
        action,
        createdAt: Date.now()
      })
      progressListeners.forEach((listener) =>
        listener({
          action,
          status: 'success',
          total: chatIds.length,
          completed,
          chatId: result.chatId,
          title: result.title
        })
      )
    }
    if (action === 'leave') communities = communities.filter((item) => !chatIds.includes(item.id))
    if (action === 'archive' || action === 'unarchive') {
      const archived = action === 'archive'
      communities = communities.map((item) =>
        chatIds.includes(item.id) ? { ...item, archived } : item
      )
    }
    if (action === 'mute') {
      communities = communities.map((item) =>
        chatIds.includes(item.id) ? { ...item, muted: true } : item
      )
    }
    progressListeners.forEach((listener) =>
      listener({
        action,
        status: 'done',
        total: chatIds.length,
        completed,
        message: `已完成：成功 ${completed}，失败 0`
      })
    )
    return {
      action,
      total: chatIds.length,
      succeeded: completed,
      failed: 0,
      cancelled: false,
      results
    }
  }

  return {
    platform: 'linux',
    getDesktopPreferences: async () => desktopPreferences,
    saveDesktopPreferences: async (preferences) => (desktopPreferences = preferences),
    getStatus: async () => status,
    saveConnectionSettings: async (settings) => {
      if (!/^\d{4,12}$/.test(settings.apiId) || !/^[a-f\d]{32}$/i.test(settings.apiHash)) {
        throw new Error('API 凭证格式无效')
      }
      status = {
        configured: true,
        authorized: false,
        profile: null,
        proxyEnabled: settings.proxy.type !== 'none',
        activeAccountId: 'default'
      }
      return status
    },
    clearConnectionSettings: async () => {
      status = {
        configured: false,
        authorized: false,
        profile: null,
        proxyEnabled: false,
        activeAccountId: 'default'
      }
      return status
    },
    setWindowMode: async () => undefined,
    fitCompactWindow: async () => undefined,
    openExternal: async () => undefined,
    startLogin: async () => {
      authListeners.forEach((listener) =>
        listener({ stage: 'connecting', message: '正在连接 Telegram…' })
      )
      await wait(80)
      authListeners.forEach((listener) =>
        listener({ stage: 'code', message: '验证码已发送到 Telegram' })
      )
    },
    submitAuthInput: async (kind, value) => {
      if (kind !== 'code' || value.trim().length < 4) throw new Error('验证码无效')
      status = {
        configured: true,
        authorized: true,
        profile: { id: 1, displayName: '验收用户', username: 'acceptance' },
        proxyEnabled: status.proxyEnabled,
        activeAccountId: 'default'
      }
      authListeners.forEach((listener) => listener({ stage: 'ready', message: '登录成功' }))
    },
    listCommunities: async () => communities,
    runBatchAction: runBatch,
    leaveCommunities: (chatIds) => runBatch('leave', chatIds),
    getPendingBatch: async () => null,
    resumePendingBatch: async () => {
      throw new Error('没有可恢复的批量任务')
    },
    retryFailedBatch: async () => {
      throw new Error('没有可重试的失败项目')
    },
    cancelLeaving: async () => undefined,
    getActivityHistory: async () => history,
    exportActivityHistory: async () => null,
    getAccountPreferences: async () => accountPreferences,
    saveAccountPreferences: async (preferences) => (accountPreferences = preferences),
    exportLocalData: async () => null,
    importLocalData: async () => undefined,
    listAccounts: async () => [
      {
        id: 'default',
        displayName: status.profile?.displayName ?? '验收账号',
        username: status.profile?.username ?? null,
        authorized: status.authorized,
        createdAt: Date.now()
      }
    ],
    addAccount: async () => {
      status = { ...status, activeAccountId: 'acceptance-new', authorized: false, profile: null }
      return status
    },
    switchAccount: async (accountId) => {
      status = { ...status, activeAccountId: accountId }
      return status
    },
    removeAccount: async () => status,
    checkForUpdates: async () => ({ state: 'current', currentVersion: '0.3.0' }),
    logout: async () => {
      status = {
        configured: true,
        authorized: false,
        profile: null,
        proxyEnabled: false,
        activeAccountId: status.activeAccountId
      }
    },
    onAuthEvent: (listener) => {
      authListeners.add(listener)
      return () => authListeners.delete(listener)
    },
    onLeaveProgress: (listener) => {
      progressListeners.add(listener)
      return () => progressListeners.delete(listener)
    }
  }
}
