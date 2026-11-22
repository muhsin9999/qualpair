import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Lock } from 'lucide-react';
import { db } from '../../db/db';
import { codeColor, paraNo, usePid, useCodebook, useProject } from '../../app/hooks';
import { PageHead, Track } from '../../app/ui';
import { ensureSample, getSample, resetSample, saveSegmentCoding } from '../../services/coding';
import type { Segment } from '../../types';

function Setup({ pid }: { pid: string }) {
  const project = useProject(pid);
  const codable = useLiveQuery(() => db.segments.where('projectId').equals(pid).filter((s) => !s.isInterviewer).count(), [pid]);
  if (!project) return null;
  const n = Math.max(10, Math.round((codable ?? 0) * project.sampleShare));
  return (
    <div className="work col" style={{ maxWidth: 720 }}>
      <div className="paper stack" style={{ padding: 28, gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Set up your sample</h2>
        <p className="muted" style={{ margin: 0 }}>You code a random sample of paragraphs yourself. Both readers are then scored against your coding, code by code.</p>
        <label className="field">
          <span>Share of paragraphs to code yourself: {Math.round(project.sampleShare * 100)}% (about {n} paragraphs)</span>
          <input type="range" min={10} max={25} step={1} value={Math.round(project.sampleShare * 100)} onChange={(e) => db.projects.update(pid, { sampleShare: Number(e.target.value) / 100 })} />
        </label>
        <label className="field">
          <span>Pass mark (Cohen’s κ), fixed now, before any reader runs</span>
          <select className="select" style={{ width: 260 }} value={project.kappaThreshold} onChange={(e) => db.projects.update(pid, { kappaThreshold: Number(e.target.value) })}>
            <option value={0.4}>0.40 · moderate</option>
            <option value={0.6}>0.60 · substantial (common choice)</option>
            <option value={0.7}>0.70 · strict</option>
            <option value={0.8}>0.80 · very strict</option>
          </select>
        </label>
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={!codable} onClick={() => ensureSample(pid)}>Draw my sample</button>
        {!codable && <span className="small faint">Import interviews first.</span>}
      </div>
    </div>
  );
}

export default function SamplePage() {
  const pid = usePid();
  const project = useProject(pid);
  const book = useCodebook(pid);
  const sampleRes = useLiveQuery(() => getSample(pid).then((x) => ({ x })), [pid]);
  const sample = sampleRes?.x;
  const segs = useLiveQuery(async () => {
    const s = await getSample(pid);
    if (!s) return [];
    const rows = await db.segments.bulkGet(s.segmentIds);
    return rows.filter((x): x is Segment => !!x);
  }, [pid]);
  const human = useLiveQuery(async () => {
    const rows = await db.codings.where('[projectId+coder]').equals([pid, 'human']).toArray();
    const m = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!m.has(r.segmentId)) m.set(r.segmentId, new Set());
      if (r.applied) m.get(r.segmentId)!.add(r.codeId);
    }
    return m;
  }, [pid]);
  const titles = useLiveQuery(async () => new Map((await db.transcripts.where('projectId').equals(pid).toArray()).map((t) => [t.id, t.title])), [pid]);
  const [pos, setPos] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const firstUndone = useMemo(() => (segs && human ? Math.max(0, segs.findIndex((s) => !human.has(s.id))) : 0), [segs, human]);
  const idx = pos ?? firstUndone;
  const cur = segs?.[idx];
  const context = useLiveQuery(async () => {
    if (!cur) return [];
    return db.segments.where('[transcriptId+index]').between([cur.transcriptId, cur.index - 2], [cur.transcriptId, cur.index + 2], true, true).toArray();
  }, [cur?.id]);

  useEffect(() => {
    if (cur && human) setPicked(new Set(human.get(cur.id) ?? []));
  }, [cur?.id, human]);

  const next = useCallback(async () => {
    if (!cur || !segs) return;
    await saveSegmentCoding(pid, cur.id, 'human', [...picked]);
    setPos(Math.min(segs.length - 1, idx + 1));
  }, [cur, segs, picked, pid, idx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      if (!book) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && book.codes[n - 1]) {
        const id = book.codes[n - 1]!.id;
        setPicked((p) => {
          const x = new Set(p);
          if (x.has(id)) x.delete(id);
          else x.add(id);
          return x;
        });
      } else if (e.key === 'Enter' || e.key === 'j') void next();
      else if (e.key === 'k') setPos(Math.max(0, idx - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [book, next, idx]);

  if (!project) return null;
  if (sampleRes === undefined) return null;
  if (!sample) return (<><PageHead title="Your sample" sub="Code these yourself. Both readers are scored against you." /><Setup pid={pid} /></>);
  if (!book) return (<><PageHead title="Your sample" /><div className="work"><div className="card empty">Write your codebook first.</div></div></>);

  const done = segs?.filter((s) => human?.has(s.id)).length ?? 0;
  const total = segs?.length ?? 0;
  const allDone = total > 0 && done >= total;

  return (
    <>
      <PageHead title="Your sample" sub={`Code these yourself. Both readers are scored against you.${sample.madeByTeam ? ' (This sample was coded by the QualCheck team to show the workflow.)' : ''}`}>
        <button className="btn ghost small" onClick={() => { if (confirm('Draw a new sample? Your sample coding will be cleared.')) void resetSample(pid); }}>Redraw sample</button>
      </PageHead>
      <div className="work">
        <div className="paper grow doc" style={{ minHeight: 400 }}>
          {cur ? (
            <>
              <h2>{titles?.get(cur.transcriptId)}</h2>
              {context?.map((s) => (
                <div key={s.id} className={`para${s.id === cur.id ? ' cur' : ' ctx'}${s.isInterviewer ? ' iv' : ''}`}>
                  <span className="ln">{paraNo(s.index)}</span>
                  <div>
                    <div className="who">{s.isInterviewer ? 'Interviewer' : 'Participant'}</div>
                    <div className="tx">{s.text}</div>
                  </div>
                  <span />
                </div>
              ))}
            </>
          ) : (
            <div className="empty">No paragraphs in the sample.</div>
          )}
        </div>
        <div className="stack" style={{ width: 330, flex: 'none', gap: 14 }}>
          <div className="stack" style={{ gap: 8 }}>
            <div className="row" style={{ alignItems: 'baseline' }}><span className="big">{total - done}</span><span className="muted">of {total} left · drawn from all interviews</span></div>
            <Track value={done} total={total} />
          </div>
          {allDone && <div className="notice neutral row"><Check size={16} /> Sample done. The readers can now be scored against you.</div>}
          {cur && (
            <div className="card lift" style={{ padding: '14px 10px' }}>
              <strong style={{ display: 'block', padding: '0 8px 10px', fontSize: 16 }}>Which codes apply to paragraph {paraNo(cur.index)}?</strong>
              {book.codes.map((c, i) => {
                const on = picked.has(c.id);
                return (
                  <button key={c.id} className="row" onClick={() => setPicked((p) => { const x = new Set(p); if (on) x.delete(c.id); else x.add(c.id); return x; })}
                    style={{ width: '100%', border: 0, background: on ? 'var(--sel)' : 'none', borderRadius: 6, padding: '8px', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 18, height: 18, borderRadius: 4, border: on ? 'none' : '1.5px solid var(--ink3)', background: on ? 'var(--ink)' : 'var(--page)', display: 'grid', placeItems: 'center', flex: 'none' }}>{on && <Check size={12} color="#fff" />}</span>
                    <span className="cbar" style={{ background: codeColor(c) }} />
                    <span className="spacer" style={{ fontWeight: on ? 700 : 400 }}>{c.name}</span>
                    {i < 9 && <span className="kbd">{i + 1}</span>}
                  </button>
                );
              })}
              <div className="row" style={{ padding: '10px 4px 0', gap: 8 }}>
                <button className="btn" onClick={() => setPos(Math.max(0, idx - 1))} disabled={idx === 0} aria-label="Previous"><ArrowUp size={16} /></button>
                <button className="btn primary grow" onClick={() => void next()}><ArrowDown size={16} /> {picked.size ? 'Save and next' : 'None apply · next'} <span className="kbd">↵</span></button>
              </div>
            </div>
          )}
          <div className="card row small" style={{ padding: '12px 14px' }}>
            <div className="spacer"><strong>Pass mark</strong><div className="tiny faint">Fixed before the readers run</div></div>
            <span className="pill neutral">κ ≥ {project.kappaThreshold.toFixed(2)}</span>
            <Lock size={14} color="var(--ink3)" />
          </div>
        </div>
      </div>
    </>
  );
}
