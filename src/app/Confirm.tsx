import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirm: string;
  /** Destructive actions get a red button, and Cancel is focused first. */
  danger?: boolean;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let show: ((p: Pending) => void) | null = null;

/** Ask a yes/no question in the app's own dialog (instead of the browser's confirm box). */
export function confirmBox(o: ConfirmOptions): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm(o.body ? `${o.title}\n\n${o.body}` : o.title));
  return new Promise((resolve) => show!({ ...o, resolve }));
}

/** Mounted once at the app root; renders whichever question is open. */
export function ConfirmHost() {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState<Pending | null>(null);

  useEffect(() => {
    show = (p) => setQ((cur) => { cur?.resolve(false); return p; });
    return () => { show = null; };
  }, []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (q && !d.open) {
      d.showModal();
      d.querySelector<HTMLButtonElement>('[data-first]')?.focus();
    }
    else if (!q && d.open) d.close();
  }, [q]);

  const answer = (ok: boolean) => {
    q?.resolve(ok);
    setQ(null);
  };

  return (
    <dialog ref={ref} className="name-dialog confirm-dialog" aria-labelledby="confirm-title" aria-describedby={q?.body ? 'confirm-body' : undefined}
      onCancel={(e) => { e.preventDefault(); answer(false); }}
      onMouseDown={(e) => { if (e.target === ref.current) answer(false); }}>
      {q && (
        <div className="stack" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            {q.danger && <span className="confirm-icon" aria-hidden><AlertTriangle size={18} /></span>}
            <div className="stack" style={{ gap: 6 }}>
              <h2 id="confirm-title">{q.title}</h2>
              {q.body && <p id="confirm-body" className="muted" style={{ margin: 0, lineHeight: 1.5 }}>{q.body}</p>}
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn" data-first={q.danger ? '' : undefined} onClick={() => answer(false)}>Cancel</button>
            <button type="button" className={q.danger ? 'btn danger' : 'btn primary'} data-first={q.danger ? undefined : ''} onClick={() => answer(true)}>{q.confirm}</button>
          </div>
        </div>
      )}
    </dialog>
  );
}
