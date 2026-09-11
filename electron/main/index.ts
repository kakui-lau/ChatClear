import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import type {
  AppWindowMode,
  AuthInputKind,
  ConnectionSettingsInput,
  ProxyType
} from '../../shared/contracts'
import { TelegramService } from './telegram-service'

let mainWindow: BrowserWindow | null = null
let telegramService: TelegramService | null = null
let shutdownStarted = false
let shutdownComplete = false

const hasSingleInstanceLock = app.requestSingleInstanceLock()

const getTelegramService = (): TelegramService => {
  if (!telegramService) throw new Error('Telegram 服务尚未初始化')
  return telegramService
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
    if (url !== 'https://my.telegram.org/apps') throw new Error('不允许打开该地址')
    return shell.openExternal(url)
  })
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
  ipcMain.handle('telegram:leave-communities', (_event, chatIds: unknown) => {
    if (!Array.isArray(chatIds)) throw new Error('群组列表无效')
    return getTelegramService().leaveCommunities(chatIds as number[])
  })
  ipcMain.handle('telegram:cancel-leaving', () => getTelegramService().cancelLeaving())
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

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.chatclear.desktop')
    registerIpc()
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
