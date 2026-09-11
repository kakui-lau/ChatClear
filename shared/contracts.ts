export type AuthInputKind = 'code' | 'password' | 'email' | 'emailCode'

export const TELEGRAM_CONTACT_URL = 'https://t.me/tg_kakui'
export const SPONSOR_ADDRESS = '0x435d2f7f70c220e4218adfa090da964928888888'

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
  activeAccountId: string
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

export type Locale = 'zh-CN' | 'en'
export type Theme = 'system' | 'light' | 'dark'

export interface DesktopPreferences {
  version: 1
  locale: Locale
  theme: Theme
  protectAdmins: boolean
  automaticUpdateChecks: boolean
  crashReporting: boolean
}

export interface AccountSummary {
  id: string
  displayName: string
  username: string | null
  authorized: boolean
  createdAt: number
}

export type CommunityKind = 'group' | 'channel'
export type CommunityRole = 'owner' | 'admin' | 'member'

export interface Community {
  id: number
  title: string
  kind: CommunityKind
  role: CommunityRole
  archived: boolean
  muted: boolean
  memberCount: number | null
  lastActivity: number | null
}

export type BatchAction = 'leave' | 'archive' | 'unarchive' | 'mute' | 'clearHistory'
export type BatchItemStatus = 'success' | 'failed'

export interface BatchResult {
  chatId: number
  title: string
  status: BatchItemStatus
  message?: string
}

export interface BatchTask {
  id: string
  action: BatchAction
  chatIds: number[]
  remainingChatIds: number[]
  completed: number
  createdAt: number
}

export interface LeaveProgress {
  status:
    'started' | 'processing' | 'leaving' | 'waiting' | 'success' | 'failed' | 'cancelled' | 'done'
  action: BatchAction
  total: number
  completed: number
  chatId?: number
  title?: string
  message?: string
  retryAt?: number
}

export interface LeaveSummary {
  action: BatchAction
  total: number
  succeeded: number
  failed: number
  cancelled: boolean
  results: BatchResult[]
}

export interface ActivityLogEntry extends BatchResult {
  id: string
  accountId: string
  action: BatchAction
  createdAt: number
}

export interface SavedFilter {
  id: string
  name: string
  search: string
  exclude: string
  kind: 'all' | CommunityKind
  location: 'all' | 'main' | 'archive'
  role: 'all' | CommunityRole
  observation: 'all' | 'watching' | 'due'
  inactiveDays: number
  minMembers: number | null
  maxMembers: number | null
}

export interface Observation {
  chatId: number
  dueAt: number
}

export interface AccountPreferences {
  version: 1
  protectedIds: number[]
  savedFilters: SavedFilter[]
  observations: Observation[]
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'current' | 'error'
  currentVersion: string
  latestVersion?: string
  releaseUrl?: string
  message?: string
}

export interface ChatClearApi {
  readonly platform: DesktopPlatform
  getDesktopPreferences(): Promise<DesktopPreferences>
  saveDesktopPreferences(preferences: DesktopPreferences): Promise<DesktopPreferences>
  getStatus(): Promise<AppStatus>
  saveConnectionSettings(settings: ConnectionSettingsInput): Promise<AppStatus>
  clearConnectionSettings(): Promise<AppStatus>
  setWindowMode(mode: AppWindowMode): Promise<void>
  fitCompactWindow(contentHeight: number): Promise<void>
  openExternal(url: string): Promise<void>
  copySponsorAddress(): Promise<void>
  startLogin(phoneNumber: string): Promise<void>
  submitAuthInput(kind: AuthInputKind, value: string): Promise<void>
  listCommunities(): Promise<Community[]>
  leaveCommunities(chatIds: number[]): Promise<LeaveSummary>
  runBatchAction(action: BatchAction, chatIds: number[]): Promise<LeaveSummary>
  getPendingBatch(): Promise<BatchTask | null>
  resumePendingBatch(): Promise<LeaveSummary>
  retryFailedBatch(): Promise<LeaveSummary>
  cancelLeaving(): Promise<void>
  getActivityHistory(): Promise<ActivityLogEntry[]>
  exportActivityHistory(): Promise<string | null>
  getAccountPreferences(): Promise<AccountPreferences>
  saveAccountPreferences(preferences: AccountPreferences): Promise<AccountPreferences>
  exportLocalData(): Promise<string | null>
  importLocalData(): Promise<void>
  listAccounts(): Promise<AccountSummary[]>
  addAccount(): Promise<AppStatus>
  switchAccount(accountId: string): Promise<AppStatus>
  removeAccount(accountId: string): Promise<AppStatus>
  checkForUpdates(): Promise<UpdateStatus>
  logout(): Promise<void>
  onAuthEvent(listener: (event: AuthEvent) => void): () => void
  onLeaveProgress(listener: (event: LeaveProgress) => void): () => void
}
