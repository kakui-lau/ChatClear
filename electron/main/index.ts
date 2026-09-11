import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  clipboard,
  crashReporter,
  dialog,
  ipcMain,
  net,
  screen,
  shell
} from 'electron'
import {
  SPONSOR_ADDRESS,
  TELEGRAM_CONTACT_URL,
  type AccountPreferences,
  type AppWindowMode,
  type AuthInputKind,
  type BatchAction,
  type ConnectionSettingsInput,
  type DesktopPreferences,
  type ProxyType
} from '../../shared/contracts'
import { TelegramService } from './telegram-service'

let mainWindow: BrowserWindow | null = null
let telegramService: TelegramService | null = null
let shutdownStarted = false
let shutdownComplete = false
let crashReporterStarted = false

const hasSingleInstanceLock = app.requestSingleInstanceLock()

const getTelegramService = (): TelegramService => {
  if (!telegramService) throw new Error('Telegram 服务尚未初始化')
  return telegramService
}

const toObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const applyCrashReporting = (preferences: DesktopPreferences): void => {
  const submitURL = process.env.CHATCLEAR_CRASH_REPORT_URL?.trim()
  if (!crashReporterStarted) {
    crashReporter.start({
      companyName: 'ChatClear',
      productName: 'ChatClear',
      submitURL: submitURL || undefined,
      uploadToServer: Boolean(submitURL && preferences.crashReporting),
      compress: true
    })
    crashReporterStarted = true
    return
  }
  if (process.platform !== 'linux') {
    crashReporter.setUploadToServer(Boolean(submitURL && preferences.crashReporting))
  }
}

const compareVersions = (left: string, right: string): number => {
  const normalize = (version: string) =>
    version
      .replace(/^v/i, '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0)
  const leftParts = normalize(left)
  const rightParts = normalize(right)
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

const checkForUpdates = async () => {
  const currentVersion = app.getVersion()
  try {
    const response = await net.fetch(
      'https://api.github.com/repos/kakui-lau/ChatClear/releases/latest',
      {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(10_000)
      }
    )
    if (response.status === 404) {
      return {
        state: 'current' as const,
        currentVersion,
        message: '尚未配置公开发行版本'
      }
    }
    if (!response.ok) throw new Error(`更新服务器返回 ${response.status}`)
    const release = toObject(await response.json())
    const latestVersion =
      typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : ''
    const releaseUrl = typeof release.html_url === 'string' ? release.html_url : undefined
    if (!latestVersion) throw new Error('更新信息格式无效')
    return {
      state:
        compareVersions(latestVersion, currentVersion) > 0
          ? ('available' as const)
          : ('current' as const),
      currentVersion,
      latestVersion,
      releaseUrl
    }
  } catch (error) {
    return {
      state: 'error' as const,
      currentVersion,
      message: error instanceof Error ? error.message.slice(0, 200) : '检查更新失败'
    }
  }
}

const csvCell = (value: string | number): string => {
  const text = String(value)
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safeText.replaceAll('"', '""')}"`
}

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 560,
    height: 720,
    minWidth: 520,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f5f4ef',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
      spellcheck: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault())
  mainWindow.webContents.session.setPermissionCheckHandler(() => false)
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false)
  )

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && rendererUrl) {
    const url = new URL(rendererUrl)
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1' && url.hostname !== '::1') {
      throw new Error('开发服务器必须运行在本机')
    }
    void mainWindow.loadURL(url.toString())
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const setWindowMode = (mode: AppWindowMode): void => {
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (mode === 'dashboard') {
    mainWindow.setMinimumSize(920, 640)
    mainWindow.setContentSize(1180, 760, true)
  } else {
    mainWindow.setMinimumSize(520, 640)
    mainWindow.setContentSize(560, 720, true)
  }
  mainWindow.center()
}

const fitCompactWindow = (contentHeight: number): void => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const display = screen.getDisplayMatching(mainWindow.getBounds())
  const height = Math.max(600, Math.min(Math.ceil(contentHeight), display.workAreaSize.height - 48))
  mainWindow.setMinimumSize(520, Math.min(600, height))
  mainWindow.setContentSize(560, height, true)
  mainWindow.center()
}

const parseConnectionSettings = (value: unknown): ConnectionSettingsInput => {
  if (!value || typeof value !== 'object') throw new Error('连接设置无效')
  const settings = value as Record<string, unknown>
  const proxy = settings.proxy
  if (!proxy || typeof proxy !== 'object') throw new Error('代理设置无效')
  const proxyObject = proxy as Record<string, unknown>
  const proxyTypes: ProxyType[] = ['none', 'socks5', 'http']

  if (
    typeof settings.apiId !== 'string' ||
    typeof settings.apiHash !== 'string' ||
    !proxyTypes.includes(proxyObject.type as ProxyType) ||
    typeof proxyObject.server !== 'string' ||
    typeof proxyObject.port !== 'number' ||
    typeof proxyObject.username !== 'string' ||
    typeof proxyObject.password !== 'string'
  ) {
    throw new Error('连接设置无效')
  }

  return {
    apiId: settings.apiId,
    apiHash: settings.apiHash,
    proxy: {
      type: proxyObject.type as ProxyType,
      server: proxyObject.server,
      port: proxyObject.port,
      username: proxyObject.username,
      password: proxyObject.password
    }
  }
}

const registerIpc = (): void => {
  telegramService = new TelegramService((event) => {
    if ('stage' in event) mainWindow?.webContents.send('telegram:auth-event', event)
    else mainWindow?.webContents.send('telegram:leave-progress', event)
  })

  ipcMain.handle('telegram:status', () => getTelegramService().getStatus())
  ipcMain.handle('app:get-desktop-preferences', () => getTelegramService().getDesktopPreferences())
  ipcMain.handle('app:save-desktop-preferences', async (_event, preferences: unknown) => {
    const saved = await getTelegramService().saveDesktopPreferences(
      preferences as DesktopPreferences
    )
    applyCrashReporting(saved)
    return saved
  })
  ipcMain.handle('telegram:save-connection-settings', (_event, settings: unknown) =>
    getTelegramService().saveConnectionSettings(parseConnectionSettings(settings))
  )
  ipcMain.handle('telegram:clear-connection-settings', () =>
    getTelegramService().clearConnectionSettings()
  )
  ipcMain.handle('app:set-window-mode', (_event, mode: unknown) => {
    if (mode !== 'compact' && mode !== 'dashboard') throw new Error('窗口模式无效')
    setWindowMode(mode)
  })
  ipcMain.handle('app:fit-compact-window', (_event, contentHeight: unknown) => {
    if (typeof contentHeight !== 'number' || !Number.isFinite(contentHeight)) {
      throw new Error('窗口尺寸无效')
    }
    fitCompactWindow(contentHeight)
  })
  ipcMain.handle('app:open-external', (_event, url: unknown) => {
    if (typeof url !== 'string') throw new Error('外部地址无效')
    const parsed = new URL(url)
    const allowed =
      url === 'https://my.telegram.org/apps' ||
      url === TELEGRAM_CONTACT_URL ||
      (parsed.protocol === 'https:' &&
        parsed.hostname === 'github.com' &&
        parsed.pathname.startsWith('/kakui-lau/ChatClear/releases'))
    if (!allowed) throw new Error('不允许打开该地址')
    return shell.openExternal(url)
  })
  ipcMain.handle('app:copy-sponsor-address', () => clipboard.writeText(SPONSOR_ADDRESS))
  ipcMain.handle('telegram:start-login', (_event, phoneNumber: unknown) => {
    if (typeof phoneNumber !== 'string' || phoneNumber.length > 32) {
      throw new Error('手机号格式无效')
    }
    return getTelegramService().startLogin(phoneNumber)
  })
  ipcMain.handle('telegram:submit-auth-input', (_event, kind: unknown, value: unknown) => {
    const allowedKinds: AuthInputKind[] = ['code', 'password', 'email', 'emailCode']
    if (!allowedKinds.includes(kind as AuthInputKind) || typeof value !== 'string') {
      throw new Error('登录输入无效')
    }
    return getTelegramService().submitAuthInput(kind as AuthInputKind, value)
  })
  ipcMain.handle('telegram:list-communities', () => getTelegramService().listCommunities())
  ipcMain.handle('telegram:run-batch-action', (_event, action: unknown, chatIds: unknown) => {
    const actions: BatchAction[] = ['leave', 'archive', 'unarchive', 'mute', 'clearHistory']
    if (!actions.includes(action as BatchAction) || !Array.isArray(chatIds)) {
      throw new Error('批量操作参数无效')
    }
    return getTelegramService().runBatchAction(action as BatchAction, chatIds as number[])
  })
  ipcMain.handle('telegram:leave-communities', (_event, chatIds: unknown) => {
    if (!Array.isArray(chatIds)) throw new Error('群组列表无效')
    return getTelegramService().leaveCommunities(chatIds as number[])
  })
  ipcMain.handle('telegram:get-pending-batch', () => getTelegramService().getPendingBatch())
  ipcMain.handle('telegram:resume-pending-batch', () => getTelegramService().resumePendingBatch())
  ipcMain.handle('telegram:retry-failed-batch', () => getTelegramService().retryFailedBatch())
  ipcMain.handle('telegram:cancel-leaving', () => getTelegramService().cancelLeaving())
  ipcMain.handle('app:get-activity-history', () => getTelegramService().getActivityHistory())
  ipcMain.handle('app:export-activity-history', async () => {
    const history = await getTelegramService().getActivityHistory()
    const result = await dialog.showSaveDialog({
      title: '导出 ChatClear 操作报告',
      defaultPath: `ChatClear-history-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return null
    const rows = [
      ['time', 'action', 'status', 'chat_id', 'title', 'message'].map(csvCell).join(','),
      ...history.map((entry) =>
        [
          new Date(entry.createdAt).toISOString(),
          entry.action,
          entry.status,
          entry.chatId,
          entry.title,
          entry.message ?? ''
        ]
          .map(csvCell)
          .join(',')
      )
    ]
    await writeFile(result.filePath, `\uFEFF${rows.join('\n')}\n`, { mode: 0o600 })
    return result.filePath
  })
  ipcMain.handle('app:get-account-preferences', () => getTelegramService().getAccountPreferences())
  ipcMain.handle('app:save-account-preferences', (_event, preferences: unknown) =>
    getTelegramService().saveAccountPreferences(preferences as AccountPreferences)
  )
  ipcMain.handle('app:export-local-data', async () => {
    const result = await dialog.showSaveDialog({
      title: '备份 ChatClear 本地数据',
      defaultPath: `ChatClear-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'ChatClear JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null
    const data = await getTelegramService().exportLocalData()
    await writeFile(result.filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
    return result.filePath
  })
  ipcMain.handle('app:import-local-data', async () => {
    const result = await dialog.showOpenDialog({
      title: '恢复 ChatClear 本地数据',
      properties: ['openFile'],
      filters: [{ name: 'ChatClear JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePaths[0]) return
    const raw = await readFile(result.filePaths[0], 'utf8')
    if (raw.length > 10_000_000) throw new Error('备份文件过大')
    await getTelegramService().importLocalData(JSON.parse(raw))
  })
  ipcMain.handle('telegram:list-accounts', () => getTelegramService().listAccounts())
  ipcMain.handle('telegram:add-account', () => getTelegramService().addAccount())
  ipcMain.handle('telegram:switch-account', (_event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new Error('账号标识无效')
    return getTelegramService().switchAccount(accountId)
  })
  ipcMain.handle('telegram:remove-account', (_event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new Error('账号标识无效')
    return getTelegramService().removeAccount(accountId)
  })
  ipcMain.handle('app:check-for-updates', () => checkForUpdates())
  ipcMain.handle('telegram:logout', () => getTelegramService().logout())
}

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  void app.whenReady().then(async () => {
    app.setAppUserModelId('com.chatclear.desktop')
    registerIpc()
    applyCrashReporting(await getTelegramService().getDesktopPreferences())
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (shutdownComplete) return
  event.preventDefault()
  if (shutdownStarted) return

  shutdownStarted = true
  void telegramService
    ?.close()
    .catch(() => undefined)
    .finally(() => {
      shutdownComplete = true
      app.quit()
    })
})
