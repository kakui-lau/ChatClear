import { contextBridge, ipcRenderer } from 'electron'
import type { AuthEvent, AuthInputKind, ChatClearApi, LeaveProgress } from '../../shared/contracts'

const api: ChatClearApi = {
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
  leaveCommunities: (chatIds) => ipcRenderer.invoke('telegram:leave-communities', chatIds),
  cancelLeaving: () => ipcRenderer.invoke('telegram:cancel-leaving'),
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
