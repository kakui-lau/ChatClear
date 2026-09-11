import { Component, type ReactNode } from 'react'
import { Brand } from './Brand'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  failed: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="auth-shell">
        <section className="auth-card setup-card" aria-labelledby="renderer-error-title">
          <Brand />
          <p className="eyebrow danger-eyebrow">RENDERER RECOVERY</p>
          <h1 id="renderer-error-title">界面需要重新载入</h1>
          <p>本地会话仍然安全。重新载入只会重启界面，不会执行退群或注销操作。</p>
          <button
            className="primary-button full-card-button"
            type="button"
            onClick={() => window.location.reload()}
          >
            重新载入界面
          </button>
        </section>
      </main>
    )
  }
}
