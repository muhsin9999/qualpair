import { useEffect, useRef, useState } from 'react';

/** A small in-app dialog that asks for a name (instead of the browser's prompt box). */
export function NameDialog({ open, title, label, hint, placeholder, confirm, onDone }: {
  open: boolean;
  title: string;
  label: string;
  hint?: string;
  placeholder?: string;
  confirm: string;
  onDone: (name: string | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setName('');
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="name-dialog" aria-labelledby="name-dialog-title" onCancel={(e) => { e.preventDefault(); onDone(null); }}
      onMouseDown={(e) => { if (e.target === ref.current) onDone(null); }}>
      <form method="dialog" className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); if (name.trim()) onDone(name.trim()); }}>
        <h2 id="name-dialog-title">{title}</h2>
        <label className="field">
          <span>{label}</span>
          <input className="input" autoFocus value={name} placeholder={placeholder} onChange={(e) => setName(e.target.value)} />
        </label>
        {hint && <span className="small faint">{hint}</span>}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={() => onDone(null)}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>{confirm}</button>
        </div>
      </form>
    </dialog>
  );
}
