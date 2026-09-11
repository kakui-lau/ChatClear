import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  TELEGRAM_CONTACT_URL,
  type AccountPreferences,
  type AccountSummary,
  type ActivityLogEntry,
  type AppStatus,
  type AuthEvent,
  type AuthInputKind,
  type BatchAction,
  type BatchTask,
  type Community,
  type ConnectionSettingsInput,
  type DesktopPreferences,
  type LeaveProgress,
  type SavedFilter,
  type UpdateStatus
} from '../shared/contracts'
import {
  defaultCommunityFilter,
  describeFilter,
  filterCommunities,
  type CommunityFilter
} from './community-filters'
import { Brand } from './components/Brand'
import { CommunityTable } from './components/CommunityTable'
import { ConfirmDialog } from './components/ConfirmDialog'
import { HistoryDialog } from './components/HistoryDialog'
import { LoginScreen } from './components/LoginScreen'
import { SettingsDialog } from './components/SettingsDialog'
import { SetupRequired } from './components/SetupRequired'
import { SupportDialog } from './components/SupportDialog'
import { tx } from './i18n'

const initialAuthEvent: AuthEvent = { stage: 'idle' }
const defaultDesktopPreferences: DesktopPreferences = {
  version: 1,
  locale: 'zh-CN',
  theme: 'system',
  protectAdmins: true,
  automaticUpdateChecks: true,
  crashReporting: false
}
const defaultAccountPreferences: AccountPreferences = {
  version: 1,
  protectedIds: [],
  savedFilters: [],
  observations: []
}

const actionLabels: Record<BatchAction, [string, string]> = {
  archive: ['归档', 'Archive'],
  unarchive: ['取消归档', 'Unarchive'],
  mute: ['静音', 'Mute'],
  clearHistory: ['清除聊天历史', 'Clear chat history'],
  leave: ['退出群组', 'Leave groups']
}

const formatError = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']+': Error: /, '')
}

const readLegacyProtectedIds = (): number[] => {
  try {
    const raw = localStorage.getItem('chatclear:preferences:v1')
    if (!raw) return []
    const parsed = JSON.parse(raw) as { version?: unknown; protectedIds?: unknown }
    return parsed.version === 1 && Array.isArray(parsed.protectedIds)
      ? parsed.protectedIds.filter((id): id is number => Number.isSafeInteger(id))
      : []
  } catch {
    return []
  }
}

export default function App() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [desktopPreferences, setDesktopPreferences] = useState(defaultDesktopPreferences)
  const [accountPreferences, setAccountPreferences] = useState(defaultAccountPreferences)
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [history, setHistory] = useState<ActivityLogEntry[]>([])
  const [pendingBatch, setPendingBatch] = useState<BatchTask | null>(null)
  const [authEvent, setAuthEvent] = useState<AuthEvent>(initialAuthEvent)
  const [authBusy, setAuthBusy] = useState(false)
  const [configBusy, setConfigBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [communities, setCommunities] = useState<Community[]>([])
  const [loadingCommunities, setLoadingCommunities] = useState(false)
  const [filter, setFilter] = useState<CommunityFilter>(defaultCommunityFilter)
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [advancedFilters, setAdvancedFilters] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [batchAction, setBatchAction] = useState<BatchAction>('archive')
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSupport, setShowSupport] = useState(false)
  const [leaveProgress, setLeaveProgress] = useState<LeaveProgress | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    state: 'idle',
    currentVersion: '0.3.0'
  })
  const [desktopReady, setDesktopReady] = useState(false)
  const updateChecked = useRef(false)
  const deferredSearch = useDeferredValue(filter.search)
  const locale = desktopPreferences.locale

  const refreshStatus = useCallback(async () => {
    try {
      const nextStatus = await window.chatclear.getStatus()
      setStatus(nextStatus)
      setError(null)
    } catch (nextError) {
      setError(formatError(nextError))
    }
  }, [])

  const refreshCommunities = useCallback(async () => {
    setLoadingCommunities(true)
    try {
      const nextCommunities = await window.chatclear.listCommunities()
      setCommunities(nextCommunities)
      setSelectedIds((current) => {
        const available = new Set(nextCommunities.map((community) => community.id))
        return new Set([...current].filter((id) => available.has(id)))
      })
      setError(null)
    } catch (nextError) {
      setError(formatError(nextError))
    } finally {
      setLoadingCommunities(false)
    }
  }, [])

  const refreshAccountData = useCallback(async (activeAccountId: string) => {
    const [preferences, nextAccounts, nextHistory, nextPending] = await Promise.all([
      window.chatclear.getAccountPreferences(),
      window.chatclear.listAccounts(),
      window.chatclear.getActivityHistory(),
      window.chatclear.getPendingBatch()
    ])
    if (activeAccountId === 'default' && preferences.protectedIds.length === 0) {
      const legacyIds = readLegacyProtectedIds()
      if (legacyIds.length > 0) {
        preferences.protectedIds = legacyIds
        await window.chatclear.saveAccountPreferences(preferences)
        localStorage.removeItem('chatclear:preferences:v1')
      }
    }
    setAccountPreferences(preferences)
    setAccounts(nextAccounts)
    setHistory(nextHistory)
    setPendingBatch(nextPending)
  }, [])

  useEffect(() => {
    let active = true
    void Promise.all([
      window.chatclear.getStatus(),
      window.chatclear.getDesktopPreferences(),
      window.chatclear.listAccounts()
    ])
      .then(([nextStatus, preferences, nextAccounts]) => {
        if (!active) return
        setStatus(nextStatus)
        setDesktopPreferences(preferences)
        setAccounts(nextAccounts)
        setDesktopReady(true)
        setError(null)
      })
      .catch((nextError: unknown) => {
        if (active) setError(formatError(nextError))
      })

    const unsubscribe = window.chatclear.onAuthEvent((event) => {
      setAuthEvent(event)
      setAuthBusy(event.stage === 'connecting')
      if (event.stage === 'error') setError(event.message ?? '登录失败')
      if (event.stage === 'ready') void refreshStatus()
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [refreshStatus])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dataset.theme = desktopPreferences.theme
  }, [desktopPreferences.theme, locale])

  useEffect(() => {
    if (!desktopReady || !desktopPreferences.automaticUpdateChecks || updateChecked.current) {
      return
    }
    updateChecked.current = true
    void window.chatclear.checkForUpdates().then(setUpdateStatus)
  }, [desktopPreferences.automaticUpdateChecks, desktopReady])

  useEffect(() => {
    const mode = status?.authorized ? 'dashboard' : 'compact'
    void window.chatclear.setWindowMode(mode)
  }, [status?.authorized])

  useEffect(() => {
    if (status?.authorized) return
    const card = document.querySelector<HTMLElement>('.auth-card')
    if (!card) return
    const fit = () => void window.chatclear.fitCompactWindow(card.scrollHeight + 56)
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(card)
    return () => observer.disconnect()
  }, [authEvent.stage, locale, status?.authorized, status?.configured])

  useEffect(() => window.chatclear.onLeaveProgress(setLeaveProgress), [])

  useEffect(() => {
    if (!status?.authorized) return
    let active = true
    const timeout = window.setTimeout(() => {
      void Promise.all([refreshCommunities(), refreshAccountData(status.activeAccountId)]).catch(
        (nextError: unknown) => {
          if (active) setError(formatError(nextError))
        }
      )
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [refreshAccountData, refreshCommunities, status?.activeAccountId, status?.authorized])

  const effectiveFilter = useMemo(
    () => ({ ...filter, search: deferredSearch }),
    [deferredSearch, filter]
  )
  const filteredCommunities = useMemo(
    () => filterCommunities(communities, effectiveFilter, accountPreferences.observations),
    [accountPreferences.observations, communities, effectiveFilter]
  )
  const communityMap = useMemo(
    () => new Map(communities.map((community) => [community.id, community])),
    [communities]
  )
  const explicitProtectedIds = useMemo(
    () => new Set(accountPreferences.protectedIds),
    [accountPreferences.protectedIds]
  )
  const systemProtectedIds = useMemo(
    () =>
      new Set(
        communities
          .filter(
            (community) =>
              community.role === 'owner' ||
              (desktopPreferences.protectAdmins && community.role === 'admin')
          )
          .map((community) => community.id)
      ),
    [communities, desktopPreferences.protectAdmins]
  )
  const allProtectedIds = useMemo(
    () => new Set([...explicitProtectedIds, ...systemProtectedIds]),
    [explicitProtectedIds, systemProtectedIds]
  )
  const selectedCommunities = useMemo(
    () => [...selectedIds].flatMap((id) => (communityMap.has(id) ? [communityMap.get(id)!] : [])),
    [communityMap, selectedIds]
  )
  const selectableVisibleIds = useMemo(
    () =>
      filteredCommunities
        .filter((community) => !allProtectedIds.has(community.id))
        .map((community) => community.id),
    [allProtectedIds, filteredCommunities]
  )
  const allVisibleSelected =
    selectableVisibleIds.length > 0 && selectableVisibleIds.every((id) => selectedIds.has(id))
  const adminCount = selectedCommunities.filter((community) => community.role === 'admin').length
  const filterSummary = describeFilter(filter, locale)
  const progressPercent = leaveProgress
    ? Math.round((leaveProgress.completed / Math.max(leaveProgress.total, 1)) * 100)
    : 0
  const processing =
    leaveProgress?.status === 'started' ||
    leaveProgress?.status === 'processing' ||
    leaveProgress?.status === 'leaving' ||
    leaveProgress?.status === 'waiting'

  const persistAccountPreferences = (next: AccountPreferences) => {
    setAccountPreferences(next)
    void window.chatclear.saveAccountPreferences(next).catch((nextError: unknown) => {
      setError(formatError(nextError))
    })
  }

  const handleStartLogin = async (phoneNumber: string) => {
    setAuthBusy(true)
    setError(null)
    try {
      await window.chatclear.startLogin(phoneNumber)
    } catch (nextError) {
      setAuthBusy(false)
      setError(formatError(nextError))
    }
  }

  const handleSaveConnectionSettings = async (settings: ConnectionSettingsInput) => {
    setConfigBusy(true)
    setError(null)
    try {
      setStatus(await window.chatclear.saveConnectionSettings(settings))
      setAuthEvent(initialAuthEvent)
    } catch (nextError) {
      setError(formatError(nextError))
    } finally {
      setConfigBusy(false)
    }
  }

  const handleChangeConnectionSettings = async () => {
    if (
      !window.confirm(
        tx(
          locale,
          '返回连接设置后，需要重新输入 API ID 和 API Hash。确定继续吗？',
          'You will need to re-enter your API ID and API Hash. Continue?'
        )
      )
    ) {
      return
    }
    setAuthBusy(true)
    setError(null)
    try {
      setStatus(await window.chatclear.clearConnectionSettings())
      setAuthEvent(initialAuthEvent)
    } catch (nextError) {
      setError(formatError(nextError))
    } finally {
      setAuthBusy(false)
    }
  }

  const handleSubmitAuth = async (kind: AuthInputKind, value: string) => {
    setAuthBusy(true)
    setError(null)
    try {
      await window.chatclear.submitAuthInput(kind, value)
    } catch (nextError) {
      setAuthBusy(false)
      setError(formatError(nextError))
    }
  }

  const handleToggleSelected = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleToggleProtected = (id: number) => {
    if (systemProtectedIds.has(id)) return
    const nextIds = new Set(explicitProtectedIds)
    if (nextIds.has(id)) nextIds.delete(id)
    else nextIds.add(id)
    persistAccountPreferences({ ...accountPreferences, protectedIds: [...nextIds] })
    setSelectedIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }

  const handleToggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) selectableVisibleIds.forEach((id) => next.delete(id))
      else selectableVisibleIds.forEach((id) => next.add(id))
      return next
    })
  }

  const handleInvertVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current)
      selectableVisibleIds.forEach((id) => {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      })
      return next
    })
  }

  const handleSelectInactive = () => {
    const nextFilter = { ...filter, inactiveDays: 90 }
    setFilter(nextFilter)
    const matches = filterCommunities(communities, nextFilter, accountPreferences.observations)
    setSelectedIds(
      new Set(matches.filter((item) => !allProtectedIds.has(item.id)).map((item) => item.id))
    )
  }

  const handleProtectSelected = () => {
    const nextIds = new Set([...explicitProtectedIds, ...selectedIds])
    persistAccountPreferences({ ...accountPreferences, protectedIds: [...nextIds] })
    setSelectedIds(new Set())
  }

  const handleUnprotectVisible = () => {
    const visible = new Set(filteredCommunities.map((item) => item.id))
    persistAccountPreferences({
      ...accountPreferences,
      protectedIds: accountPreferences.protectedIds.filter((id) => !visible.has(id))
    })
  }

  const handleObserveSelected = () => {
    const observations = new Map(
      accountPreferences.observations.map((item) => [item.chatId, item.dueAt])
    )
    const dueAt = Date.now() + 7 * 24 * 60 * 60 * 1_000
    selectedIds.forEach((id) => observations.set(id, dueAt))
    persistAccountPreferences({
      ...accountPreferences,
      observations: [...observations].map(([chatId, nextDueAt]) => ({ chatId, dueAt: nextDueAt }))
    })
    setNotice(tx(locale, '已加入 7 天观察清单', 'Added to the 7-day watchlist'))
    setSelectedIds(new Set())
  }

  const handleClearSelectedObservations = () => {
    if (selectedIds.size === 0) return
    persistAccountPreferences({
      ...accountPreferences,
      observations: accountPreferences.observations.filter(
        (observation) => !selectedIds.has(observation.chatId)
      )
    })
    setNotice(tx(locale, '已从观察清单移除', 'Removed from the watchlist'))
    setSelectedIds(new Set())
  }

  const handleSaveFilter = () => {
    const name = window.prompt(tx(locale, '为当前筛选方案命名', 'Name this filter preset'))?.trim()
    if (!name) return
    const savedFilter: SavedFilter = {
      id: crypto.randomUUID(),
      name: name.slice(0, 60),
      ...filter
    }
    persistAccountPreferences({
      ...accountPreferences,
      savedFilters: [...accountPreferences.savedFilters, savedFilter].slice(-50)
    })
    setSelectedPresetId(savedFilter.id)
  }

  const handleDeleteFilter = () => {
    if (!selectedPresetId) return
    persistAccountPreferences({
      ...accountPreferences,
      savedFilters: accountPreferences.savedFilters.filter(
        (savedFilter) => savedFilter.id !== selectedPresetId
      )
    })
    setSelectedPresetId('')
  }

  const handleRunBatch = async () => {
    const ids = selectedCommunities.map((community) => community.id)
    setShowConfirmation(false)
    setError(null)
    setNotice(null)
    try {
      const summary = await window.chatclear.runBatchAction(batchAction, ids)
      setNotice(
        tx(
          locale,
          `处理完成：成功 ${summary.succeeded}，失败 ${summary.failed}`,
          `Completed: ${summary.succeeded} succeeded, ${summary.failed} failed`
        )
      )
      setSelectedIds(new Set())
      const [nextHistory, nextPending] = await Promise.all([
        window.chatclear.getActivityHistory(),
        window.chatclear.getPendingBatch(),
        refreshCommunities()
      ])
      setHistory(nextHistory)
      setPendingBatch(nextPending)
    } catch (nextError) {
      setError(formatError(nextError))
    }
  }

  const handleResume = async (retryFailures = false) => {
    setError(null)
    try {
      const summary = retryFailures
        ? await window.chatclear.retryFailedBatch()
        : await window.chatclear.resumePendingBatch()
      setNotice(
        tx(
          locale,
          `处理完成：成功 ${summary.succeeded}，失败 ${summary.failed}`,
          `Completed: ${summary.succeeded} succeeded, ${summary.failed} failed`
        )
      )
      const [nextHistory, nextPending] = await Promise.all([
        window.chatclear.getActivityHistory(),
        window.chatclear.getPendingBatch(),
        refreshCommunities()
      ])
      setHistory(nextHistory)
      setPendingBatch(nextPending)
    } catch (nextError) {
      setError(formatError(nextError))
    }
  }

  const handleDesktopPreferences = (preferences: DesktopPreferences) => {
    setDesktopPreferences(preferences)
    void window.chatclear
      .saveDesktopPreferences(preferences)
      .catch((nextError: unknown) => setError(formatError(nextError)))
  }

  const handleCheckUpdates = async () => {
    setUpdateStatus((current) => ({ ...current, state: 'checking' }))
    try {
      const result = await window.chatclear.checkForUpdates()
      setUpdateStatus(result)
      if (result.state === 'available' && result.releaseUrl) {
        setNotice(
          tx(
            locale,
            `发现新版本 ${result.latestVersion}`,
            `Version ${result.latestVersion} is available`
          )
        )
      }
    } catch (nextError) {
      setError(formatError(nextError))
    }
  }

  const handleSwitchAccount = async (accountId: string) => {
    try {
      setShowSettings(false)
      setCommunities([])
      setSelectedIds(new Set())
      setAuthEvent(initialAuthEvent)
      const nextStatus = await window.chatclear.switchAccount(accountId)
      setStatus(nextStatus)
      setAccounts(await window.chatclear.listAccounts())
    } catch (nextError) {
      setError(formatError(nextError))
    }
  }

  const handleAddAccount = async () => {
    try {
      setShowSettings(false)
      setCommunities([])
      setSelectedIds(new Set())
      setAuthEvent(initialAuthEvent)
      const nextStatus = await window.chatclear.addAccount()
      setStatus(nextStatus)
      setAccounts(await window.chatclear.listAccounts())
    } catch (nextError) {
      setError(formatError(nextError))
    }
  }

  const handleRemoveAccount = async () => {
    if (!status) return
    if (
      !window.confirm(
        tx(
          locale,
          '移除当前账号并将其本地 session 移到废纸篓？',
          'Remove this account and move its local session to Trash?'
        )
      )
    ) {
      return
    }
    try {
      setShowSettings(false)
      setCommunities([])
      const nextStatus = await window.chatclear.removeAccount(status.activeAccountId)
      setStatus(nextStatus)
      setAccounts(await window.chatclear.listAccounts())
    } catch (nextError) {
      setError(formatError(nextError))
    }
  }

  const handleLogout = async () => {
    if (
      !window.confirm(
        tx(
          locale,
          '确定注销当前账号吗？本机 TDLib 会话将失效。',
          'Sign out this account? Its local TDLib session will be invalidated.'
        )
      )
    ) {
      return
    }
    try {
      await window.chatclear.logout()
      setCommunities([])
      setSelectedIds(new Set())
      setLeaveProgress(null)
      setAuthEvent(initialAuthEvent)
      const [nextStatus, nextAccounts] = await Promise.all([
        window.chatclear.getStatus(),
        window.chatclear.listAccounts()
      ])
      setStatus(nextStatus)
      setAccounts(nextAccounts)
    } catch (nextError) {
      setError(formatError(nextError))
    }
  }

  const handleExportHistory = async () => {
    try {
      const path = await window.chatclear.exportActivityHistory()
      if (path) setNotice(tx(locale, `已导出到 ${path}`, `Exported to ${path}`))
    } catch (nextError) {
      setError(formatError(nextError))
    }
  }

  const handleBackup = async () => {
    try {
      const path = await window.chatclear.exportLocalData()
      if (path) setNotice(tx(locale, `备份已保存到 ${path}`, `Backup saved to ${path}`))
    } catch (nextError) {
      setError(formatError(nextError))
    }
  }

  const handleRestore = async () => {
    if (!status) return
    try {
      await window.chatclear.importLocalData()
      await refreshAccountData(status.activeAccountId)
      setNotice(tx(locale, '本地偏好已恢复', 'Local preferences restored'))
    } catch (nextError) {
      setError(formatError(nextError))
    }
  }

  const handleOpenRelease = async () => {
    if (!updateStatus.releaseUrl) return
    try {
      await window.chatclear.openExternal(updateStatus.releaseUrl)
    } catch (nextError) {
      setError(formatError(nextError))
    }
  }

  const handleOpenTelegram = async () => {
    try {
      await window.chatclear.openExternal(TELEGRAM_CONTACT_URL)
    } catch (nextError) {
      setError(formatError(nextError))
    }
  }

  const handleCopySponsor = async () => {
    try {
      await window.chatclear.copySponsorAddress()
    } catch (nextError) {
      setError(formatError(nextError))
      throw nextError
    }
  }

  if (!status) {
    if (error) {
      return (
        <main className="auth-shell">
          <section className="auth-card setup-card">
            <Brand />
            <p className="eyebrow danger-eyebrow">STARTUP ERROR</p>
            <h1>{tx(locale, '启动遇到问题', 'Startup problem')}</h1>
            <p className="error-line" role="alert">
              {error}
            </p>
            <button className="primary-button" type="button" onClick={() => void refreshStatus()}>
              {tx(locale, '重新检查', 'Try again')}
            </button>
          </section>
        </main>
      )
    }
    return (
      <main className="loading-screen">
        <img alt="" className="loading-mark" height="58" src="./chatclear-logo.png" width="58" />
        <p>{tx(locale, '正在打开本地会话…', 'Opening local session…')}</p>
      </main>
    )
  }

  if (!status.configured) {
    return (
      <SetupRequired
        busy={configBusy}
        error={error}
        locale={locale}
        onSave={handleSaveConnectionSettings}
      />
    )
  }

  if (!status.authorized) {
    return (
      <LoginScreen
        accounts={accounts}
        activeAccountId={status.activeAccountId}
        authEvent={authEvent}
        busy={authBusy}
        error={error}
        locale={locale}
        proxyEnabled={status.proxyEnabled}
        onStart={handleStartLogin}
        onSubmit={handleSubmitAuth}
        onChangeSettings={handleChangeConnectionSettings}
        onSwitchAccount={handleSwitchAccount}
        onAddAccount={handleAddAccount}
      />
    )
  }

  const profile = status.profile

  return (
    <div className={`app-shell platform-${window.chatclear.platform}`}>
      <a className="skip-link" href="#main-content">
        {tx(locale, '跳到主要内容', 'Skip to main content')}
      </a>
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <button className="text-button" type="button" onClick={() => setShowSupport(true)}>
            {tx(locale, '联系', 'Contact')}
          </button>
          <button className="text-button" type="button" onClick={() => setShowHistory(true)}>
            {tx(locale, '历史', 'History')}
          </button>
          <button className="text-button" type="button" onClick={() => setShowSettings(true)}>
            {tx(locale, '设置', 'Settings')}
          </button>
          <div className="profile-block">
            <span className="profile-avatar" aria-hidden="true">
              {profile?.displayName.slice(0, 1).toUpperCase() ?? 'U'}
            </span>
            <span>
              <strong>{profile?.displayName}</strong>
              <small>
                {profile?.username ? `@${profile.username}` : tx(locale, '已安全登录', 'Signed in')}
              </small>
            </span>
            <button className="text-button" type="button" onClick={handleLogout}>
              {tx(locale, '注销', 'Sign out')}
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard" id="main-content" tabIndex={-1}>
        <section className="page-heading">
          <div>
            <p className="eyebrow">COMMUNITY REVIEW</p>
            <h1>{tx(locale, '决定哪些群组值得留下', 'Decide what deserves to stay')}</h1>
            <p>
              {tx(
                locale,
                '仅同步群组元数据，不读取消息正文。群主创建的群始终锁定。',
                'Only group metadata is synced. Message content is never read. Owner groups stay locked.'
              )}
            </p>
          </div>
          <div
            className="summary-cards"
            aria-label={tx(locale, '群组统计', 'Community statistics')}
          >
            <div>
              <strong>{communities.length}</strong>
              <span>{tx(locale, '全部', 'All')}</span>
            </div>
            <div>
              <strong>{communities.filter((item) => item.kind === 'group').length}</strong>
              <span>{tx(locale, '群组', 'Groups')}</span>
            </div>
            <div>
              <strong>{allProtectedIds.size}</strong>
              <span>{tx(locale, '已保护', 'Protected')}</span>
            </div>
            <div>
              <strong>{accountPreferences.observations.length}</strong>
              <span>{tx(locale, '观察中', 'Watching')}</span>
            </div>
          </div>
        </section>

        {pendingBatch ? (
          <aside className="resume-banner">
            <span>
              {tx(
                locale,
                `有一个未完成的${actionLabels[pendingBatch.action][0]}任务，剩余 ${pendingBatch.remainingChatIds.length} 项。`,
                `An unfinished ${actionLabels[pendingBatch.action][1].toLowerCase()} task has ${pendingBatch.remainingChatIds.length} items left.`
              )}
            </span>
            <button
              className="secondary-button"
              disabled={processing}
              type="button"
              onClick={() => void handleResume()}
            >
              {tx(locale, '继续任务', 'Resume')}
            </button>
          </aside>
        ) : null}

        <section className="workspace" aria-label={tx(locale, '群组列表', 'Community list')}>
          <div className="toolbar">
            <label className="search-field">
              <span className="sr-only">{tx(locale, '搜索群组', 'Search communities')}</span>
              <span aria-hidden="true">⌕</span>
              <input
                autoComplete="off"
                name="community-search"
                type="search"
                placeholder={tx(
                  locale,
                  '包含关键词，逗号分隔…',
                  'Include keywords, comma-separated…'
                )}
                value={filter.search}
                onChange={(event) =>
                  setFilter((current) => ({ ...current, search: event.target.value }))
                }
              />
            </label>
            <select
              aria-label={tx(locale, '类型', 'Type')}
              value={filter.kind}
              onChange={(event) =>
                setFilter((current) => ({
                  ...current,
                  kind: event.target.value as CommunityFilter['kind']
                }))
              }
            >
              <option value="all">{tx(locale, '全部类型', 'All types')}</option>
              <option value="group">{tx(locale, '群组', 'Groups')}</option>
              <option value="channel">{tx(locale, '频道', 'Channels')}</option>
            </select>
            <select
              aria-label={tx(locale, '位置', 'Location')}
              value={filter.location}
              onChange={(event) =>
                setFilter((current) => ({
                  ...current,
                  location: event.target.value as CommunityFilter['location']
                }))
              }
            >
              <option value="all">{tx(locale, '全部位置', 'All locations')}</option>
              <option value="main">{tx(locale, '主列表', 'Main')}</option>
              <option value="archive">{tx(locale, '已归档', 'Archived')}</option>
            </select>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setAdvancedFilters((value) => !value)}
            >
              {advancedFilters
                ? tx(locale, '收起规则', 'Hide rules')
                : tx(locale, '更多规则', 'More rules')}
            </button>
            <button
              className="secondary-button"
              disabled={loadingCommunities || processing}
              type="button"
              onClick={() => void refreshCommunities()}
            >
              {loadingCommunities
                ? tx(locale, '同步中…', 'Syncing…')
                : tx(locale, '重新同步', 'Sync')}
            </button>
          </div>

          {advancedFilters ? (
            <div className="advanced-filter-panel">
              <label>
                <span>{tx(locale, '排除关键词', 'Exclude keywords')}</span>
                <input
                  value={filter.exclude}
                  placeholder={tx(locale, '逗号分隔', 'Comma-separated')}
                  onChange={(event) =>
                    setFilter((current) => ({ ...current, exclude: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>{tx(locale, '身份', 'Role')}</span>
                <select
                  value={filter.role}
                  onChange={(event) =>
                    setFilter((current) => ({
                      ...current,
                      role: event.target.value as CommunityFilter['role']
                    }))
                  }
                >
                  <option value="all">{tx(locale, '全部', 'All')}</option>
                  <option value="member">{tx(locale, '成员', 'Member')}</option>
                  <option value="admin">{tx(locale, '管理员', 'Admin')}</option>
                  <option value="owner">{tx(locale, '群主', 'Owner')}</option>
                </select>
              </label>
              <label>
                <span>{tx(locale, '未活跃时间', 'Inactive for')}</span>
                <select
                  value={filter.inactiveDays}
                  onChange={(event) =>
                    setFilter((current) => ({
                      ...current,
                      inactiveDays: Number(event.target.value)
                    }))
                  }
                >
                  <option value="0">{tx(locale, '不限', 'Any')}</option>
                  <option value="30">30 {tx(locale, '天', 'days')}</option>
                  <option value="90">90 {tx(locale, '天', 'days')}</option>
                  <option value="180">180 {tx(locale, '天', 'days')}</option>
                  <option value="365">1 {tx(locale, '年', 'year')}</option>
                  <option value="730">2 {tx(locale, '年', 'years')}</option>
                </select>
              </label>
              <label>
                <span>{tx(locale, '最少成员', 'Min members')}</span>
                <input
                  min="0"
                  type="number"
                  value={filter.minMembers ?? ''}
                  onChange={(event) =>
                    setFilter((current) => ({
                      ...current,
                      minMembers: event.target.value ? Number(event.target.value) : null
                    }))
                  }
                />
              </label>
              <label>
                <span>{tx(locale, '最多成员', 'Max members')}</span>
                <input
                  min="0"
                  type="number"
                  value={filter.maxMembers ?? ''}
                  onChange={(event) =>
                    setFilter((current) => ({
                      ...current,
                      maxMembers: event.target.value ? Number(event.target.value) : null
                    }))
                  }
                />
              </label>
              <label>
                <span>{tx(locale, '观察清单', 'Watchlist')}</span>
                <select
                  value={filter.observation}
                  onChange={(event) =>
                    setFilter((current) => ({
                      ...current,
                      observation: event.target.value as CommunityFilter['observation']
                    }))
                  }
                >
                  <option value="all">{tx(locale, '全部', 'All')}</option>
                  <option value="watching">{tx(locale, '观察中', 'Watching')}</option>
                  <option value="due">{tx(locale, '已到期', 'Due')}</option>
                </select>
              </label>
              <div className="preset-controls">
                <select
                  aria-label={tx(locale, '已保存方案', 'Saved presets')}
                  value={selectedPresetId}
                  onChange={(event) => {
                    setSelectedPresetId(event.target.value)
                    const preset = accountPreferences.savedFilters.find(
                      (item) => item.id === event.target.value
                    )
                    if (preset) {
                      setFilter({
                        search: preset.search,
                        exclude: preset.exclude,
                        kind: preset.kind,
                        location: preset.location,
                        role: preset.role,
                        observation: preset.observation,
                        inactiveDays: preset.inactiveDays,
                        minMembers: preset.minMembers,
                        maxMembers: preset.maxMembers
                      })
                    }
                  }}
                >
                  <option value="">{tx(locale, '载入方案…', 'Load preset…')}</option>
                  {accountPreferences.savedFilters.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <button className="secondary-button" type="button" onClick={handleSaveFilter}>
                  {tx(locale, '保存方案', 'Save preset')}
                </button>
                <button
                  className="text-button danger-text"
                  disabled={!selectedPresetId}
                  type="button"
                  onClick={handleDeleteFilter}
                >
                  {tx(locale, '删除方案', 'Delete preset')}
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setFilter(defaultCommunityFilter)}
                >
                  {tx(locale, '清除规则', 'Clear')}
                </button>
              </div>
            </div>
          ) : null}

          <div className="selection-bar selection-tools">
            <label>
              <input
                checked={allVisibleSelected}
                disabled={selectableVisibleIds.length === 0 || processing}
                type="checkbox"
                onChange={handleToggleAllVisible}
              />
              {tx(locale, '选择当前结果', 'Select results')}
            </label>
            <div>
              <button className="text-button" type="button" onClick={handleInvertVisible}>
                {tx(locale, '反选', 'Invert')}
              </button>
              <button className="text-button" type="button" onClick={handleSelectInactive}>
                {tx(locale, '选择 90 天未活跃', 'Select inactive 90d')}
              </button>
              <button
                className="text-button"
                disabled={selectedIds.size === 0}
                type="button"
                onClick={handleProtectSelected}
              >
                {tx(locale, '保护所选', 'Protect selected')}
              </button>
              <button className="text-button" type="button" onClick={handleUnprotectVisible}>
                {tx(locale, '取消当前保护', 'Unprotect results')}
              </button>
              <button
                className="text-button"
                disabled={selectedIds.size === 0}
                type="button"
                onClick={handleObserveSelected}
              >
                {tx(locale, '观察 7 天', 'Watch 7 days')}
              </button>
              <button
                className="text-button"
                disabled={selectedIds.size === 0}
                type="button"
                onClick={handleClearSelectedObservations}
              >
                {tx(locale, '移出观察', 'Remove watch')}
              </button>
            </div>
            <span>
              {tx(
                locale,
                `${filteredCommunities.length} 个结果 · 已选 ${selectedIds.size} 个`,
                `${filteredCommunities.length} results · ${selectedIds.size} selected`
              )}
            </span>
          </div>

          {error ? (
            <p className="dashboard-error" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="dashboard-notice" role="status">
              {notice}
            </p>
          ) : null}

          <CommunityTable
            communities={filteredCommunities}
            locale={locale}
            observations={accountPreferences.observations}
            protectedIds={allProtectedIds}
            selectedIds={selectedIds}
            systemProtectedIds={systemProtectedIds}
            onToggleProtected={handleToggleProtected}
            onToggleSelected={handleToggleSelected}
          />
        </section>
      </main>

      {leaveProgress ? (
        <aside className="progress-panel" aria-live="polite">
          <div className="progress-copy">
            <strong>
              {leaveProgress.title ??
                leaveProgress.message ??
                tx(locale, '正在处理批量任务', 'Processing batch task')}
            </strong>
            <span>
              {leaveProgress.completed} / {leaveProgress.total}
            </span>
          </div>
          <div className="progress-track">
            <span
              aria-label={tx(locale, '任务进度', 'Task progress')}
              aria-valuemax={leaveProgress.total}
              aria-valuemin={0}
              aria-valuenow={leaveProgress.completed}
              role="progressbar"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {processing ? (
            <button
              className="text-button"
              type="button"
              onClick={() => void window.chatclear.cancelLeaving()}
            >
              {tx(locale, '完成当前项后暂停', 'Pause after current item')}
            </button>
          ) : (
            <div className="inline-actions">
              <button className="text-button" type="button" onClick={() => setLeaveProgress(null)}>
                {tx(locale, '关闭', 'Close')}
              </button>
              {leaveProgress.status === 'done' ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => void handleResume(true)}
                >
                  {tx(locale, '重试失败项', 'Retry failures')}
                </button>
              ) : null}
            </div>
          )}
        </aside>
      ) : null}

      <footer className="action-dock">
        <p>
          <strong>{selectedIds.size}</strong>{' '}
          {tx(locale, '个会话等待处理', 'conversations selected')}
          {adminCount > 0 ? (
            <span>
              {' '}
              · {tx(locale, `含 ${adminCount} 个管理员会话`, `${adminCount} admin conversations`)}
            </span>
          ) : null}
        </p>
        <div className="dock-actions">
          <select
            aria-label={tx(locale, '批量操作', 'Batch action')}
            value={batchAction}
            onChange={(event) => setBatchAction(event.target.value as BatchAction)}
          >
            {Object.entries(actionLabels).map(([action, labels]) => (
              <option key={action} value={action}>
                {locale === 'en' ? labels[1] : labels[0]}
              </option>
            ))}
          </select>
          <button
            className={
              batchAction === 'leave' || batchAction === 'clearHistory'
                ? 'danger-button'
                : 'primary-button dock-button'
            }
            disabled={selectedIds.size === 0 || processing}
            type="button"
            onClick={() => setShowConfirmation(true)}
          >
            {tx(locale, '审核并执行', 'Review & run')}
          </button>
        </div>
      </footer>

      {showConfirmation ? (
        <ConfirmDialog
          action={batchAction}
          adminCount={adminCount}
          count={selectedIds.size}
          filterSummary={filterSummary}
          locale={locale}
          onCancel={() => setShowConfirmation(false)}
          onConfirm={() => void handleRunBatch()}
        />
      ) : null}
      {showHistory ? (
        <HistoryDialog
          entries={history}
          locale={locale}
          onClose={() => setShowHistory(false)}
          onExport={() => void handleExportHistory()}
          onRetry={() => void handleResume(true)}
        />
      ) : null}
      {showSettings ? (
        <SettingsDialog
          accounts={accounts}
          activeAccountId={status.activeAccountId}
          preferences={desktopPreferences}
          updateStatus={updateStatus}
          onClose={() => setShowSettings(false)}
          onPreferencesChange={handleDesktopPreferences}
          onSwitchAccount={(id) => void handleSwitchAccount(id)}
          onAddAccount={() => void handleAddAccount()}
          onRemoveAccount={() => void handleRemoveAccount()}
          onBackup={() => void handleBackup()}
          onRestore={() => void handleRestore()}
          onCheckUpdates={() => void handleCheckUpdates()}
          onOpenRelease={() => void handleOpenRelease()}
        />
      ) : null}
      {showSupport ? (
        <SupportDialog
          locale={locale}
          onClose={() => setShowSupport(false)}
          onCopySponsor={handleCopySponsor}
          onOpenTelegram={() => void handleOpenTelegram()}
        />
      ) : null}
    </div>
  )
}
