import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import type {
  AppStatus,
  AuthEvent,
  AuthInputKind,
  Community,
  ConnectionSettingsInput,
  LeaveProgress
} from '../shared/contracts'
import { Brand } from './components/Brand'
import { CommunityTable } from './components/CommunityTable'
import { ConfirmDialog } from './components/ConfirmDialog'
import { LoginScreen } from './components/LoginScreen'
import { SetupRequired } from './components/SetupRequired'

type KindFilter = 'all' | Community['kind']
type LocationFilter = 'all' | 'main' | 'archive'

interface StoredPreferences {
  version: 1
  protectedIds: number[]
}

const preferencesKey = 'chatclear:preferences:v1'
const initialAuthEvent: AuthEvent = { stage: 'idle' }

const formatError = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']+': Error: /, '')
}

const loadProtectedIds = (): Set<number> => {
  try {
    const raw = localStorage.getItem(preferencesKey)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as StoredPreferences
    if (parsed.version !== 1 || !Array.isArray(parsed.protectedIds)) return new Set()
    return new Set(parsed.protectedIds.filter((id) => Number.isSafeInteger(id)))
  } catch {
    return new Set()
  }
}

export default function App() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [authEvent, setAuthEvent] = useState<AuthEvent>(initialAuthEvent)
  const [authBusy, setAuthBusy] = useState(false)
  const [configBusy, setConfigBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [communities, setCommunities] = useState<Community[]>([])
  const [loadingCommunities, setLoadingCommunities] = useState(false)
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [protectedIds, setProtectedIds] = useState<Set<number>>(loadProtectedIds)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [leaveProgress, setLeaveProgress] = useState<LeaveProgress | null>(null)
  const deferredSearch = useDeferredValue(search)

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

  useEffect(() => {
    let active = true
    void window.chatclear
      .getStatus()
      .then((nextStatus) => {
        if (!active) return
        setStatus(nextStatus)
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
  }, [authEvent.stage, status?.authorized, status?.configured])

  useEffect(() => {
    return window.chatclear.onLeaveProgress((event) => setLeaveProgress(event))
  }, [])

  useEffect(() => {
    if (!status?.authorized) return
    const task = window.setTimeout(() => void refreshCommunities(), 0)
    return () => window.clearTimeout(task)
  }, [status?.authorized, refreshCommunities])

  useEffect(() => {
    const preferences: StoredPreferences = { version: 1, protectedIds: [...protectedIds] }
    localStorage.setItem(preferencesKey, JSON.stringify(preferences))
  }, [protectedIds])

  const filteredCommunities = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLocaleLowerCase('zh-CN')
    return communities.filter((community) => {
      if (kindFilter !== 'all' && community.kind !== kindFilter) return false
      if (locationFilter === 'main' && community.archived) return false
      if (locationFilter === 'archive' && !community.archived) return false
      return (
        !normalizedSearch || community.title.toLocaleLowerCase('zh-CN').includes(normalizedSearch)
      )
    })
  }, [communities, deferredSearch, kindFilter, locationFilter])

  const selectedCommunities = useMemo(() => {
    const selected = selectedIds
    return communities.filter((community) => selected.has(community.id))
  }, [communities, selectedIds])

  const selectableVisibleIds = useMemo(
    () =>
      filteredCommunities
        .filter((community) => community.role !== 'owner' && !protectedIds.has(community.id))
        .map((community) => community.id),
    [filteredCommunities, protectedIds]
  )

  const allVisibleSelected =
    selectableVisibleIds.length > 0 && selectableVisibleIds.every((id) => selectedIds.has(id))

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
      const nextStatus = await window.chatclear.saveConnectionSettings(settings)
      setStatus(nextStatus)
      setAuthEvent(initialAuthEvent)
    } catch (nextError) {
      setError(formatError(nextError))
    } finally {
      setConfigBusy(false)
    }
  }

  const handleChangeConnectionSettings = async () => {
    if (!window.confirm('返回连接设置后，需要重新输入 API ID 和 API Hash。确定继续吗？')) return
    setAuthBusy(true)
    setError(null)
    try {
      const nextStatus = await window.chatclear.clearConnectionSettings()
      setStatus(nextStatus)
      setAuthEvent(initialAuthEvent)
    } catch (nextError) {
      setError(formatError(nextError))
    } finally {
      setAuthBusy(false)
    }
  }

  const handleResetBrokenSettings = async () => {
    if (!window.confirm('确定清除本机连接设置吗？Telegram 登录会话不会因此注销。')) return
    setError(null)
    try {
      const nextStatus = await window.chatclear.clearConnectionSettings()
      setStatus(nextStatus)
      setAuthEvent(initialAuthEvent)
    } catch (nextError) {
      setError(formatError(nextError))
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
    setProtectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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

  const handleConfirmLeave = async () => {
    const ids = selectedCommunities.map((community) => community.id)
    setShowConfirmation(false)
    setError(null)
    try {
      await window.chatclear.leaveCommunities(ids)
      setSelectedIds(new Set())
      await refreshCommunities()
    } catch (nextError) {
      setError(formatError(nextError))
    }
  }

  const handleLogout = async () => {
    if (!window.confirm('确定要注销当前账号吗？本机 TDLib 会话将失效。')) return
    try {
      await window.chatclear.logout()
      setCommunities([])
      setSelectedIds(new Set())
      setLeaveProgress(null)
      setAuthEvent(initialAuthEvent)
      await refreshStatus()
    } catch (nextError) {
      setError(formatError(nextError))
    }
  }

  if (!status) {
    if (error) {
      return (
        <main className="auth-shell">
          <section className="auth-card setup-card">
            <Brand />
            <p className="eyebrow danger-eyebrow">STARTUP ERROR</p>
            <h1>启动遇到问题</h1>
            <p className="error-line" role="alert">
              {error}
            </p>
            <div className="startup-actions">
              <button className="primary-button" type="button" onClick={() => void refreshStatus()}>
                重新检查
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void handleResetBrokenSettings()}
              >
                重置连接设置
              </button>
            </div>
          </section>
        </main>
      )
    }

    return (
      <main className="loading-screen">
        <img alt="" className="loading-mark" height="58" src="/chatclear-logo.png" width="58" />
        <p>正在打开本地会话…</p>
      </main>
    )
  }

  if (!status.configured) {
    return <SetupRequired busy={configBusy} error={error} onSave={handleSaveConnectionSettings} />
  }

  if (!status.authorized) {
    return (
      <LoginScreen
        authEvent={authEvent}
        busy={authBusy}
        error={error}
        proxyEnabled={status.proxyEnabled}
        onStart={handleStartLogin}
        onSubmit={handleSubmitAuth}
        onChangeSettings={handleChangeConnectionSettings}
      />
    )
  }

  const profile = status.profile
  const adminCount = selectedCommunities.filter((community) => community.role === 'admin').length
  const progressPercent = leaveProgress
    ? Math.round((leaveProgress.completed / Math.max(leaveProgress.total, 1)) * 100)
    : 0
  const leaving = leaveProgress?.status === 'started' || leaveProgress?.status === 'leaving'

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="topbar">
        <Brand />
        <div className="profile-block">
          <span className="profile-avatar" aria-hidden="true">
            {profile?.displayName.slice(0, 1).toUpperCase() ?? 'U'}
          </span>
          <span>
            <strong>{profile?.displayName}</strong>
            <small>{profile?.username ? `@${profile.username}` : '已安全登录'}</small>
          </span>
          <button className="text-button" type="button" onClick={handleLogout}>
            注销
          </button>
        </div>
      </header>

      <main className="dashboard" id="main-content" tabIndex={-1}>
        <section className="page-heading">
          <div>
            <p className="eyebrow">COMMUNITY REVIEW</p>
            <h1>决定哪些群组值得留下</h1>
            <p>仅同步群组元数据，不读取消息正文。群主创建的群始终锁定。</p>
          </div>
          <div className="summary-cards" aria-label="群组统计">
            <div>
              <strong>{communities.length}</strong>
              <span>全部</span>
            </div>
            <div>
              <strong>{communities.filter((item) => item.kind === 'group').length}</strong>
              <span>群组</span>
            </div>
            <div>
              <strong>{protectedIds.size}</strong>
              <span>已保护</span>
            </div>
          </div>
        </section>

        <section className="workspace" aria-label="群组列表">
          <div className="toolbar">
            <label className="search-field">
              <span className="sr-only">搜索群组</span>
              <span aria-hidden="true">⌕</span>
              <input
                autoComplete="off"
                name="community-search"
                type="search"
                placeholder="搜索群组或频道…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <label>
              <span className="sr-only">类型</span>
              <select
                name="community-kind"
                value={kindFilter}
                onChange={(event) => setKindFilter(event.target.value as KindFilter)}
              >
                <option value="all">全部类型</option>
                <option value="group">群组</option>
                <option value="channel">频道</option>
              </select>
            </label>

            <label>
              <span className="sr-only">位置</span>
              <select
                name="community-location"
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value as LocationFilter)}
              >
                <option value="all">全部位置</option>
                <option value="main">主列表</option>
                <option value="archive">已归档</option>
              </select>
            </label>

            <button
              className="secondary-button"
              disabled={loadingCommunities || leaving}
              type="button"
              onClick={() => void refreshCommunities()}
            >
              {loadingCommunities ? '同步中…' : '重新同步'}
            </button>
          </div>

          <div className="selection-bar">
            <label>
              <input
                checked={allVisibleSelected}
                disabled={selectableVisibleIds.length === 0 || leaving}
                type="checkbox"
                onChange={handleToggleAllVisible}
              />
              选择当前结果
            </label>
            <span>
              {filteredCommunities.length} 个结果 · 已选 {selectedIds.size} 个
            </span>
          </div>

          {error ? (
            <p className="dashboard-error" role="alert">
              {error}
            </p>
          ) : null}

          <CommunityTable
            communities={filteredCommunities}
            protectedIds={protectedIds}
            selectedIds={selectedIds}
            onToggleProtected={handleToggleProtected}
            onToggleSelected={handleToggleSelected}
          />
        </section>
      </main>

      {leaveProgress ? (
        <aside className="progress-panel" aria-live="polite">
          <div className="progress-copy">
            <strong>{leaveProgress.title ?? leaveProgress.message ?? '正在处理退出任务'}</strong>
            <span>
              {leaveProgress.completed} / {leaveProgress.total}
            </span>
          </div>
          <div className="progress-track">
            <span
              aria-label="退出进度"
              aria-valuemax={leaveProgress.total}
              aria-valuemin={0}
              aria-valuenow={leaveProgress.completed}
              role="progressbar"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {leaving ? (
            <button
              className="text-button"
              type="button"
              onClick={() => void window.chatclear.cancelLeaving()}
            >
              完成本次后停止
            </button>
          ) : (
            <button className="text-button" type="button" onClick={() => setLeaveProgress(null)}>
              关闭
            </button>
          )}
        </aside>
      ) : null}

      <footer className="action-dock">
        <p>
          <strong>{selectedIds.size}</strong> 个会话等待处理
          {adminCount > 0 ? <span> · 含 {adminCount} 个管理员会话</span> : null}
        </p>
        <button
          className="danger-button"
          disabled={selectedIds.size === 0 || leaving}
          type="button"
          onClick={() => setShowConfirmation(true)}
        >
          审核并退出
        </button>
      </footer>

      {showConfirmation ? (
        <ConfirmDialog
          adminCount={adminCount}
          count={selectedIds.size}
          onCancel={() => setShowConfirmation(false)}
          onConfirm={() => void handleConfirmLeave()}
        />
      ) : null}
    </div>
  )
}
