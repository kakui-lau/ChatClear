import type {
  AppStatus,
  AuthEvent,
  ChatClearApi,
  Community,
  LeaveProgress
} from '../shared/contracts'

const mockCommunities: Community[] = [
  {
    id: 101,
    title: '产品交流测试群',
    kind: 'group',
    role: 'member',
    archived: false,
    memberCount: 238,
    lastActivity: 1_788_800_000
  },
  {
    id: 102,
    title: '公告频道测试',
    kind: 'channel',
    role: 'admin',
    archived: true,
    memberCount: 1_260,
    lastActivity: 1_788_700_000
  },
  {
    id: 103,
    title: '我创建的测试群',
    kind: 'group',
    role: 'owner',
    archived: false,
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
    proxyEnabled: false
  }
  let communities = [...mockCommunities]
  const authListeners = new Set<(event: AuthEvent) => void>()
  const progressListeners = new Set<(event: LeaveProgress) => void>()

  return {
    platform: 'linux',
    getStatus: async () => status,
    saveConnectionSettings: async (settings) => {
      if (!/^\d{4,12}$/.test(settings.apiId) || !/^[a-f\d]{32}$/i.test(settings.apiHash)) {
        throw new Error('API 凭证格式无效')
      }
      status = {
        configured: true,
        authorized: false,
        profile: null,
        proxyEnabled: settings.proxy.type !== 'none'
      }
      return status
    },
    clearConnectionSettings: async () => {
      status = { configured: false, authorized: false, profile: null, proxyEnabled: false }
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
        proxyEnabled: status.proxyEnabled
      }
      authListeners.forEach((listener) => listener({ stage: 'ready', message: '登录成功' }))
    },
    listCommunities: async () => communities,
    leaveCommunities: async (chatIds) => {
      progressListeners.forEach((listener) =>
        listener({ status: 'started', total: chatIds.length, completed: 0 })
      )
      let completed = 0
      for (const chatId of chatIds) {
        const community = communities.find((item) => item.id === chatId)
        await wait(40)
        completed += 1
        progressListeners.forEach((listener) =>
          listener({
            status: 'success',
            total: chatIds.length,
            completed,
            chatId,
            title: community?.title
          })
        )
      }
      communities = communities.filter((item) => !chatIds.includes(item.id))
      progressListeners.forEach((listener) =>
        listener({
          status: 'done',
          total: chatIds.length,
          completed,
          message: `已完成：成功 ${completed}，失败 0`
        })
      )
      return { total: chatIds.length, succeeded: completed, failed: 0, cancelled: false }
    },
    cancelLeaving: async () => undefined,
    logout: async () => {
      status = { configured: true, authorized: false, profile: null, proxyEnabled: false }
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
