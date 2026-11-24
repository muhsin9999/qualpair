import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface MenuItem {
  label: string;
  hint?: string;
  icon?: ReactNode;
  onSelect: () => void;
}

/** A button that opens a floating list of actions (fixed position, so nothing clips it). */
export function Menu({ label, items, icon }: { label: string; items: MenuItem[]; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[active]?.focus();
  }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!btn.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', () => setOpen(false), { once: true });
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function show() {
    const r = btn.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setActive(0);
    setOpen(true);
  }
  function done(i: number) {
    setOpen(false);
    btn.current?.focus();
    items[i]?.onSelect();
  }

  return (
    <>
      <button ref={btn} type="button" className="btn" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => (open ? setOpen(false) : show())}>
        {icon}{label} <ChevronDown size={15} />
      </button>
      {open && createPortal(
        <div ref={list} id={id} role="menu" aria-label={label} className="menu" style={{ top: pos.top, right: pos.right }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => (a + 1) % items.length);
            else if (e.key === 'ArrowUp') setActive((a) => (a - 1 + items.length) % items.length);
            else if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); btn.current?.focus(); }
            else return;
            e.preventDefault();
          }}>
          {items.map((it, i) => (
            <button key={it.label} type="button" role="menuitem" tabIndex={-1} className="menu-item" onClick={() => done(i)} onMouseEnter={() => setActive(i)}>
              {it.icon}
              <span className="grow" style={{ textAlign: 'left' }}>
                <span style={{ display: 'block', fontWeight: 600 }}>{it.label}</span>
                {it.hint && <span className="tiny faint">{it.hint}</span>}
              </span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
