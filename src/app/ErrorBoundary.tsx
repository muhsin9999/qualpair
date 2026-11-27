import { Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** True for "this page's code file is gone", which happens when a new version is deployed while the tab is open. */
export function isStaleBuild(e: unknown) {
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Loading chunk/i.test(String((e as Error)?.message ?? e));
}

/** Keeps one broken screen from blanking the whole app. Data in the browser is untouched. */
export class ErrorBoundary extends Component<{ children: ReactNode; home?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = isStaleBuild(error);
    return (
      <div className="work col" style={{ maxWidth: 640 }}>
        <div className="card pad stack" role="alert">
          <strong style={{ fontSize: 18 }}>{stale ? 'QualPair has been updated' : 'Something went wrong on this page'}</strong>
          <span className="muted">
            {stale
              ? 'A newer version was published while this tab was open. Reload to use it. Your study is safe in this browser.'
              : 'Your study is safe in this browser. Reloading usually fixes this; if it keeps happening, try another page and come back.'}
          </span>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={() => location.reload()}>{stale ? 'Load the new version' : 'Reload'}</button>
            {this.props.home && <Link className="btn" to={this.props.home}>Go to the overview</Link>}
          </div>
          {!stale && (
            <details className="tiny faint">
              <summary style={{ cursor: 'pointer' }}>Details for a bug report</summary>
              <pre style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{error.message}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
