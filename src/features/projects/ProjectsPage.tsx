import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, Cloud, Laptop, Play, Plus, Trash2 } from 'lucide-react';
import { db } from '../../db/db';
import { createProject, deleteProject } from '../../services/core';
import { loadSampleProject } from '../../services/sample';
import { agreementByCode } from '../../services/results';
import { studyStats } from '../../app/stats';
import { useRuns, eta, isRunning } from '../../app/runs';
import { kappaBand } from '../../domain/stats/agreement';
import type { Project } from '../../types';

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function StudyCard({ p }: { p: Project }) {
  const s = useLiveQuery(() => studyStats(p.id), [p.id]);
  const ag = useLiveQuery(() => agreementByCode(p.id), [p.id]);
  const kl = median((ag?.codes ?? []).map((c) => c.laptop?.kappa).filter((k): k is number => typeof k === 'number'));
  const kc = median((ag?.codes ?? []).map((c) => c.cloud?.kappa).filter((k): k is number => typeof k === 'number'));
  let next = 'Open study';
  if (s) {
    if (!s.interviews) next = 'Import interviews';
    else if (!s.codes) next = 'Write the codebook';
    else if (s.sampleDone < s.sampleSize || !s.sampleSize) next = 'Code your sample';
    else if (s.laptopDone < s.codable) next = 'Run the laptop reader';
    else if (s.approved < s.interviews) next = 'Approve access copies';
    else if (s.cloudDone < s.codable) next = 'Run the cloud reader';
    else if (s.open) next = `${s.open} disagreements to decide`;
    else next = 'Build the report';
  }
  return (
    <Link to={`/p/${p.id}`} className="card lift pad stack" style={{ textDecoration: 'none', gap: 8 }}>
      <div className="row">
        <div style={{ fontSize: 17, fontWeight: 800, flex: 1 }}>{p.name}</div>
        <button className="btn ghost small" aria-label={`Delete ${p.name}`} title="Delete study"
          onClick={(e) => { e.preventDefault(); if (confirm(`Delete “${p.name}” and everything in it from this browser?`)) void deleteProject(p.id); }}>
          <Trash2 size={14} />
        </button>
      </div>
      <div className="small faint">{s ? `${s.interviews} interviews` : '…'} · {new Date(p.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</div>
      <div className="row small" style={{ gap: 14, minHeight: 20 }}>
        {kl !== null && <span className="row laptop" style={{ gap: 5, fontWeight: 700 }}><Laptop size={14} /> κ {kl.toFixed(2)} {kappaBand(kl)}</span>}
        {kc !== null && <span className="row cloud" style={{ gap: 5, fontWeight: 700 }}><Cloud size={14} /> κ {kc.toFixed(2)}</span>}
      </div>
      <div className="row" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10, marginTop: 4, fontWeight: 600, fontSize: 14 }}>
        <span className="spacer">{next}</span>
        <ArrowRight size={16} color="var(--ink3)" />
      </div>
    </Link>
  );
}

export function ProjectsPage() {
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);
  const runs = useRuns((s) => s.runs);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const live = Object.values(runs).find((r) => isRunning(r));
  const liveProject = projects?.find((p) => p.id === live?.pid);

  async function newStudy() {
    const name = prompt('Name this study');
    if (!name?.trim()) return;
    const p = await createProject({ name: name.trim() });
    navigate(`/p/${p.id}/interviews`);
  }
  async function sample() {
    setBusy(true);
    setErr('');
    try {
      const id = await loadSampleProject();
      navigate(`/p/${id}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100%', padding: '18px 40px 40px' }}>
      <div className="row" style={{ fontWeight: 800 }}>
        <span className="logo" style={{ width: 26, height: 26 }}><BookOpenCheck size={15} /></span> QualCheck
      </div>
      <div className="center-col stack" style={{ gap: 22, marginTop: 28 }}>
        <div className="row">
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, flex: 1 }}>Your studies</h1>
          <button className="btn primary" onClick={newStudy}><Plus size={16} /> New study</button>
        </div>
        {live && liveProject && (
          <Link to={`/p/${live.pid}/${live.kind}`} className="card" style={{ background: 'var(--ink)', color: '#fff', padding: '24px 28px', textDecoration: 'none', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
            <div className="stack" style={{ gap: 10 }}>
              <div className="row tiny" style={{ color: '#7fd1be', fontWeight: 700, letterSpacing: '0.1em' }}><span className="dot" style={{ background: '#7fd1be' }} /> READING NOW</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{liveProject.name}</div>
              <div style={{ opacity: 0.75, fontSize: 14 }}>
                The {live.kind === 'laptop' ? 'laptop' : 'cloud'} reader has done {live.progress.done} of {live.progress.total} paragraphs · {eta(live) || 'starting…'}
              </div>
              <div className="track" style={{ background: '#ffffff22' }}><i style={{ width: `${(live.progress.done / Math.max(1, live.progress.total)) * 100}%`, background: '#7fd1be' }} /></div>
            </div>
            {live.last && (
              <div className="stack" style={{ gap: 8, borderLeft: '1px solid #ffffff22', paddingLeft: 24 }}>
                <div className="tiny" style={{ opacity: 0.6, fontWeight: 700 }}>Just coded</div>
                <div style={{ font: 'italic 14.5px/1.5 var(--read)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>“{live.last.text}”</div>
              </div>
            )}
          </Link>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
          {projects?.map((p) => <StudyCard key={p.id} p={p} />)}
          {!projects?.some((p) => p.isSample) && (
            <button className="card pad stack" onClick={sample} disabled={busy} style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', border: '1.5px dashed var(--rule)', cursor: 'pointer', minHeight: 170 }}>
              <span style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--sel)', display: 'grid', placeItems: 'center' }}><Play size={20} /></span>
              <strong style={{ fontSize: 15 }}>{busy ? 'Loading the sample…' : 'Try the sample study'}</strong>
              <span className="small muted" style={{ maxWidth: 260 }}>6 real interviews with international students in the UK. Watch the laptop and cloud readers code them, then compare with you.</span>
            </button>
          )}
        </div>
        {err && <div className="notice">{err}</div>}
      </div>
    </div>
  );
}
