import { useLiveQuery } from 'dexie-react-hooks';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Cloud, EyeOff, Laptop, LoaderCircle, Lock, Plus, X } from 'lucide-react';
import { db } from '../../db/db';
import { usePid, useProject, useTranscripts } from '../../app/hooks';
import { PageHead } from '../../app/ui';
import { Select } from '../../app/Select';
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
      <span key={i} className={`${cls} toggle-word`} title={r.status === 'kept' ? 'Visible to the cloud reader · click to hide again' : r.status === 'pending' ? 'Waiting for your choice' : `Hidden as [${r.placeholder}] · click to keep it visible`}
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

const KINDS = ['person', 'place', 'organisation', 'other'] as const;
type Kind = (typeof KINDS)[number];

/** A small toolbar that floats just above the words you selected in the original. */
function HidePopover({ sel, onHide, onClose }: { sel: { text: string; x: number; y: number; below?: boolean }; onHide: (k: Kind) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const away = () => onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', away);
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', away);
    };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className={sel.below ? 'hide-pop below' : 'hide-pop'} role="dialog" aria-label={`Hide ${sel.text}`} style={{ left: sel.x, top: sel.y }}>
      <div className="hide-pop-t"><EyeOff size={14} /> Hide “<span className="hide-pop-w">{sel.text}</span>” as</div>
      <div className="row" style={{ gap: 4 }}>
        {KINDS.map((k) => <button key={k} type="button" onClick={() => onHide(k)}>{k[0]!.toUpperCase() + k.slice(1)}</button>)}
      </div>
      <div className="tiny" style={{ opacity: 0.65 }}>Hidden in every interview. Click the word later to undo.</div>
    </div>,
    document.body,
  );
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
  const [showAll, setShowAll] = useState(true);
  const [newTerm, setNewTerm] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<{ text: string; x: number; y: number; below?: boolean } | null>(null);
  const [checked, setChecked] = useState<{ tid: string; text: string } | null>(null);
  const [laptopOk, setLaptopOk] = useState<boolean | null>(null);
  useEffect(() => {
    const r = getDeviceReader();
    if (r.isPractice) setLaptopOk(true);
    else void r.status().then((st) => setLaptopOk(st === 'available' || st === 'downloadable' || st === 'downloading'));
  }, []);
  const [newKind, setNewKind] = useState<Kind>('person');
  const closeSel = useCallback(() => setSel(null), []);

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
  async function addTerm(term: string, kind: Kind) {
    const clean = term.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!clean || !project) return;
    if (project.deid.alwaysHide.some((h) => h.term.toLowerCase() === clean.toLowerCase())) { setSel(null); return; }
    const n = project.deid.alwaysHide.filter((h) => h.placeholder.startsWith(kind)).length + 1;
    await saveDeid({ ...project.deid, alwaysHide: [...project.deid.alwaysHide, { term: clean, placeholder: `${kind} ${n}` }] });
    setNewTerm('');
    setSel(null);
  }
  /** Selecting words in the original opens the hide toolbar right above them. */
  function onSelect() {
    const s = window.getSelection();
    const text = s?.toString().trim() ?? '';
    const node = s?.anchorNode;
    const inOriginal = !!node && !!(node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest('.orig-col');
    if (!s || s.isCollapsed || !text || text.length > 60 || !inOriginal) return;
    const r = s.getRangeAt(0).getBoundingClientRect();
    const below = r.top < 110;
    setSel({ text, x: r.left + r.width / 2, y: below ? r.bottom + 10 : r.top - 10, below });
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
    setChecked(null);
    setErr('');
    try {
      const r = await suggestWithLaptop(t!.id, getDeviceReader(), (d, n) => setBusy(`Laptop reader checking paragraph ${d} of ${n}…`));
      setBusy('');
      setChecked({
        tid: t!.id,
        text: r.found ? `Checked ${r.paragraphs} paragraphs. ${r.found} new word${r.found === 1 ? '' : 's'} to decide above.` : `Checked ${r.paragraphs} paragraphs. No new names or places found.`,
      });
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
        {approved ? (
          <span className="head-ok"><Check size={16} /> Approved for the cloud reader</span>
        ) : (
          <button className="btn primary" disabled={pending.length > 0 || !!busy} title={pending.length ? 'Decide the laptop reader’s suggestions first' : undefined} onClick={approve}><Check size={16} /> Approve {t.title}</button>
        )}
      </PageHead>
      {sel && <HidePopover sel={sel} onClose={closeSel} onHide={(k) => void addTerm(sel.text, k)} />}
      <div className="work pane">
        <div className="paper grow" style={{ padding: '0 30px 22px' }} onMouseUp={onSelect} onKeyUp={(e) => e.shiftKey && onSelect()}>
          <div className="row pane-head" style={{ gap: 32 }}>
            <span className="row grow small" style={{ fontWeight: 700, color: 'var(--ink2)' }}><Lock size={15} /> Original <span className="spacer" /><span className="sel-hint"><EyeOff size={13} /> Select words to hide them</span></span>
            <span className="row grow small cloud" style={{ fontWeight: 700 }}><Cloud size={15} /> What the cloud reader sees</span>
          </div>
          {(!copies || (copies.size === 0 && (segs?.length ?? 0) > 0)) ? (
            <div className="empty small">Preparing the access copy…</div>
          ) : visible.length === 0 && <div className="empty small">Nothing hidden in this interview yet. Show all paragraphs and select words to hide them.</div>}
          {visible.map((s) => (
            <Fragment key={s.id}>
              <div className="row" style={{ alignItems: 'flex-start', gap: 32, padding: '14px 0', borderBottom: '1px solid var(--rule)' }}>
                <div className="grow orig-col" style={{ font: '15.5px/1.7 var(--read)' }}><Original seg={s} copy={copies?.get(s.id)} /></div>
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
            <form className="stack" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void addTerm(newTerm, newKind); }}>
              <input className="input" placeholder="Type a name or place" aria-label="Name or place to hide" value={newTerm} onChange={(e) => setNewTerm(e.target.value)} />
              <div className="row" style={{ gap: 6 }}>
                <span className="small muted" style={{ flex: 'none' }}>Hide as</span>
                <Select label="Hide as" style={{ flex: 1 }} value={newKind} onChange={setNewKind} options={KINDS.map((k) => ({ value: k, label: k[0]!.toUpperCase() + k.slice(1) }))} />
                <button className="btn" type="submit" disabled={!newTerm.trim()}><Plus size={14} /> Add</button>
              </div>
            </form>
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
            <span className="tiny faint">Click a hidden word in the original to keep it visible.</span>
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
            {pending.length > 0 && <span className="tiny attn">Decide each one before approving.</span>}
            {laptopOk === false ? (
              <span className="small">The laptop reader isn’t available in this browser, so <strong>names and places are not found automatically</strong>. Select them in the original, or type them under Always hide.</span>
            ) : (
              <>
                {!pending.length && !busy && !(checked && checked.tid === t.id) && <span className="small faint">The rules above don’t know people’s names. Ask the laptop reader to look for names and places. It runs on this computer.</span>}
                {busy && <span className="small laptop row" style={{ gap: 8 }} aria-live="polite"><LoaderCircle size={14} className="spin" /> {busy}</span>}
                {checked && checked.tid === t.id && !busy && <span className="small laptop row" style={{ gap: 8 }} role="status"><Check size={14} /> {checked.text}</span>}
                {!busy && <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={askLaptop}>{checked && checked.tid === t.id ? 'Check again' : 'Check this interview'}</button>}
              </>
            )}
          </div>

          {err && <div className="notice">{err}</div>}
        </div>
      </div>
    </>
  );
}
