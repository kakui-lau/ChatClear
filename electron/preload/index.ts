import { contextBridge, ipcRenderer } from 'electron'
import type {
  AuthEvent,
  AuthInputKind,
  ChatClearApi,
  DesktopPlatform,
  LeaveProgress
} from '../../shared/contracts'

const platform: DesktopPlatform =
  process.platform === 'darwin' || process.platform === 'win32' ? process.platform : 'linux'

const api: ChatClearApi = {
  platform,
  getDesktopPreferences: () => ipcRenderer.invoke('app:get-desktop-preferences'),
  saveDesktopPreferences: (preferences) =>
    ipcRenderer.invoke('app:save-desktop-preferences', preferences),
  getStatus: () => ipcRenderer.invoke('telegram:status'),
  saveConnectionSettings: (settings) =>
    ipcRenderer.invoke('telegram:save-connection-settings', settings),
  clearConnectionSettings: () => ipcRenderer.invoke('telegram:clear-connection-settings'),
  setWindowMode: (mode) => ipcRenderer.invoke('app:set-window-mode', mode),
  fitCompactWindow: (contentHeight) => ipcRenderer.invoke('app:fit-compact-window', contentHeight),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  startLogin: (phoneNumber) => ipcRenderer.invoke('telegram:start-login', phoneNumber),
  submitAuthInput: (kind, value) => ipcRenderer.invoke('telegram:submit-auth-input', kind, value),
  listCommunities: () => ipcRenderer.invoke('telegram:list-communities'),
  runBatchAction: (action, chatIds) =>
    ipcRenderer.invoke('telegram:run-batch-action', action, chatIds),
  leaveCommunities: (chatIds) => ipcRenderer.invoke('telegram:leave-communities', chatIds),
  getPendingBatch: () => ipcRenderer.invoke('telegram:get-pending-batch'),
  resumePendingBatch: () => ipcRenderer.invoke('telegram:resume-pending-batch'),
  retryFailedBatch: () => ipcRenderer.invoke('telegram:retry-failed-batch'),
  cancelLeaving: () => ipcRenderer.invoke('telegram:cancel-leaving'),
  getActivityHistory: () => ipcRenderer.invoke('app:get-activity-history'),
  exportActivityHistory: () => ipcRenderer.invoke('app:export-activity-history'),
  getAccountPreferences: () => ipcRenderer.invoke('app:get-account-preferences'),
  saveAccountPreferences: (preferences) =>
    ipcRenderer.invoke('app:save-account-preferences', preferences),
  exportLocalData: () => ipcRenderer.invoke('app:export-local-data'),
  importLocalData: () => ipcRenderer.invoke('app:import-local-data'),
  listAccounts: () => ipcRenderer.invoke('telegram:list-accounts'),
  addAccount: () => ipcRenderer.invoke('telegram:add-account'),
  switchAccount: (accountId) => ipcRenderer.invoke('telegram:switch-account', accountId),
  removeAccount: (accountId) => ipcRenderer.invoke('telegram:remove-account', accountId),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  logout: () => ipcRenderer.invoke('telegram:logout'),
  onAuthEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AuthEvent) => listener(payload)
    ipcRenderer.on('telegram:auth-event', handler)
    return () => ipcRenderer.removeListener('telegram:auth-event', handler)
  },
  onLeaveProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: LeaveProgress) => listener(payload)
    ipcRenderer.on('telegram:leave-progress', handler)
    return () => ipcRenderer.removeListener('telegram:leave-progress', handler)
  }
}

contextBridge.exposeInMainWorld('chatclear', api)

export type { AuthInputKind }
