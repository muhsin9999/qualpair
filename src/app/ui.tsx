import type { ReactNode } from 'react';
import { Cloud, Laptop, UserRound } from 'lucide-react';
import type { Code } from '../types';
import { codeColor } from './hooks';

export function PageHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="titles">
        <h1>{title}</h1>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {children}
    </header>
  );
}

export function Track({ value, total, kind }: { value: number; total: number; kind?: 'laptop' | 'cloud' }) {
  const w = total ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className={`track ${kind ?? ''}`} role="progressbar" aria-valuenow={value} aria-valuemax={total}>
      <i style={{ width: `${w}%` }} />
    </div>
  );
}

export function CodeChip({ code }: { code: Code }) {
  return (
    <span className="chip">
      <span className="cbar" style={{ background: codeColor(code), height: 12 }} />
      {code.name}
    </span>
  );
}

export const READER = {
  human: { label: 'You', color: 'var(--ink)', Icon: UserRound },
  device: { label: 'Laptop reader', color: 'var(--laptop)', Icon: Laptop },
  cloud: { label: 'Cloud reader', color: 'var(--cloud)', Icon: Cloud },
} as const;

export function ReaderDot({ on, who, pending }: { on: boolean; who: keyof typeof READER; pending?: boolean }) {
  if (pending) return <span className="rdot pending" title="Waiting for your decision" />;
  return <span className={`rdot${on ? ' on' : ''}`} style={{ color: READER[who].color }} title={`${READER[who].label}: ${on ? 'applied' : 'did not apply'}`} />;
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="card empty">
      <div style={{ marginBottom: action ? 14 : 0 }}>{children}</div>
      {action}
    </div>
  );
}
