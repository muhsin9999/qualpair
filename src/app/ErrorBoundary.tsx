import { Component, type ReactNode } from 'react';

/** Keeps one broken screen from blanking the whole app. Data in the browser is untouched. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="work col" style={{ maxWidth: 640 }}>
        <div className="card pad stack">
          <strong>This screen hit a problem</strong>
          <span className="small muted">Your study is safe in this browser. Reload to try again.</span>
          <pre className="tiny" style={{ whiteSpace: 'pre-wrap', color: 'var(--ink3)' }}>{this.state.error.message}</pre>
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
