import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, BookOpen, Check, Lock, Shuffle, UserRound } from 'lucide-react';
import { db } from '../../db/db';
import { codeColor, paraNo, usePid, useCodebook, useProject } from '../../app/hooks';
import { PageHead, revealIn, Track } from '../../app/ui';
import { Select } from '../../app/Select';
import { ensureSample, getSample, resetSample, saveSegmentCoding } from '../../services/coding';
import type { Code, Segment } from '../../types';
import { confirmBox } from '../../app/Confirm';

function Setup({ pid }: { pid: string }) {
  const project = useProject(pid);
  const codable = useLiveQuery(() => db.segments.where('projectId').equals(pid).filter((s) => !s.isInterviewer).count(), [pid]);
  if (!project) return null;
  const n = Math.max(10, Math.round((codable ?? 0) * project.sampleShare));
  return (
    <div className="work lp">
      <div className="paper stack grow" style={{ padding: 28, gap: 18, minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Set up your sample</h2>
        <p className="muted" style={{ margin: 0 }}>You code a random sample of paragraphs yourself. Both readers are then scored against your coding, code by code.</p>
        <label className="field">
          <span>Share of paragraphs to code yourself: {Math.round(project.sampleShare * 100)}% (about {n} paragraphs)</span>
          <input type="range" min={10} max={25} step={1} value={Math.round(project.sampleShare * 100)} onChange={(e) => db.projects.update(pid, { sampleShare: Number(e.target.value) / 100 })} />
        </label>
        <div className="field">
          <span>Pass mark (Cohen’s κ), fixed now, before any reader runs</span>
          <Select label="Pass mark" style={{ width: 300 }} value={project.kappaThreshold} onChange={(v) => db.projects.update(pid, { kappaThreshold: v })}
            options={[{ value: 0.4, label: '0.40 · moderate' }, { value: 0.6, label: '0.60 · substantial (common choice)' }, { value: 0.7, label: '0.70 · strict' }, { value: 0.8, label: '0.80 · very strict' }]} />
        </div>
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={!codable} onClick={() => ensureSample(pid)}>Draw my sample</button>
        {!codable && <span className="small faint">Import interviews first.</span>}
      </div>
      <aside className="card pad stack lp-side" style={{ gap: 14 }}>
        <strong>Why code a sample yourself?</strong>
        {[
          [UserRound, 'You are the yardstick', 'Each reader is scored against your coding, code by code, not against the other reader.'],
          [Shuffle, 'Random, so it’s fair', 'Paragraphs are drawn at random from across all your interviews, so the score isn’t based on hand-picked examples.'],
          [Lock, 'Pass mark fixed first', 'You set it before any reader runs, so the bar can’t move after you see results. Codes below it are kept out of the report.'],
        ].map(([Icon, h, b]) => {
          const I = Icon as typeof Lock;
          return (
            <div key={h as string} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <span style={{ width: 32, height: 32, flex: 'none', borderRadius: 16, background: 'var(--sel)', display: 'grid', placeItems: 'center' }}><I size={16} /></span>
              <div className="stack" style={{ gap: 2 }}><strong className="small">{h as string}</strong><span className="small muted">{b as string}</span></div>
            </div>
          );
        })}
      </aside>
    </div>
  );
}

/** The codebook entry for the code under the pointer, shown beside it, so you never have to leave the page to check a rule. */
function CodeDefinition({ code, at }: { code: Code; at: { top: number; right: number } }) {
  const rows: Array<[string, string]> = [['Use when', code.whenToUse], ['Don’t use when', code.whenNotToUse], ['Example', code.example]];
  const top = Math.max(12, Math.min(at.top - 14, window.innerHeight - 340));
  return createPortal(
    <div className="def-card" role="tooltip" style={{ top, right: at.right }}>
      <div className="row" style={{ gap: 8 }}><span className="cbar" style={{ background: codeColor(code) }} /><strong>{code.name}</strong></div>
      {code.definition.trim() && <p>{code.definition}</p>}
      {rows.filter(([, v]) => v.trim()).map(([k, v]) => (
        <div key={k}><span className="def-k">{k}</span><p>{k === 'Example' && !/[“”"]/.test(v) ? `“${v}”` : v}</p></div>
      ))}
    </div>,
    document.body,
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
  const [peek, setPeek] = useState<{ id: string; top: number; right: number } | null>(null);
  const showDef = (id: string, el: Element | null) => {
    const r = el?.closest('.card')?.getBoundingClientRect();
    const row = el?.getBoundingClientRect();
    if (r && row) setPeek({ id, top: row.top, right: window.innerWidth - r.left + 12 });
  };

  const firstUndone = useMemo(() => (segs && human ? Math.max(0, segs.findIndex((s) => !human.has(s.id))) : 0), [segs, human]);
  const idx = pos ?? firstUndone;
  const cur = segs?.[idx];
  const paperRef = useRef<HTMLDivElement>(null);
  const context = useLiveQuery(async () => {
    if (!cur) return [];
    return db.segments.where('[transcriptId+index]').between([cur.transcriptId, cur.index - 2], [cur.transcriptId, cur.index + 2], true, true).toArray();
  }, [cur?.id]);

  useEffect(() => {
    if (cur && human) setPicked(new Set(human.get(cur.id) ?? []));
  }, [cur?.id, human]);
  useEffect(() => setPeek(null), [cur?.id]);

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
        showDef(id, document.querySelector(`[data-code="${id}"]`));
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

  // Keep the paragraph being coded in view inside the transcript pane.
  useEffect(() => {
    revealIn(paperRef.current, '.para.cur');
  }, [cur?.id, context]);
  if (!project) return null;
  if (sampleRes === undefined) return null;
  if (!sample) return (<><PageHead title="Your sample" sub="Code these yourself. Both readers are scored against you." /><Setup pid={pid} /></>);
  if (!book) return (<><PageHead title="Your sample" /><div className="work"><div className="card empty">Write your codebook first.</div></div></>);

  const done = segs?.filter((s) => human?.has(s.id)).length ?? 0;
  const total = segs?.length ?? 0;
  const allDone = total > 0 && done >= total;

  return (
    <>
      <PageHead title="Your sample" sub={`Code these yourself. Both readers are scored against you.${sample.madeByTeam ? ' (This sample was coded by the QualPair team to show the workflow.)' : ''}`}>
        <button className="btn ghost small" onClick={async () => { if (await confirmBox({ title: 'Draw a new sample?', body: 'Your coding of the current sample will be cleared and a new random sample drawn.', confirm: 'Draw new sample', danger: true })) void resetSample(pid); }}>Redraw sample</button>
      </PageHead>
      <div className="work pane">
        <div ref={paperRef} className="paper grow doc">
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
        <div className="stack side" style={{ width: 330, flex: 'none', gap: 10 }}>
          <div className="stack" style={{ gap: 8 }}>
            <div className="row" style={{ alignItems: 'baseline' }}><span className="big">{total - done}</span><span className="muted spacer">of {total} left</span>
              <span className="small faint row" style={{ gap: 5 }} title="Pass mark, fixed before the readers run"><Lock size={12} /> pass mark κ ≥ {project.kappaThreshold.toFixed(2)}</span></div>
            <Track value={done} total={total} />
          </div>
          {allDone && <div className="notice neutral row"><Check size={16} /> Sample done. The readers can now be scored against you.</div>}
          {cur && (
            <div className="card lift" style={{ padding: '14px 10px' }} onMouseLeave={() => setPeek(null)}>
              <strong style={{ display: 'block', padding: '0 8px 2px', fontSize: 16 }}>Which codes apply to paragraph {paraNo(cur.index)}?</strong>
              <span className="tiny faint row" style={{ padding: '0 8px 10px', gap: 6 }}><BookOpen size={13} /> Point at a code to see its definition</span>
              {book.codes.map((c, i) => {
                const on = picked.has(c.id);
                return (
                  <button key={c.id} className="row" data-code={c.id} aria-pressed={on} onMouseEnter={(e) => showDef(c.id, e.currentTarget)} onFocus={(e) => showDef(c.id, e.currentTarget)} onBlur={() => setPeek(null)} onClick={() => setPicked((p) => { const x = new Set(p); if (on) x.delete(c.id); else x.add(c.id); return x; })}
                    style={{ width: '100%', border: 0, background: on ? 'var(--sel)' : 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', textAlign: 'left' }}>
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
          {cur && peek && book.codes.some((c) => c.id === peek.id) && <CodeDefinition code={book.codes.find((c) => c.id === peek.id)!} at={peek} />}
        </div>
      </div>
    </>
  );
}
