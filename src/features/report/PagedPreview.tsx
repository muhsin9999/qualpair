import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** Screen size of one A4 sheet (210 × 297 mm at 640 px wide). */
export const PAGE_W = 640;
export const PAGE_H = 905;
const PAD_T = 52;
const PAD_B = 46;
const PAD_X = 52;
const BODY_H = PAGE_H - PAD_T - PAD_B;
export const BODY_W = PAGE_W - PAD_X * 2;

/** Elements a page may start with. */
const BREAKABLE = '[data-sec], p, li, tbody tr, blockquote, .note, .fig-num, h1, h2, .svg-fig';
/** Elements that must stay with whatever follows them. */
const KEEP_WITH_NEXT = 'h1, h2, .fig-num, .fig-title, thead';

/**
 * Splits a tall column into page-sized pieces. Breaks fall at the top of a paragraph, list item,
 * table row or figure, and move up past any heading so a heading never ends a page.
 */
export function computeBreaks(root: HTMLElement, pageH: number): number[] {
  const top0 = root.getBoundingClientRect().top;
  const total = Math.ceil(root.scrollHeight);
  const cands = [...root.querySelectorAll<HTMLElement>(BREAKABLE)].map((el) => Math.round(el.getBoundingClientRect().top - top0));
  // Long paragraphs may also break between lines (never after the first or before the last line).
  for (const el of root.querySelectorAll<HTMLElement>('p, li, blockquote')) {
    const range = document.createRange();
    range.selectNodeContents(el);
    // One entry per line: its top and bottom. A break goes halfway between two lines.
    const lines = new Map<number, number>();
    for (const r of range.getClientRects()) {
      const t = Math.round(r.top - top0);
      lines.set(t, Math.max(lines.get(t) ?? 0, r.bottom - top0));
    }
    const sorted = [...lines.entries()].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length - 1; i++) cands.push(Math.floor((sorted[i - 1]![1] + sorted[i]![0]) / 2));
  }
  cands.sort((a, b) => a - b);
  const heads = [...root.querySelectorAll<HTMLElement>(KEEP_WITH_NEXT)].map((el) => {
    const r = el.getBoundingClientRect();
    return [r.top - top0, r.bottom - top0] as const;
  });
  const breaks = [0];
  let start = 0;
  while (total - start > pageH) {
    const limit = start + pageH;
    let b = -1;
    for (const c of cands) if (c > start + 40 && c <= limit) b = c;
    for (let moved = true; moved && b > start; ) {
      moved = false;
      for (const [t, bot] of heads) {
        if (t > start && t < b && b - bot < 28) {
          b = Math.floor(t);
          moved = true;
        }
      }
    }
    if (b <= start + 40) b = limit;
    breaks.push(b);
    start = b;
  }
  breaks.push(total);
  return breaks;
}

interface Props {
  /** The report body. Rendered once to measure (and print), then once per page. */
  children: ReactNode;
  header: string;
  /** Section to scroll to and highlight; changes to `jump.n` trigger the scroll. */
  jump?: { id: string; n: number };
  style?: CSSProperties;
  className?: string;
}

export function PagedPreview({ children, header, jump, style, className = '' }: Props) {
  const flowRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [breaks, setBreaks] = useState<number[]>([0, BODY_H]);

  const measure = useCallback(() => {
    const el = flowRef.current;
    if (!el) return;
    const next = computeBreaks(el, BODY_H);
    setBreaks((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
  }, []);

  useLayoutEffect(measure);
  useEffect(() => {
    const el = flowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    if (!jump) return;
    const flow = flowRef.current;
    const box = scrollRef.current;
    const target = flow?.querySelector<HTMLElement>(`[data-sec="${jump.id}"]`);
    if (!flow || !box || !target) return;
    const y = target.getBoundingClientRect().top - flow.getBoundingClientRect().top;
    let k = 0;
    while (k + 1 < breaks.length - 1 && breaks[k + 1]! <= y + 1) k++;
    const page = box.querySelectorAll<HTMLElement>('.a4-page')[k];
    if (!page) return;
    box.scrollTo({ top: page.offsetTop + PAD_T + (y - breaks[k]!) - 28, behavior: 'smooth' });
  }, [jump?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = breaks.slice(0, -1).map((b, i) => [b, breaks[i + 1]! - b] as const);
  return (
    <div ref={scrollRef} className={`paged ${className}`} style={style}>
      <div ref={flowRef} className="rep rep-flow report-print" style={{ width: BODY_W }}>{children}</div>
      {pages.map(([offset, h], i) => (
        <div key={i} className="a4-page" aria-label={`Page ${i + 1} of ${pages.length}`}>
          <div className="a4-head">{header}</div>
          <div className="a4-body" style={{ top: PAD_T, left: PAD_X, width: BODY_W, height: h }}>
            <div className="rep" style={{ transform: `translateY(${-offset}px)` }}>{children}</div>
          </div>
          <div className="a4-foot">{i + 1} of {pages.length}</div>
        </div>
      ))}
    </div>
  );
}
