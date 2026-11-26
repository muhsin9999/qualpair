import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChartColumn, Check, CircleCheck, CircleX, Cloud, Download, Laptop, LoaderCircle, MonitorDown, RotateCcw, Scale, ShieldCheck, UserRound, Wifi, WifiOff } from 'lucide-react';
import { db } from '../../db/db';
import { FINISHED_ID, loadFinishedStudy, loadSampleProject } from '../../services/sample';
import type { DeviceStatus } from '../../ai/readers';
import { Logo } from '../../app/Logo';
import { useInstall } from '../../app/install';

/**
 * A made-up paragraph (public interview data is already anonymised, so a real one can't show names).
 * `ph` marks identifying details and the placeholder the cloud sees; `ev` marks the words behind each code.
 */
const PARA: Array<{ t: string; ev?: Ev; ph?: string }> = [
  { t: 'I called ' },
  { t: 'Dr Patel', ph: 'person 1', ev: 'nav' },
  { t: ' at ', ev: 'nav' },
  { t: 'Riverside Health Centre', ph: 'clinic 1', ev: 'nav' },
  { t: ' on ' },
  { t: '07700 900123', ph: 'phone' },
  { t: ', but ' },
  { t: 'the earliest appointment was ', ev: 'wait' },
  { t: '14 March', ph: 'date', ev: 'wait' },
  { t: '. My friend ' },
  { t: 'Mei Lin', ph: 'person 2' },
  { t: ' said ' },
  { t: 'back in ', ev: 'home' },
  { t: 'Chengdu', ph: 'city', ev: 'home' },
  { t: ' you just walk into a hospital.', ev: 'home' },
];
type Ev = 'wait' | 'home' | 'nav';
const CODES: Record<Ev, string> = { wait: 'Waiting & access', home: 'Comparing home system', nav: 'Navigating the system' };
const ROWS = [
  { who: 'You', icon: UserRound, kind: 'you', codes: ['wait', 'home'] as Ev[], at: 4 },
  { who: 'Laptop reader', icon: Laptop, kind: 'laptop', codes: ['wait', 'home'] as Ev[], at: 1 },
  { who: 'Cloud reader', icon: Cloud, kind: 'cloud', codes: ['wait', 'nav'] as Ev[], at: 3 },
] as const;
const YOU = new Set<Ev>(ROWS[0].codes);

/** Steps of the opening animation and when each starts (ms). */
const TIMELINE = [0, 500, 1500, 3000, 3800, 4500];

function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function Demo() {
  const box = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState(0);
  const [pos, setPos] = useState(100);
  // The handle rests mid-paragraph: originals on the left, the cloud's copy on the right.
  const rest = 50;
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<Ev | null>(null);
  const [run, setRun] = useState(0);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (reducedMotion()) {
      setStage(5);
      return;
    }
    setStage(0);
    setPos(100);
    setOnline(true);
    const ts = TIMELINE.slice(1).map((ms, i) => window.setTimeout(() => setStage(i + 1), ms));
    return () => ts.forEach((t) => window.clearTimeout(t));
  }, [run]);
  useEffect(() => {
    if (stage === 2) setPos(online ? rest : 100);
  }, [stage, rest]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (stage === 5 && reducedMotion()) setPos(rest);
  }, [stage, rest]);

  function toggleWifi() {
    const next = !online;
    setOnline(next);
    setStage(5);
    setPos(next ? rest : 100);
  }

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
    PARA.map((p, i) => {
      const ev = p.ev && p.ev === hover ? ' ld-ev' : '';
      if (p.ph) return <span key={i} className={`${cloud ? 'ld-tag' : 'ld-pii'}${ev}`} data-ph={cloud ? p.ph : undefined}>{p.t}</span>;
      return <span key={i} className={ev.trim() || undefined}>{p.t}</span>;
    });

  return (
    <div className="ld-demo">
      <div className="ld-paper">
        <div className="ld-paper-head">
          <span className="row laptop" style={{ gap: 8 }}><Laptop size={16} /> What your laptop reads</span>
          <span className="spacer" />
          <span className="row cloud" style={{ gap: 8, opacity: online && pos < 96 ? 1 : 0.35, transition: 'opacity .3s' }}>{online ? 'What the cloud reads' : 'Nothing goes to the cloud'} {online ? <Cloud size={16} /> : <WifiOff size={16} />}</span>
        </div>
        <div ref={box} className={`ld-compare${dragging ? ' dragging' : ''}`} onPointerDown={(e) => online && down(e)} onPointerMove={(e) => dragging && moveTo(e.clientX)} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
          <p className="ld-text">{text(false)}</p>
          <p className="ld-text ld-cloud" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} aria-hidden="true">{text(true)}</p>
          <div className="ld-handle" style={{ left: `${pos}%`, opacity: stage >= 2 && online ? 1 : 0 }}>
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
          <button type="button" role="switch" aria-checked={online} className={`ld-wifi${online ? '' : ' off'}`} onClick={toggleWifi}>
            <span className="ld-wifi-track"><span className="ld-wifi-dot">{online ? <Wifi size={12} /> : <WifiOff size={12} />}</span></span>
            {online ? 'Try it: turn Wi-Fi off' : 'Wi-Fi is off'}
          </button>
          <span className="spacer" />
          <button type="button" className="ld-replay" onClick={() => setRun((r) => r + 1)}><RotateCcw size={13} /> Play again</button>
        </div>
      </div>
      <div className="ld-rows">
        {ROWS.map((r) => (
          <div key={r.who} className={`ld-row ${r.kind}${r.kind === 'cloud' && !online ? ' paused' : ''}`}>
            <span className="ld-who"><r.icon size={16} /> {r.who}</span>
            {r.kind === 'cloud' && !online ? <span className="ld-wait"><WifiOff size={14} /> Waits until you’re back online</span> : r.codes.map((c, i) => {
              const agrees = r.kind === 'you' || YOU.has(c);
              return (
                <span key={c} className={`ld-chip ${agrees ? r.kind : 'attn'}${stage >= r.at ? ' in' : ''}`} style={{ transitionDelay: `${i * 160}ms` }}
                  onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}>
                  {CODES[c]}
                  {r.kind !== 'you' && stage >= 5 && (agrees ? <Check size={14} /> : <Scale size={14} />)}
                </span>
              );
            })}
          </div>
        ))}
        <p className={`ld-legend${stage >= 5 ? ' in' : ''}`}>
          {online
            ? <><span><Check size={14} /> agrees with you</span><span className="attn"><Scale size={14} /> readers differ: you decide</span></>
            : <span className="laptop"><WifiOff size={14} /> Offline: the laptop reader keeps coding. The cloud reader waits.</span>}
        </p>
      </div>
      <p className="ld-credit"><span className="ld-key pii">Dr Patel</span> identifying details stay on your laptop · <span className="ld-key tag">person 1</span> what the cloud sees instead. Made-up example: the people, places, phone number and date are invented.</p>
    </div>
  );
}

type CheckState = 'idle' | 'checking' | DeviceStatus;

function ComputerCheck({ onTry, onFinished, busy }: { onTry: () => void; onFinished: () => void; busy: boolean }) {
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
    unavailable: { icon: CircleX, title: 'Not on this computer', body: 'Chrome needs about 22 GB of free disk space, and either a graphics card with more than 4 GB of memory or 16 GB of RAM. You can still use the cloud reader, or look through a study both readers have finished.', cta: 'See a finished study', dark: true },
    unsupported: { icon: CircleX, title: 'This browser can’t run it', body: 'The laptop reader needs Google Chrome on a laptop or desktop computer. You can still use the cloud reader here, or look through a study both readers have finished.', cta: 'See a finished study', dark: true },
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
        <button className="ld-check-btn" onClick={a.dark ? onFinished : onTry} disabled={busy}>{busy ? 'Loading…' : a.cta} <ArrowRight size={18} /></button>
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
  const { canInstall, install } = useInstall();

  async function trySample() {
    setBusy(true);
    setErr('');
    try {
      const existing = (await db.projects.toArray()).find((p) => p.isSample && p.id !== FINISHED_ID);
      navigate(`/p/${existing ? existing.id : await loadSampleProject()}`);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  async function seeFinished(page: 'agreement' | 'report' = 'agreement') {
    setBusy(true);
    setErr('');
    try {
      navigate(`/p/${await loadFinishedStudy()}/${page}`);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="ld">
      <header className="ld-top">
        <Link to="/" className="row" style={{ gap: 10, fontWeight: 800, fontSize: 18, textDecoration: 'none', color: 'var(--ink)' }}>
          <Logo size={30} fontSize={19} />
        </Link>
        <span className="spacer" />
        {canInstall && <button className="ld-link ld-install" onClick={() => void install()}><MonitorDown size={16} /> Install app</button>}
        <Link className="ld-link" to="/eval">How accurate is it?</Link>
        <Link className="ld-link strong" to="/studies">Your studies</Link>
      </header>

      <section className="ld-hero">
        <div className="ld-pitch">
          <span className="ld-eyebrow"><ShieldCheck size={16} /> For researchers whose ethics approval rules out cloud AI</span>
          <h1>Tag themes in interviews you can’t upload.</h1>
          <p className="ld-sub">Researchers call it coding. Gemini Nano does it on your laptop with the real transcripts; Gemini in the cloud only sees a copy with names hidden. Both are scored against your own coding.</p>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <button className="ld-cta" onClick={trySample} disabled={busy}>{busy ? 'Loading…' : 'Try it on 6 real interviews'} <ArrowRight size={18} /></button>
            <button className="ld-cta ghost" onClick={() => void seeFinished()} disabled={busy}>See a finished study</button>
          </div>
          {err && <div className="notice small">{err}</div>}
          <span className="ld-fine">Free · no account · runs in Chrome · <Link to="/studies">start your own study</Link></span>
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

      <section className="ld-out">
        <div className="ld-out-pages" aria-hidden="true">
          <img className="back" src="/landing/report-page-1.webp" alt="" width={720} height={1019} loading="lazy" />
          <img className="front" src="/landing/report-page-3.webp" alt="" width={720} height={1019} loading="lazy" />
        </div>
        <div className="ld-out-text">
          <span className="ld-eyebrow"><ChartColumn size={16} /> What you hand in</span>
          <h2>A findings report your supervisor can check.</h2>
          <p>Themes with quotes, agreement for every code with each reader, how the data moved, and a COREQ checklist. As a Word file or PDF.</p>
          <p className="small muted">The pages shown come from the finished example: the readers’ real results on six public interviews, scored against the QualPair team’s own coding.</p>
          <button className="ld-cta ghost" style={{ alignSelf: 'flex-start' }} onClick={() => void seeFinished('report')} disabled={busy}>Open this report <ArrowRight size={18} /></button>
        </div>
      </section>

      <div className="ld-check-wrap">
        <ComputerCheck onTry={trySample} onFinished={() => void seeFinished()} busy={busy} />
      </div>

      <footer className="ld-foot">
        Studies stay in your browser. Built with Firebase AI Logic. Code: MIT. Sample interviews: Zhang (2026), CC BY 4.0.
      </footer>
    </div>
  );
}
