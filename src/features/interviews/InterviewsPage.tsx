import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, FileText, Trash2, Upload, X } from 'lucide-react';
import mammoth from 'mammoth';
import { db } from '../../db/db';
import { usePid, useParticipants, useTranscripts } from '../../app/hooks';
import { Empty, PageHead } from '../../app/ui';
import { deleteTranscript, importTranscript, setInterviewers } from '../../services/core';
import type { Transcript } from '../../types';

const ATTRS = ['Group', 'Time in the UK', 'Region of origin'];

async function fileToText(f: File): Promise<{ text: string; isVtt: boolean }> {
  if (f.name.toLowerCase().endsWith('.docx')) {
    const { value } = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
    return { text: value.replace(/\n{2,}/g, '\n'), isVtt: false };
  }
  const text = await f.text();
  return { text, isVtt: f.name.toLowerCase().endsWith('.vtt') || text.startsWith('WEBVTT') };
}

function Panel({ t, onClose }: { t: Transcript; onClose: () => void }) {
  const participant = useLiveQuery(() => db.participants.get(t.participantId), [t.participantId]);
  const segs = useLiveQuery(() => db.segments.where('transcriptId').equals(t.id).sortBy('index'), [t.id]);
  const turns = (sp: string) => segs?.filter((s) => s.speaker === sp).length ?? 0;
  const sampleOf = (sp: string) => segs?.find((s) => s.speaker === sp)?.text ?? '';
  return (
    <aside className="card lift" style={{ width: 380, flex: 'none' }}>
      <div className="row" style={{ padding: '16px 18px', borderBottom: '1px solid var(--rule)' }}>
        <strong style={{ fontSize: 17, flex: 1 }}>{t.title}</strong>
        <button className="btn ghost small" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>
      <div className="stack" style={{ padding: '16px 18px', borderBottom: '1px solid var(--rule)' }}>
        <strong>Who is the interviewer?</strong>
        {t.speakers.map((sp) => {
          const on = t.interviewerSpeakers.includes(sp);
          return (
            <button
              key={sp}
              className="card"
              onClick={() => setInterviewers(t.id, on ? t.interviewerSpeakers.filter((x) => x !== sp) : [...t.interviewerSpeakers, sp])}
              style={{ textAlign: 'left', padding: '10px 12px', cursor: 'pointer', borderColor: on ? 'var(--ink)' : 'var(--rule)', borderWidth: on ? 1.5 : 1, background: on ? 'var(--sel)' : 'var(--page)' }}
            >
              <div className="row">
                <strong className="small spacer">{sp}</strong>
                <span className="tiny faint">{turns(sp)} turns</span>
                {on && <span className="pill neutral">Interviewer</span>}
              </div>
              <div style={{ font: 'italic 13.5px/1.45 var(--read)', color: 'var(--ink2)', marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>“{sampleOf(sp)}”</div>
            </button>
          );
        })}
        <span className="tiny faint">Interviewer turns are shown for context but not coded.</span>
      </div>
      {participant && (
        <div className="stack" style={{ padding: '16px 18px' }}>
          <label className="row">
            <strong className="spacer">Participant label</strong>
            <input className="input" style={{ width: 90, fontWeight: 700 }} value={participant.label} onChange={(e) => db.participants.update(participant.id, { label: e.target.value })} />
          </label>
          <strong style={{ marginTop: 6 }}>Participant details</strong>
          <span className="tiny faint" style={{ marginTop: -6 }}>Used to group results in the report</span>
          {ATTRS.map((a) => (
            <label key={a} className="row">
              <span className="small muted spacer">{a}</span>
              <input
                className="input"
                style={{ width: 170 }}
                value={participant.attributes[a] ?? ''}
                placeholder="—"
                onChange={(e) => db.participants.update(participant.id, { attributes: { ...participant.attributes, [a]: e.target.value } })}
              />
            </label>
          ))}
          <button className="btn small" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={() => { if (confirm(`Delete ${t.title} and all its coding?`)) { void deleteTranscript(t.id); onClose(); } }}>
            <Trash2 size={14} /> Delete interview
          </button>
        </div>
      )}
    </aside>
  );
}

export default function InterviewsPage() {
  const pid = usePid();
  const transcripts = useTranscripts(pid);
  const participants = useParticipants(pid);
  const counts = useLiveQuery(async () => {
    const segs = await db.segments.where('projectId').equals(pid).toArray();
    const m = new Map<string, number>();
    for (const s of segs) if (!s.isInterviewer) m.set(s.transcriptId, (m.get(s.transcriptId) ?? 0) + 1);
    return m;
  }, [pid]);
  const [params, setParams] = useSearchParams();
  const selected = transcripts?.find((t) => t.id === params.get('t'));
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');
  const [paste, setPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    let ok = 0;
    const errors: string[] = [];
    for (const f of Array.from(files)) {
      try {
        setStatus(`Importing ${f.name}…`);
        const { text, isVtt } = await fileToText(f);
        await importTranscript(pid, f.name.replace(/\.(docx|txt|vtt|md)$/i, ''), text, { isVtt });
        ok++;
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
    setStatus([`Imported ${ok} interview${ok === 1 ? '' : 's'}.`, ...errors].join(' '));
    if (fileRef.current) fileRef.current.value = '';
  }

  async function onPaste() {
    if (!pasteText.trim()) return;
    await importTranscript(pid, `Interview ${(transcripts?.length ?? 0) + 1}`, pasteText);
    setPasteText('');
    setPaste(false);
  }

  const pmap = new Map(participants?.map((p) => [p.id, p]));
  return (
    <>
      <PageHead title="Interviews" sub={transcripts ? `${transcripts.length} transcripts in this study` : undefined}>
        <button className="btn" onClick={() => setPaste((v) => !v)}>Paste text</button>
        <button className="btn primary" onClick={() => fileRef.current?.click()}><Upload size={16} /> Import transcripts</button>
        <input ref={fileRef} type="file" multiple accept=".txt,.docx,.vtt,.md" hidden onChange={(e) => onFiles(e.target.files)} />
      </PageHead>
      <div className="work">
        <div className="grow stack">
          {status && <div className="notice neutral">{status}</div>}
          {paste && (
            <div className="card pad stack">
              <strong>Paste a transcript</strong>
              <span className="small muted">Start each turn with the speaker, e.g. “I:” and “P:”.</span>
              <textarea className="textarea" style={{ minHeight: 160, fontFamily: 'var(--read)' }} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'I: Can you tell me about…\nP: Well, when I first…'} />
              <div className="row"><button className="btn primary" onClick={onPaste}>Add interview</button><button className="btn ghost" onClick={() => setPaste(false)}>Cancel</button></div>
            </div>
          )}
          {transcripts && !transcripts.length && !paste ? (
            <Empty action={<button className="btn primary" onClick={() => fileRef.current?.click()}><Upload size={16} /> Import transcripts</button>}>
              Import .docx, .txt or .vtt transcripts. They stay in this browser.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Interview</th><th>Participant</th><th>Group</th><th>Paragraphs</th><th>Speakers</th></tr></thead>
                <tbody>
                  {transcripts?.map((t) => {
                    const p = pmap.get(t.participantId);
                    return (
                      <tr key={t.id} className={`click${selected?.id === t.id ? ' sel' : ''}`} onClick={() => setParams({ t: t.id })}>
                        <td><span className="row" style={{ fontWeight: 600 }}><FileText size={15} color="var(--ink3)" /> {t.title}</span></td>
                        <td className="muted">{p?.label}</td>
                        <td className="muted">{p?.attributes.Group || <span className="faint">—</span>}</td>
                        <td className="muted">{counts?.get(t.id) ?? '…'}</td>
                        <td>{t.interviewerSpeakers.length ? <Check size={15} color="var(--ink3)" /> : <span className="pill attn">Choose interviewer</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {selected && <Panel t={selected} onClose={() => setParams({})} />}
      </div>
    </>
  );
}
