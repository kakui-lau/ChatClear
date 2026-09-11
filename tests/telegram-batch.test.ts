import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthEvent, LeaveProgress } from '../shared/contracts'

const mocks = vi.hoisted(() => ({
  appendHistory: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
  configure: vi.fn(),
  createClient: vi.fn(),
  getActiveId: vi.fn(async () => 'default'),
  getFailedBatch: vi.fn(async () => null),
  getPendingBatch: vi.fn(async () => null),
  invoke: vi.fn(),
  isClosed: vi.fn(() => false),
  loadSettings: vi.fn(async () => ({
    version: 1,
    apiId: 123456,
    apiHash: '0123456789abcdef0123456789abcdef',
    proxy: null
  })),
  saveFailedBatch: vi.fn(async () => undefined),
  savePendingBatch: vi.fn(async () => undefined)
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/chatclear-batch-test',
    getVersion: () => '0.3.0',
    isPackaged: false
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString()
  },
  shell: { trashItem: vi.fn(async () => undefined) }
}))

vi.mock('prebuilt-tdlib', () => ({ getTdjson: () => '/tmp/libtdjson.dylib' }))

vi.mock('tdl', () => ({
  configure: mocks.configure,
  createClient: mocks.createClient
}))

vi.mock('../electron/main/credential-store', () => ({
  CredentialStore: class {
    load = mocks.loadSettings
  }
}))

vi.mock('../electron/main/account-store', () => ({
  AccountStore: class {
    getActiveId = mocks.getActiveId
    updateProfile = vi.fn(async () => undefined)
  }
}))

vi.mock('../electron/main/local-data-store', () => ({
  LocalDataStore: class {
    appendHistory = mocks.appendHistory
    getFailedBatch = mocks.getFailedBatch
    getPendingBatch = mocks.getPendingBatch
    saveFailedBatch = mocks.saveFailedBatch
    savePendingBatch = mocks.savePendingBatch
  }
}))

import { TelegramService } from '../electron/main/telegram-service'

const communityResponses = (role: 'member' | 'owner') => {
  mocks.invoke.mockImplementation(async (request: { _: string }) => {
    if (request._ === 'getProxies') return { proxies: [] }
    if (request._ === 'disableProxy') return {}
    if (request._ === 'getAuthorizationState') return { _: 'authorizationStateReady' }
    if (request._ === 'getChat') {
      return {
        title: 'Example Group',
        type: { _: 'chatTypeSupergroup', supergroup_id: 11, is_channel: false },
        notification_settings: { use_default_mute_for: true, mute_for: 0 },
        last_message: { date: 1_788_800_000 }
      }
    }
    if (request._ === 'getSupergroup') {
      return {
        member_count: 100,
        status: { _: role === 'owner' ? 'chatMemberStatusCreator' : 'chatMemberStatusMember' }
      }
    }
    return {}
  })
}

const createService = () => {
  const events: Array<AuthEvent | LeaveProgress> = []
  return { events, service: new TelegramService((event) => events.push(event)) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isClosed.mockReturnValue(false)
  mocks.createClient.mockReturnValue({
    close: mocks.close,
    invoke: mocks.invoke,
    isClosed: mocks.isClosed,
    login: vi.fn(),
    on: vi.fn()
  })
})

describe('TelegramService batch actions', () => {
  it('archives a conversation and records a local audit entry', async () => {
    communityResponses('member')
    const { events, service } = createService()

    await expect(service.runBatchAction('archive', [1001])).resolves.toMatchObject({
      action: 'archive',
      succeeded: 1,
      failed: 0,
      cancelled: false
    })
    expect(mocks.invoke).toHaveBeenCalledWith({
      _: 'addChatToList',
      chat_id: 1001,
      chat_list: { _: 'chatListArchive' }
    })
    expect(mocks.appendHistory).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'archive', chatId: 1001, status: 'success' })
    )
    expect(events).toContainEqual(
      expect.objectContaining({ action: 'archive', status: 'done', completed: 1 })
    )
  })

  it('always refuses to leave a conversation owned by the current user', async () => {
    communityResponses('owner')
    const { service } = createService()

    await expect(service.runBatchAction('leave', [1002])).resolves.toMatchObject({
      action: 'leave',
      succeeded: 0,
      failed: 1
    })
    expect(mocks.invoke).not.toHaveBeenCalledWith(
      expect.objectContaining({ _: 'leaveChat', chat_id: 1002 })
    )
    expect(mocks.appendHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'leave',
        chatId: 1002,
        status: 'failed',
        message: expect.stringContaining('群主')
      })
    )
  })
})
