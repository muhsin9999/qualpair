import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, ChartColumn, Check, CircleCheck, CircleX, Cloud, Download, Laptop, LoaderCircle, RotateCcw, Scale, UserRound } from 'lucide-react';
import { db } from '../../db/db';
import { loadSampleProject } from '../../services/sample';
import type { DeviceStatus } from '../../ai/readers';

/** A real paragraph from the sample study (Zhang 2026, CC BY 4.0, interview 2). `ev` marks the words behind each code. */
const PARA: Array<{ t: string; ev?: Ev; hide?: boolean }> = [
  { t: 'Actually, I’m not sure. I think ' },
  { t: 'it depends on the antibiotic', ev: 'ab' },
  { t: '. ' },
  { t: 'In the UK, some might need a prescription', ev: 'home' },
  { t: ', and ' },
  { t: 'pharmacies won’t sell them directly', ev: 'nav' },
  { t: ', but in ' },
  { t: 'China', hide: true, ev: 'home' },
  { t: ', you might be able to get some antibiotics without a prescription', ev: 'home' },
  { t: '.' },
];
type Ev = 'home' | 'ab' | 'nav';
const CODES: Record<Ev, string> = { home: 'Comparing home system', ab: 'Antibiotic beliefs', nav: 'Navigating the system' };
const ROWS = [
  { who: 'You', icon: UserRound, kind: 'you', codes: ['home', 'ab'] as Ev[], at: 4 },
  { who: 'Laptop reader', icon: Laptop, kind: 'laptop', codes: ['home', 'ab'] as Ev[], at: 1 },
  { who: 'Cloud reader', icon: Cloud, kind: 'cloud', codes: ['home', 'nav'] as Ev[], at: 3 },
] as const;
const YOU = new Set<Ev>(ROWS[0].codes);

/** Steps of the opening animation and when each starts (ms). */
const TIMELINE = [0, 500, 1500, 3000, 3800, 4500];

function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function Demo() {
  const box = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLSpanElement>(null);
  const [stage, setStage] = useState(0);
  const [pos, setPos] = useState(100);
  const [rest, setRest] = useState(30);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<Ev | null>(null);
  const [run, setRun] = useState(0);

  // Rest the handle just left of the hidden word, so the black bar shows on the cloud side.
  const measure = useCallback(() => {
    const b = box.current?.getBoundingClientRect();
    const h = hidden.current?.getBoundingClientRect();
    if (b && h && b.width) setRest(Math.max(8, Math.min(70, ((h.left - b.left - 14) / b.width) * 100)));
  }, []);
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    if (reducedMotion()) {
      setStage(5);
      return;
    }
    setStage(0);
    setPos(100);
    const ts = TIMELINE.slice(1).map((ms, i) => window.setTimeout(() => setStage(i + 1), ms));
    return () => ts.forEach((t) => window.clearTimeout(t));
  }, [run]);
  useEffect(() => {
    if (stage === 2) setPos(rest);
  }, [stage, rest]);
  useEffect(() => {
    if (stage === 5 && reducedMotion()) setPos(rest);
  }, [stage, rest]);

  function moveTo(clientX: number) {
    const b = box.current?.getBoundingClientRect();
    if (b) setPos(Math.max(0, Math.min(100, ((clientX - b.left) / b.width) * 100)));
  }
  function down(e: RPointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    setStage(5);
    moveTo(e.clientX);
  }

  const text = (cloud: boolean) =>
    PARA.map((p, i) => (
      <span key={i} ref={!cloud && p.hide ? hidden : undefined} className={`${p.ev && p.ev === hover ? 'ld-ev' : ''}${cloud && p.hide ? ' ld-bar' : ''}`}>{p.t}</span>
    ));

  return (
    <div className="ld-demo">
      <div className="ld-paper">
        <div className="ld-paper-head">
          <span className="row laptop" style={{ gap: 8 }}><Laptop size={16} /> What your laptop reads</span>
          <span className="spacer" />
          <span className="row cloud" style={{ gap: 8, opacity: pos < 96 ? 1 : 0.35, transition: 'opacity .3s' }}>What the cloud reads <Cloud size={16} /></span>
        </div>
        <div ref={box} className={`ld-compare${dragging ? ' dragging' : ''}`} onPointerDown={down} onPointerMove={(e) => dragging && moveTo(e.clientX)} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
          <p className="ld-text">{text(false)}</p>
          <p className="ld-text ld-cloud" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} aria-hidden="true">{text(true)}</p>
          <div className="ld-handle" style={{ left: `${pos}%`, opacity: stage >= 2 ? 1 : 0 }}>
            <button type="button" className="ld-knob" role="slider" aria-label="Compare what the laptop and the cloud read" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  setStage(5);
                  setPos((p) => Math.max(0, Math.min(100, p + (e.key === 'ArrowLeft' ? -5 : 5))));
                }
              }}>
              <span aria-hidden="true">‹ ›</span>
            </button>
          </div>
        </div>
        <div className="ld-paper-foot">
          <span className="spacer">Example coding of a real interview paragraph · Zhang (2026), CC BY 4.0</span>
          <button type="button" className="ld-replay" onClick={() => setRun((r) => r + 1)}><RotateCcw size={13} /> Play again</button>
        </div>
      </div>
      <div className="ld-rows">
        {ROWS.map((r) => (
          <div key={r.who} className={`ld-row ${r.kind}`}>
            <span className="ld-who"><r.icon size={16} /> {r.who}</span>
            {r.codes.map((c, i) => {
              const agrees = r.kind === 'you' || YOU.has(c);
              return (
                <span key={c} className={`ld-chip ${agrees ? r.kind : 'attn'}${stage >= r.at ? ' in' : ''}`} style={{ transitionDelay: `${i * 160}ms` }}
                  onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}>
                  {CODES[c]}
                  {r.kind !== 'you' && stage >= 5 && (agrees ? <Check size={14} /> : <Scale size={14} />)}
                </span>
              );
            })}
            {r.kind === 'cloud' && <span className={`ld-decide${stage >= 5 ? ' in' : ''}`}>you decide</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

type CheckState = 'idle' | 'checking' | DeviceStatus;

function ComputerCheck({ onTry, busy }: { onTry: () => void; busy: boolean }) {
  const [st, setSt] = useState<CheckState>('idle');
  async function check() {
    setSt('checking');
    try {
      const { FirebaseDeviceReader } = await import('../../ai/device');
      setSt(await new FirebaseDeviceReader().status());
    } catch {
      setSt('unavailable');
    }
  }
  const answer: Record<string, { icon: typeof Laptop; title: string; body: string; cta: string; dark?: boolean }> = {
    available: { icon: CircleCheck, title: 'Ready', body: 'Gemini Nano is on this computer. The laptop reader will work.', cta: 'Try it on 6 real interviews' },
    downloadable: { icon: Download, title: 'Almost ready', body: 'Your computer can run it. Chrome downloads Gemini Nano (about 2 GB) the first time you start the laptop reader.', cta: 'Try it on 6 real interviews' },
    downloading: { icon: Download, title: 'Almost ready', body: 'Chrome is downloading Gemini Nano now (about 2 GB). The laptop reader works once it finishes.', cta: 'Try it on 6 real interviews' },
    unavailable: { icon: CircleX, title: 'Not on this computer', body: 'Chrome needs about 22 GB of free disk space, and either a graphics card with more than 4 GB of memory or 16 GB of RAM. You can still use the cloud reader.', cta: 'Try it with the cloud reader', dark: true },
    unsupported: { icon: CircleX, title: 'This browser can’t run it', body: 'The laptop reader needs Google Chrome on a laptop or desktop computer. You can still use the cloud reader here.', cta: 'Try it with the cloud reader', dark: true },
  };
  const a = answer[st];
  return (
    <section className={`ld-check${a?.dark ? ' dark' : ''}`} aria-live="polite">
      <span className="ld-check-icon">{a ? <a.icon size={30} /> : <Laptop size={30} />}</span>
      <div className="grow stack" style={{ gap: 8 }}>
        <h2>{a ? a.title : 'Will the laptop reader work on your computer?'}</h2>
        <p>{a ? a.body : 'Find out in one click. Nothing to install: Chrome downloads Gemini Nano once (about 2 GB).'}</p>
      </div>
      {a ? (
        <button className="ld-check-btn" onClick={onTry} disabled={busy}>{busy ? 'Loading…' : a.cta} <ArrowRight size={18} /></button>
      ) : (
        <button className="ld-check-btn" onClick={check} disabled={st === 'checking'}>
          {st === 'checking' ? <><LoaderCircle size={18} className="spin" /> Checking…</> : <>Check my computer <ArrowRight size={18} /></>}
        </button>
      )}
    </section>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function trySample() {
    setBusy(true);
    setErr('');
    try {
      const existing = (await db.projects.toArray()).find((p) => p.isSample);
      navigate(`/p/${existing ? existing.id : await loadSampleProject()}`);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="ld">
      <header className="ld-top">
        <Link to="/" className="row" style={{ gap: 10, fontWeight: 800, fontSize: 18, textDecoration: 'none', color: 'var(--ink)' }}>
          <span className="logo" style={{ width: 28, height: 28 }}><BookOpenCheck size={16} /></span> QualCheck
        </Link>
        <span className="spacer" />
        <Link className="ld-link" to="/eval">How accurate is it?</Link>
        <Link className="ld-link strong" to="/studies">Your studies</Link>
      </header>

      <section className="ld-hero">
        <div className="ld-pitch">
          <h1>AI coding for interviews you can’t upload.</h1>
          <p className="ld-sub">Gemini Nano codes the real transcripts on your laptop. The cloud only sees a copy with names hidden. Both are checked against your own coding.</p>
          <div className="row" style={{ gap: 22, flexWrap: 'wrap' }}>
            <button className="ld-cta" onClick={trySample} disabled={busy}>{busy ? 'Loading the interviews…' : 'Try it on 6 real interviews'} <ArrowRight size={18} /></button>
            <Link className="ld-link strong" to="/studies">Start your own study</Link>
          </div>
          {err && <div className="notice small">{err}</div>}
          <span className="ld-fine">Free · no account · runs in Chrome</span>
        </div>
        <Demo />
      </section>

      <section className="ld-steps">
        {[
          ['01', UserRound, 'You code a small sample', 'A random 15% of paragraphs. Your coding is the yardstick.'],
          ['02', Laptop, 'Two AI readers code the rest', 'Gemini Nano reads the originals on your laptop. Gemini in the cloud reads only copies you approved.'],
          ['03', ChartColumn, 'See how far to trust them', 'Agreement with you for every code. Codes that fall short are kept out of the report.'],
        ].map(([n, Icon, h, b]) => {
          const I = Icon as typeof Laptop;
          return (
            <div key={n as string} className="ld-step">
              <span className="ld-step-n">{n as string} <I size={18} /></span>
              <h3>{h as string}</h3>
              <p>{b as string}</p>
            </div>
          );
        })}
      </section>

      <div className="ld-check-wrap">
        <ComputerCheck onTry={trySample} busy={busy} />
      </div>

      <footer className="ld-foot">
        Studies stay in your browser. Built with Firebase AI Logic. Code: MIT. Sample interviews: Zhang (2026), CC BY 4.0.
      </footer>
    </div>
  );
}
