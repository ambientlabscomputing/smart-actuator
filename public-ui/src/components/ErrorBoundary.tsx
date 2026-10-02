import { Component, type ErrorInfo, type ReactNode } from 'react'
import { captureError } from '../lib/telemetry'

/** Reports render errors to GlitchTip and shows a plain fallback instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureError(error, { tags: { area: 'render' }, extra: { componentStack: info.componentStack } })
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>
        <h1>Something went wrong</h1>
        <p>Reloading usually fixes it.</p>
        <button type="button" onClick={() => window.location.reload()}>Reload</button>
      </div>
    )
  }
}
