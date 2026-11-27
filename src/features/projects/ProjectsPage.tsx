import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Cloud, FolderOpen, Laptop, Lock, MonitorDown, Plus, Trash2, UserRound } from 'lucide-react';
import { db } from '../../db/db';
import { createProject, deleteProject } from '../../services/core';
import { FINISHED_ID, loadSampleProject } from '../../services/sample';
import { agreementByCode } from '../../services/results';
import { studyStats } from '../../app/stats';
import { useRuns, eta, isRunning, isWarmingUp } from '../../app/runs';
import { kappaBand } from '../../domain/stats/agreement';
import type { Project } from '../../types';
import { Logo } from '../../app/Logo';
import { useInstall } from '../../app/install';
import { NameDialog } from '../../app/NameDialog';
import { PracticeFlag } from '../../app/Nav';
import { practiceMode } from '../../ai/registry';
import { confirmBox } from '../../app/Confirm';
import { importQdpx } from '../../services/qdpx';

type Stats = NonNullable<Awaited<ReturnType<typeof studyStats>>>;

/** The seven steps of a study, who does each, and how far along it is (0 to 1). */
const STEPS: Array<{ name: string; route: string; next: string; who: 'you' | 'laptop' | 'cloud'; done: (s: Stats) => number }> = [
  { name: 'Interviews', route: 'interviews', next: 'Import interviews', who: 'you', done: (s) => (s.interviews ? 1 : 0) },
  { name: 'Codebook', route: 'codebook', next: 'Write the codebook', who: 'you', done: (s) => (s.codes ? 1 : 0) },
  { name: 'Your sample', route: 'sample', next: 'Code your sample', who: 'you', done: (s) => (s.sampleSize ? s.sampleDone / s.sampleSize : 0) },
  { name: 'Laptop reader', route: 'laptop', next: 'Run the laptop reader', who: 'laptop', done: (s) => (s.codable ? s.laptopDone / s.codable : 0) },
  { name: 'Access copies', route: 'access', next: 'Approve access copies', who: 'laptop', done: (s) => (s.interviews ? s.approved / s.interviews : 0) },
  { name: 'Cloud reader', route: 'cloud', next: 'Run the cloud reader', who: 'cloud', done: (s) => (s.codable ? s.cloudDone / s.codable : 0) },
  { name: 'Disagreements', route: 'review', next: 'Decide disagreements', who: 'you', done: (s) => (!s.laptopDone || !s.cloudDone ? 0 : s.open ? s.decided / (s.decided + s.open) : 1) },
];

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function ReaderScore({ kind, k }: { kind: 'laptop' | 'cloud'; k: number | null }) {
  const Icon = kind === 'laptop' ? Laptop : Cloud;
  return (
    <div className={`st-score ${kind}${k === null ? ' none' : ''}`}>
      <span className="st-score-who"><Icon size={14} /> {kind === 'laptop' ? 'Laptop reader' : 'Cloud reader'}</span>
      {k === null ? <span className="st-score-k">not scored yet</span> : <span className="st-score-k"><b>κ {k.toFixed(2)}</b> {kappaBand(k)}</span>}
    </div>
  );
}

function StudyCard({ p }: { p: Project }) {
  const s = useLiveQuery(() => studyStats(p.id), [p.id]);
  const ag = useLiveQuery(() => agreementByCode(p.id), [p.id]);
  const kl = median((ag?.codes ?? []).map((c) => c.laptop?.kappa).filter((k): k is number => typeof k === 'number'));
  const kc = median((ag?.codes ?? []).map((c) => c.cloud?.kappa).filter((k): k is number => typeof k === 'number'));
  const progress = s ? STEPS.map((st) => Math.max(0, Math.min(1, st.done(s)))) : STEPS.map(() => 0);
  const at = progress.findIndex((v) => v < 1);
  const next = at < 0 ? { label: 'Build the report', route: 'report' } : { label: s?.open && at === 6 ? `${s.open} disagreement${s.open === 1 ? '' : 's'} to decide` : STEPS[at]!.next, route: STEPS[at]!.route };
  const doneSteps = progress.filter((v) => v >= 1).length;

  return (
    <article className="st-card">
      <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <div className="grow stack" style={{ gap: 4, minWidth: 0 }}>
          <Link to={`/p/${p.id}`} className="st-name">{p.name}</Link>
          <span className="small faint">
            {s ? `${s.interviews} interview${s.interviews === 1 ? '' : 's'} · ${s.codes} code${s.codes === 1 ? '' : 's'}` : '…'} · updated {new Date(p.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          </span>
        </div>
        <button className="btn ghost small st-del" aria-label={`Delete ${p.name}`} title="Delete study"
          onClick={async () => { if (await confirmBox({ title: `Delete “${p.name}”?`, body: 'This removes the study and everything in it (interviews, codebook, all coding and the AI activity log) from this browser. It can’t be undone.', confirm: 'Delete study', danger: true })) void deleteProject(p.id); }}>
          <Trash2 size={15} />
        </button>
      </div>

      <div className="stack" style={{ gap: 7, visibility: s ? 'visible' : 'hidden' }}>
        <div className="st-steps" role="img" aria-label={`${doneSteps} of ${STEPS.length} steps done`}>
          {STEPS.map((st, i) => (
            <span key={st.name} className={`st-seg ${st.who}${i === at ? ' now' : ''}`} title={`${st.name}: ${Math.round(progress[i]! * 100)}%`}>
              <i style={{ width: `${progress[i]! * 100}%` }} />
            </span>
          ))}
        </div>
        <span className="tiny faint">{doneSteps} of {STEPS.length} steps{at >= 0 ? ` · now: ${STEPS[at]!.name.toLowerCase()}` : ' · ready to report'}</span>
      </div>

      <div className="st-scores">
        <ReaderScore kind="laptop" k={kl} />
        <ReaderScore kind="cloud" k={kc} />
      </div>

      <Link to={`/p/${p.id}/${next.route}`} className="st-next">
        <span className="grow">{next.label}</span>
        <ArrowRight size={17} />
      </Link>
    </article>
  );
}

function SampleCard({ onOpen, busy, big }: { onOpen: () => void; busy: boolean; big?: boolean }) {
  return (
    <button className={`st-sample${big ? ' big' : ''}`} onClick={onOpen} disabled={busy}>
      <span className="st-sample-kicker">Sample study · 6 real interviews</span>
      <strong className="st-sample-title">How do international students in the UK decide where to seek healthcare?</strong>
      <span className="st-sample-who">
        <span><UserRound size={14} /> You code 15%</span>
        <span><Laptop size={14} /> Laptop reads the rest</span>
        <span><Cloud size={14} /> Cloud reads hidden-name copies</span>
      </span>
      <span className="st-sample-go">{busy ? 'Loading the interviews…' : 'Open the sample'} <ArrowRight size={17} /></span>
    </button>
  );
}

export function ProjectsPage() {
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);
  const runs = useRuns((s) => s.runs);
  const navigate = useNavigate();
  const { canInstall, install } = useInstall();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [naming, setNaming] = useState(false);
  const live = Object.values(runs).find((r) => isRunning(r));
  const liveProject = projects?.find((p) => p.id === live?.pid);
  const hasSample = projects?.some((p) => p.isSample && p.id !== FINISHED_ID);

  const newStudy = () => setNaming(true);
  const qdpxRef = useRef<HTMLInputElement>(null);
  const openProject = () => qdpxRef.current?.click();
  async function fromQdpx(file: File | undefined) {
    if (!file) return;
    setErr('');
    try {
      const r = await importQdpx(new Uint8Array(await file.arrayBuffer()));
      const body = [
        `${r.interviews} interview${r.interviews === 1 ? '' : 's'} and ${r.codes} code${r.codes === 1 ? '' : 's'} brought in.`,
        r.codings ? `Coding from the other program (${r.codings.toLocaleString()} tags) isn’t copied: in QualPair you code a sample yourself, both AI readers code everything, and each is scored against you.` : '',
        r.skipped.length ? `Left out (no plain text): ${r.skipped.join(', ')}.` : '',
        'Check who the interviewer is on the Interviews page.',
      ].filter(Boolean).join(' ');
      if (await confirmBox({ title: `Imported “${r.name}”`, body, confirm: 'Open study' })) navigate(`/p/${r.projectId}/interviews`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (qdpxRef.current) qdpxRef.current.value = '';
    }
  }
  async function create(name: string | null) {
    setNaming(false);
    if (!name) return;
    const p = await createProject({ name });
    navigate(`/p/${p.id}/interviews`);
  }
  async function sample() {
    setBusy(true);
    setErr('');
    try {
      navigate(`/p/${await loadSampleProject()}`);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="st">
      <NameDialog open={naming} title="New study" label="Study name" placeholder="e.g. Nurses’ experiences of night shifts" confirm="Create study"
        hint="Next you’ll add interview transcripts. Everything stays in this browser." onDone={(n) => void create(n)} />
      <header className="st-top">
        <Link to="/" className="row" style={{ textDecoration: 'none', color: 'var(--ink)' }}><Logo size={28} fontSize={18} /></Link>
        <span className="spacer" />
        {practiceMode() && <div style={{ width: 250 }}><PracticeFlag /></div>}
        {canInstall && <button className="ld-link ld-install" onClick={() => void install()}><MonitorDown size={16} /> Install app</button>}
        <Link className="ld-link" to="/eval">How accurate is it?</Link>
      </header>

      <main className="st-main">
        <div className="st-head">
          <div className="stack" style={{ gap: 8 }}>
            <h1>Your studies</h1>
            <span className="st-private"><Lock size={14} /> Kept only in this browser. Nothing leaves it unless you send approved access copies to the cloud reader.</span>
          </div>
          <span className="spacer" />
          <button className="btn" onClick={openProject} title="A REFI-QDA project from NVivo, ATLAS.ti, MAXQDA or QualCoder"><FolderOpen size={16} /> Open .qdpx project</button>
          <button className="btn primary" onClick={newStudy}><Plus size={16} /> New study</button>
          <input ref={qdpxRef} type="file" accept=".qdpx" hidden onChange={(e) => void fromQdpx(e.target.files?.[0])} />
        </div>

        {live && liveProject && (
          <Link to={`/p/${live.pid}/${live.kind}`} className={`st-live ${live.kind}`}>
            <div className="stack" style={{ gap: 10, minWidth: 0 }}>
              <span className="st-live-kicker">{live.kind === 'laptop' ? <Laptop size={15} /> : <Cloud size={15} />} The {live.kind} reader is coding</span>
              <strong style={{ fontSize: 20 }}>{liveProject.name}</strong>
              <span style={{ opacity: 0.78, fontSize: 14 }}>
                {live.progress.done} of {live.progress.total} paragraphs · {isWarmingUp(live) ? (live.kind === 'laptop' ? 'loading the model…' : 'starting…') : eta(live) || 'working out time left…'}
              </span>
              <div className="track" style={{ background: '#ffffff26' }}><i style={{ width: `${(live.progress.done / Math.max(1, live.progress.total)) * 100}%`, background: '#fff' }} /></div>
            </div>
            {live.last && (
              <div className="st-live-quote">
                <span className="tiny" style={{ opacity: 0.65, fontWeight: 700 }}>Just coded</span>
                <span>“{live.last.text}”</span>
              </div>
            )}
          </Link>
        )}

        {projects && projects.length === 0 ? (
          <div className="st-empty">
            <SampleCard onOpen={sample} busy={busy} big />
            <div className="st-empty-own">
              <h2>Or start with your own interviews</h2>
              <p>Paste or upload transcripts (Word, text or subtitles). They stay in this browser.</p>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" onClick={newStudy}><Plus size={16} /> New study</button>
                <button className="btn" onClick={openProject}><FolderOpen size={16} /> Open .qdpx project</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="st-grid">
            {projects?.map((p) => <StudyCard key={p.id} p={p} />)}
            {projects && !hasSample && <SampleCard onOpen={sample} busy={busy} />}
            <button className="st-new" onClick={newStudy}><Plus size={20} /> Start a new study<span>Paste or upload transcripts. They stay in this browser.</span></button>
          </div>
        )}
        {err && <div className="notice">{err}</div>}
      </main>
    </div>
  );
}
