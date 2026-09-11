export type AuthInputKind = 'code' | 'password' | 'email' | 'emailCode'

export type AuthStage =
  | 'idle'
  | 'connecting'
  | 'code'
  | 'password'
  | 'email'
  | 'emailCode'
  | 'otherDevice'
  | 'ready'
  | 'error'

export interface AuthEvent {
  stage: AuthStage
  message?: string
  hint?: string
  link?: string
  retry?: boolean
}

export interface UserProfile {
  id: number
  displayName: string
  username: string | null
}

export interface AppStatus {
  configured: boolean
  authorized: boolean
  profile: UserProfile | null
  proxyEnabled: boolean
}

export type ProxyType = 'none' | 'socks5' | 'http'

export interface ProxySettingsInput {
  type: ProxyType
  server: string
  port: number
  username: string
  password: string
}

export interface ConnectionSettingsInput {
  apiId: string
  apiHash: string
  proxy: ProxySettingsInput
}

export type AppWindowMode = 'compact' | 'dashboard'
export type DesktopPlatform = 'darwin' | 'win32' | 'linux'

export type CommunityKind = 'group' | 'channel'
export type CommunityRole = 'owner' | 'admin' | 'member'

export interface Community {
  id: number
  title: string
  kind: CommunityKind
  role: CommunityRole
  archived: boolean
  memberCount: number | null
  lastActivity: number | null
}

export interface LeaveProgress {
  status: 'started' | 'leaving' | 'success' | 'failed' | 'cancelled' | 'done'
  total: number
  completed: number
  chatId?: number
  title?: string
  message?: string
}

export interface LeaveSummary {
  total: number
  succeeded: number
  failed: number
  cancelled: boolean
}

export interface ChatClearApi {
  readonly platform: DesktopPlatform
  getStatus(): Promise<AppStatus>
  saveConnectionSettings(settings: ConnectionSettingsInput): Promise<AppStatus>
  clearConnectionSettings(): Promise<AppStatus>
  setWindowMode(mode: AppWindowMode): Promise<void>
  fitCompactWindow(contentHeight: number): Promise<void>
  openExternal(url: string): Promise<void>
  startLogin(phoneNumber: string): Promise<void>
  submitAuthInput(kind: AuthInputKind, value: string): Promise<void>
  listCommunities(): Promise<Community[]>
  leaveCommunities(chatIds: number[]): Promise<LeaveSummary>
  cancelLeaving(): Promise<void>
  logout(): Promise<void>
  onAuthEvent(listener: (event: AuthEvent) => void): () => void
  onLeaveProgress(listener: (event: LeaveProgress) => void): () => void
}
