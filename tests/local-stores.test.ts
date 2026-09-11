import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testPath = vi.hoisted(() => ({ value: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: () => testPath.value
  }
}))

import { AccountStore } from '../electron/main/account-store'
import { LocalDataStore } from '../electron/main/local-data-store'

beforeEach(async () => {
  testPath.value = await mkdtemp(join(tmpdir(), 'chatclear-stores-'))
})

afterEach(async () => {
  await rm(testPath.value, { recursive: true, force: true })
})

describe('AccountStore', () => {
  it('persists isolated accounts and chooses a valid account after removal', async () => {
    const store = new AccountStore()
    expect(await store.getActiveId()).toBe('default')

    const secondId = await store.createAndActivate()
    await store.updateProfile(secondId, {
      id: 42,
      displayName: 'Second Account',
      username: 'second'
    })

    const reloaded = new AccountStore()
    expect(await reloaded.getActiveId()).toBe(secondId)
    expect(await reloaded.list()).toContainEqual(
      expect.objectContaining({
        id: secondId,
        displayName: 'Second Account',
        username: 'second',
        authorized: true
      })
    )

    await reloaded.remove(secondId)
    expect(await reloaded.getActiveId()).toBe('default')
  })

  it('rejects a corrupted account registry instead of silently replacing it', async () => {
    await writeFile(join(testPath.value, 'accounts.json'), '{bad json', 'utf8')
    const store = new AccountStore()

    await expect(store.list()).rejects.toThrow('本地账号索引无法读取或已损坏')
  })
})

describe('LocalDataStore', () => {
  it('normalizes, persists and reloads local-only preferences', async () => {
    const store = new LocalDataStore()
    await store.saveDesktopPreferences({
      version: 1,
      locale: 'en',
      theme: 'dark',
      protectAdmins: false,
      automaticUpdateChecks: false,
      crashReporting: true
    })
    await store.saveAccountPreferences('default', {
      version: 1,
      protectedIds: [7, 7, 9],
      savedFilters: [],
      observations: [{ chatId: 9, dueAt: 1_800_000_000_000 }]
    })

    const reloaded = new LocalDataStore()
    expect(await reloaded.getDesktopPreferences()).toMatchObject({ locale: 'en', theme: 'dark' })
    expect(await reloaded.getAccountPreferences('default')).toEqual({
      version: 1,
      protectedIds: [7, 9],
      savedFilters: [],
      observations: [{ chatId: 9, dueAt: 1_800_000_000_000 }]
    })

    const file = JSON.parse(
      await readFile(join(testPath.value, 'chatclear-data.json'), 'utf8')
    ) as Record<string, unknown>
    expect(file).not.toHaveProperty('apiHash')
    expect(file).not.toHaveProperty('session')
  })

  it('imports preferences but not task or audit history from a backup', async () => {
    const store = new LocalDataStore()
    await store.importData({
      version: 1,
      desktop: { locale: 'en', theme: 'light' },
      accounts: {
        default: {
          preferences: { protectedIds: [21], savedFilters: [], observations: [] },
          history: [{ id: 'untrusted-history' }],
          pendingBatch: { id: 'untrusted-task' }
        }
      }
    })

    expect((await store.getAccountPreferences('default')).protectedIds).toEqual([21])
    expect(await store.getHistory('default')).toEqual([])
    expect(await store.getPendingBatch('default')).toBeNull()
  })

  it('exports only allowlisted preferences and excludes history and task state', async () => {
    const store = new LocalDataStore()
    await store.saveAccountPreferences('default', {
      version: 1,
      protectedIds: [21],
      savedFilters: [],
      observations: []
    })
    await store.appendHistory({
      id: 'history-1',
      accountId: 'default',
      action: 'archive',
      chatId: 21,
      title: 'Private title',
      status: 'success',
      createdAt: 1_800_000_000_000
    })
    await store.savePendingBatch('default', {
      id: 'task-1',
      action: 'archive',
      chatIds: [21],
      remainingChatIds: [21],
      completed: 0,
      createdAt: 1_800_000_000_000
    })

    const serialized = JSON.stringify(await store.exportData())
    expect(serialized).toContain('protectedIds')
    expect(serialized).not.toContain('Private title')
    expect(serialized).not.toContain('history')
    expect(serialized).not.toContain('pendingBatch')
    expect(serialized).not.toContain('failedBatch')
  })
})
