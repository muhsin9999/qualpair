import { useLiveQuery } from 'dexie-react-hooks';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Cloud, Laptop, Lock, MousePointerClick, Plus, X } from 'lucide-react';
import { db } from '../../db/db';
import { usePid, useProject, useTranscripts } from '../../app/hooks';
import { PageHead } from '../../app/ui';
import { approveTranscript, buildAccessCopies, decideTerm, rebuildAllAccessCopies, setRedactionStatus, suggestWithLaptop } from '../../services/access';
import { getDeviceReader } from '../../ai/registry';
import type { AccessCopy, Redaction, Segment } from '../../types';

function Original({ seg, copy }: { seg: Segment; copy?: AccessCopy }) {
  const rs = (copy?.redactions ?? []).slice().sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let pos = 0;
  rs.forEach((r, i) => {
    out.push(seg.text.slice(pos, r.start));
    const cls = r.status === 'pending' ? 'pending-word' : r.status === 'kept' ? '' : 'hidden-word';
    out.push(
      <span key={i} className={cls} title={r.status === 'kept' ? 'Kept visible' : r.status === 'pending' ? 'Waiting for your choice' : `Hidden as [${r.placeholder}] · click to keep`} style={{ cursor: 'pointer' }}
        onClick={() => setRedactionStatus(seg.id, r.start, r.status === 'kept' ? 'hidden' : 'kept')}>
        {seg.text.slice(r.start, r.end)}
      </span>,
    );
    pos = r.end;
  });
  out.push(seg.text.slice(pos));
  return <>{out}</>;
}

function CopyText({ seg, copy }: { seg: Segment; copy?: AccessCopy }) {
  const rs = (copy?.redactions ?? []).slice().sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let pos = 0;
  rs.forEach((r, i) => {
    out.push(seg.text.slice(pos, r.start));
    if (r.status === 'kept') out.push(seg.text.slice(r.start, r.end));
    else if (r.status === 'pending') out.push(<span key={i} className="pending-word">{seg.text.slice(r.start, r.end)}</span>);
    else out.push(<span key={i} className="token">[{r.placeholder}]</span>);
    pos = r.end;
  });
  out.push(seg.text.slice(pos));
  return <>{out}</>;
}

export default function AccessPage() {
  const pid = usePid();
  const project = useProject(pid);
  const transcripts = useTranscripts(pid);
  const [ti, setTi] = useState(0);
  const t = transcripts?.[ti];
  const approvals = useLiveQuery(async () => new Set((await db.approvals.where('projectId').equals(pid).toArray()).map((a) => a.transcriptId)), [pid]);
  const segs = useLiveQuery(async () => (t ? (await db.segments.where('transcriptId').equals(t.id).sortBy('index')).filter((s) => !s.isInterviewer) : []), [t?.id]);
  const copies = useLiveQuery(async () => (t ? new Map((await db.accessCopies.where('transcriptId').equals(t.id).toArray()).map((c) => [c.segmentId, c])) : new Map<string, AccessCopy>()), [t?.id]);
  const [showAll, setShowAll] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [selection, setSelection] = useState('');

  useEffect(() => {
    if (t && copies && copies.size === 0 && segs && segs.length) void buildAccessCopies(t.id);
  }, [t, copies, segs]);

  const all: Redaction[] = useMemo(() => [...(copies?.values() ?? [])].flatMap((c) => c.redactions), [copies]);
  const group = (src: Redaction['source']) => {
    const m = new Map<string, { r: Redaction; n: number; status: Redaction['status'] }>();
    for (const r of all.filter((x) => x.source === src)) {
      const k = r.original.toLowerCase();
      const e = m.get(k);
      if (e) e.n++;
      else m.set(k, { r, n: 1, status: r.status });
    }
    return [...m.values()];
  };
  const pending = group('laptop-reader').filter((g) => g.status === 'pending');
  const autoFound = group('rule');

  if (!project || !transcripts) return null;
  if (!t) return (<><PageHead title="Access copies" /><div className="work"><div className="card empty">Import interviews first.</div></div></>);

  const visible = (segs ?? []).filter((s) => showAll || (copies?.get(s.id)?.redactions.length ?? 0) > 0);
  const approved = approvals?.has(t.id);

  async function saveDeid(next: NonNullable<typeof project>['deid']) {
    await db.projects.update(pid, { deid: next });
    await rebuildAllAccessCopies(pid);
  }
  async function addTerm(term: string) {
    const clean = term.trim();
    if (!clean || !project) return;
    const n = project.deid.alwaysHide.length + 1;
    const placeholder = prompt(`What should “${clean}” become in the access copy?`, `person ${n}`) ?? `person ${n}`;
    await saveDeid({ ...project.deid, alwaysHide: [...project.deid.alwaysHide, { term: clean, placeholder }] });
    setNewTerm('');
    setSelection('');
  }
  async function approve() {
    setErr('');
    try {
      await approveTranscript(t!.id);
      if (ti < transcripts!.length - 1) setTi(ti + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  async function askLaptop() {
    setBusy('Asking the laptop reader…');
    try {
      await suggestWithLaptop(t!.id, getDeviceReader(), (d, n) => setBusy(`Laptop reader checking paragraph ${d} of ${n}…`));
      setBusy('');
    } catch (e) {
      setBusy('');
      setErr(`The laptop reader could not check this interview: ${e instanceof Error ? e.message : e}`);
    }
  }

  return (
    <>
      <PageHead title="Access copies" sub={`${t.title} · ${approvals?.size ?? 0} of ${transcripts.length} approved`}>
        <button className="btn small" disabled={ti === 0} onClick={() => setTi(ti - 1)} aria-label="Previous interview"><ChevronLeft size={16} /></button>
        <button className="btn small" disabled={ti >= transcripts.length - 1} onClick={() => setTi(ti + 1)} aria-label="Next interview"><ChevronRight size={16} /></button>
      </PageHead>
      <div className="work pane">
        <div className="paper grow" style={{ padding: '0 30px 22px' }} onMouseUp={() => setSelection(window.getSelection()?.toString().trim() ?? '')}>
          <div className="row pane-head" style={{ gap: 32 }}>
            <span className="row grow small" style={{ fontWeight: 700, color: 'var(--ink2)' }}><Lock size={15} /> Original</span>
            <span className="row grow small cloud" style={{ fontWeight: 700 }}><Cloud size={15} /> What the cloud reader sees</span>
          </div>
          {visible.length === 0 && <div className="empty small">Nothing hidden in this interview yet. Add names on the right, or show all paragraphs.</div>}
          {visible.map((s) => (
            <Fragment key={s.id}>
              <div className="row" style={{ alignItems: 'flex-start', gap: 32, padding: '14px 0', borderBottom: '1px solid var(--rule)' }}>
                <div className="grow" style={{ font: '15.5px/1.7 var(--read)' }}><Original seg={s} copy={copies?.get(s.id)} /></div>
                <div className="grow" style={{ font: '15.5px/1.7 var(--read)' }}><CopyText seg={s} copy={copies?.get(s.id)} /></div>
              </div>
            </Fragment>
          ))}
          <button className="btn ghost small" style={{ marginTop: 10 }} onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show only paragraphs with hidden words' : `Show all ${segs?.length ?? 0} paragraphs`}</button>
        </div>

        <div className="stack side" style={{ width: 360, flex: 'none', gap: 12 }}>
          <div className="card pad stack" style={{ gap: 10 }}>
            <div><strong>Always hide</strong><div className="tiny faint">Applies to every interview in this study</div></div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {project.deid.alwaysHide.map((h) => (
                <span key={h.term} className="chip">{h.term} <span className="tiny faint">→ [{h.placeholder}]</span>
                  <button style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }} aria-label={`Remove ${h.term}`} onClick={() => saveDeid({ ...project.deid, alwaysHide: project.deid.alwaysHide.filter((x) => x.term !== h.term) })}><X size={12} /></button>
                </span>
              ))}
            </div>
            <form className="row" onSubmit={(e) => { e.preventDefault(); void addTerm(newTerm); }}>
              <input className="input" placeholder="Add a name or place" value={newTerm} onChange={(e) => setNewTerm(e.target.value)} />
              <button className="btn small" type="submit" aria-label="Add"><Plus size={14} /></button>
            </form>
            {selection && selection.length < 60 && (
              <button className="btn small" onClick={() => addTerm(selection)}><MousePointerClick size={14} /> Hide “{selection}”</button>
            )}
            {!selection && <span className="tiny faint row"><MousePointerClick size={13} /> Or select words in the original to hide them</span>}
          </div>

          <div className="card pad stack" style={{ gap: 8 }}>
            <div><strong>Found automatically</strong><div className="tiny faint">Places, phone numbers, emails, dates</div></div>
            {autoFound.length === 0 && <span className="small faint">None in this interview.</span>}
            {autoFound.map((g) => (
              <div key={g.r.original} className="row small">
                <strong>{g.r.original}</strong> <ArrowRight size={12} color="var(--ink3)" /> <span className="cloud spacer">[{g.r.placeholder}]</span>
                <span className="tiny faint">{g.n}×</span>
              </div>
            ))}
            <span className="tiny faint">Click a word in the original to keep it visible.</span>
          </div>

          <div className="card pad stack" style={{ gap: 8, background: pending.length ? 'var(--attn-tint)' : undefined, borderColor: pending.length ? 'var(--attn-line)' : undefined }}>
            <div className="row"><Laptop size={15} color="var(--laptop)" /><strong className="spacer">Laptop reader suggests</strong></div>
            {pending.map((g) => (
              <div key={g.r.original} className="row small">
                <span className="spacer"><strong>{g.r.original}</strong> <span className="tiny faint">· {g.n} mention{g.n === 1 ? '' : 's'}</span></span>
                <button className="btn small" onClick={() => decideTerm(t.id, g.r.original, 'kept')}>Keep</button>
                <button className="btn small primary" onClick={() => decideTerm(t.id, g.r.original, 'hidden')}>Hide</button>
              </div>
            ))}
            {!pending.length && <span className="small faint">{busy || 'Ask the laptop reader to look for names and places the rules missed. It runs on this computer.'}</span>}
            {!busy && <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={askLaptop}>Check this interview</button>}
          </div>

          {err && <div className="notice">{err}</div>}
          <div className="pin-bottom stack" style={{ gap: 6 }}>
            {approved ? (
              <div className="notice neutral row"><Check size={16} /> Approved. The cloud reader may read this copy.</div>
            ) : (
              <button className="btn primary" disabled={pending.length > 0} onClick={approve}><Check size={16} /> Approve {t.title}</button>
            )}
            {pending.length > 0 && <span className="tiny faint">Decide the suggestions above before approving.</span>}
          </div>
        </div>
      </div>
    </>
  );
}
