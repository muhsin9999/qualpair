import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

interface Props<T extends string | number> {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  label: string;
  style?: CSSProperties;
  /** Show the closed button's text in bold (used for the report template). */
  strong?: boolean;
}

/** A dropdown in the app's style. Keyboard: arrows, Home/End, Enter or Space to pick, Escape to close, letters to jump. */
export function Select<T extends string | number>({ value, options, onChange, label, style, strong }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function show() {
    const r = btn.current?.getBoundingClientRect();
    setUp(!!r && window.innerHeight - r.bottom < Math.min(280, options.length * 38 + 16) && r.top > window.innerHeight - r.bottom);
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }
  function pick(i: number) {
    const o = options[i];
    if (o) onChange(o.value);
    setOpen(false);
    btn.current?.focus();
  }
  function onKey(e: KeyboardEvent) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    const last = options.length - 1;
    if (e.key === 'ArrowDown') setActive((a) => Math.min(last, a + 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(last);
    else if (e.key === 'Enter' || e.key === ' ') pick(active);
    else if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); return; }
    else if (e.key.length === 1) {
      const k = e.key.toLowerCase();
      const n = options.findIndex((o, i) => i > active && o.label.toLowerCase().startsWith(k));
      const f = n >= 0 ? n : options.findIndex((o) => o.label.toLowerCase().startsWith(k));
      if (f >= 0) setActive(f);
      else return;
    } else return;
    e.preventDefault();
  }

  return (
    <div ref={box} className="dd" style={style}>
      <button ref={btn} type="button" className="dd-btn" aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-label={`${label}: ${current?.label ?? ''}`}
        aria-activedescendant={open ? `${id}-${active}` : undefined} onClick={() => (open ? setOpen(false) : show())} onKeyDown={onKey} style={strong ? { fontWeight: 700 } : undefined}>
        <span className="dd-val">{current?.label ?? ''}</span>
        <ChevronDown size={16} className={open ? 'dd-chev open' : 'dd-chev'} />
      </button>
      {open && (
        <ul ref={list} id={id} role="listbox" aria-label={label} className={up ? 'dd-list up' : 'dd-list'}>
          {options.map((o, i) => (
            <li key={String(o.value)} id={`${id}-${i}`} data-i={i} role="option" aria-selected={o.value === value}
              className={`dd-opt${i === active ? ' active' : ''}${o.value === value ? ' sel' : ''}`}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)}>
              <span className="dd-val">{o.label}</span>
              {o.value === value && <Check size={15} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
