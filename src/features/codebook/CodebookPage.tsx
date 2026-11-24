import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Cloud, Download, Laptop, Plus, Trash2 } from 'lucide-react';
import { db } from '../../db/db';
import { codeColor, usePid, useProject } from '../../app/hooks';
import { PageHead } from '../../app/ui';
import { currentCodebook, ledgerSink, newCode, saveCodebook } from '../../services/core';
import { agreementByCode } from '../../services/results';
import { getCloudReader } from '../../ai/registry';
import { formatKappa, kappaBand } from '../../domain/stats/agreement';
import { downloadText, qdcXml } from '../../services/export';
import type { Code } from '../../types';
import { CloudTermsNotice } from '../cloud/CloudTermsNotice';

export default function CodebookPage() {
  const pid = usePid();
  const project = useProject(pid);
  const loaded = useLiveQuery(() => currentCodebook(pid).then((b) => ({ b })), [pid]);
  const book = loaded?.b;
  const ag = useLiveQuery(() => agreementByCode(pid), [pid]);
  const machineCoded = useLiveQuery(() => db.codings.where('projectId').equals(pid).filter((c) => c.coder !== 'human').count(), [pid]);
  const [draft, setDraft] = useState<Code[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [rq, setRq] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [confirmDraft, setConfirmDraft] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (loaded && draft === null) setDraft(structuredClone(loaded.b?.codes ?? []));
  }, [loaded, draft]);
  useEffect(() => {
    if (project) setRq(project.researchQuestion);
  }, [project]);

  if (!project || !draft) return null;
  const codes = draft;
  const sel = codes.find((c) => c.id === selId) ?? codes[0];
  const dirty = JSON.stringify(codes) !== JSON.stringify(book?.codes ?? []);
  const setField = (k: keyof Code, v: string) => setDraft(codes.map((c) => (c.id === sel?.id ? { ...c, [k]: v } : c)));

  async function save() {
    await saveCodebook(pid, codes);
    setMsg(machineCoded ? 'Saved as a new version. Run the readers again so they use the new definitions.' : 'Saved.');
  }
  function add() {
    const c = newCode('New code', codes.length % 8);
    setDraft([...codes, c]);
    setSelId(c.id);
  }
  function remove() {
    if (!sel || !confirm(`Delete “${sel.name}”?`)) return;
    setDraft(codes.filter((c) => c.id !== sel.id));
    setSelId(null);
  }
  async function runDraft() {
    setConfirmDraft(false);
    setDrafting(true);
    setMsg('');
    try {
      await db.projects.update(pid, { researchQuestion: rq });
      const out = await getCloudReader().draftCodebook(rq, project!.method, ledgerSink(pid));
      const fresh = out.map((c, i) => newCode(c.name, (codes.length + i) % 8, c));
      setDraft([...codes, ...fresh]);
      setMsg(`Added ${fresh.length} draft codes. Edit them, then save.`);
    } catch (e) {
      setMsg(`The cloud draft failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setDrafting(false);
    }
  }
  const agFor = (id: string) => ag?.codes.find((x) => x.code.id === id);

  return (
    <>
      <PageHead title="Codebook" sub={book ? `Version ${book.version}` : undefined}>
        {book && <button className="btn" onClick={() => downloadText(`${project.name} codebook.qdc`, qdcXml(project.name, book.codes), 'application/xml')}><Download size={15} /> .qdc</button>}
        <button className="btn primary" disabled={!dirty} onClick={save}>Save codebook</button>
      </PageHead>
      <div className="work">
        <div className="card stack" style={{ width: 290, flex: 'none', padding: '16px 10px', gap: 4 }}>
          <div className="stack" style={{ padding: '0 8px 12px', borderBottom: '1px solid var(--rule)', gap: 6 }}>
            <span className="label">Research question</span>
            <textarea className="textarea" rows={3} style={{ fontSize: 13.5 }} value={rq} onChange={(e) => setRq(e.target.value)} onBlur={() => db.projects.update(pid, { researchQuestion: rq })} />
          </div>
          <div className="row" style={{ padding: '10px 8px 4px' }}>
            <strong className="small">Codes</strong><span className="small faint spacer">{codes.length}</span>
            <button className="btn ghost small" onClick={add} aria-label="Add code"><Plus size={16} /></button>
          </div>
          {codes.map((c) => (
            <button key={c.id} className={`nav-item${sel?.id === c.id ? ' active' : ''}`} style={{ background: sel?.id === c.id ? 'var(--sel)' : 'none', cursor: 'pointer', textAlign: 'left' }} onClick={() => setSelId(c.id)}>
              <span className="cbar" style={{ background: codeColor(c) }} />
              <span className="spacer">{c.name}</span>
            </button>
          ))}
          <div style={{ height: 8 }} />
          <button className="card" style={{ padding: 12, textAlign: 'left', cursor: 'pointer' }} disabled={drafting || !rq.trim()} onClick={() => setConfirmDraft(true)}>
            <div className="row"><Cloud size={16} color="var(--cloud)" /><strong className="small">{drafting ? 'Drafting…' : 'Draft codes from the question'}</strong></div>
            <div className="tiny faint" style={{ marginLeft: 26 }}>Sends only the research question</div>
          </button>
          {confirmDraft && (
            <div className="stack" style={{ padding: 8 }}>
              <div className="notice neutral small">This sends: “{rq}”. Nothing from your interviews.</div>
              <CloudTermsNotice />
              <div className="row"><button className="btn primary small" onClick={runDraft}>Send</button><button className="btn ghost small" onClick={() => setConfirmDraft(false)}>Cancel</button></div>
            </div>
          )}
        </div>
        <div className="grow stack">
          {msg && <div className="notice neutral">{msg}</div>}
          {sel ? (
            <div className="paper stack" style={{ padding: '26px 32px', gap: 18 }}>
              <div className="row">
                <span className="cbar" style={{ background: codeColor(sel), width: 6, height: 30 }} />
                <input className="input" aria-label="Code name" style={{ fontSize: 24, fontWeight: 800, border: 'none', padding: '2px 4px' }} value={sel.name} onChange={(e) => setField('name', e.target.value)} />
                <div className="row" aria-label="Colour" style={{ gap: 4 }}>
                  {Array.from({ length: 8 }, (_, i) => (
                    <button key={i} onClick={() => setDraft(codes.map((c) => (c.id === sel.id ? { ...c, color: i } : c)))} style={{ width: 16, height: 16, borderRadius: 8, border: sel.color === i ? '2px solid var(--ink)' : 'none', background: `var(--c${i})`, cursor: 'pointer' }} aria-label={`Colour ${i + 1}`} />
                  ))}
                </div>
              </div>
              <label className="field"><span>Definition</span><textarea className="textarea" value={sel.definition} onChange={(e) => setField('definition', e.target.value)} /></label>
              <div className="row" style={{ alignItems: 'stretch', gap: 16 }}>
                <label className="field grow"><span>Use when</span><textarea className="textarea" value={sel.whenToUse} onChange={(e) => setField('whenToUse', e.target.value)} /></label>
                <label className="field grow"><span>Don’t use when</span><textarea className="textarea" value={sel.whenNotToUse} onChange={(e) => setField('whenNotToUse', e.target.value)} /></label>
              </div>
              <label className="field"><span>Example</span><textarea className="textarea" style={{ fontFamily: 'var(--read)', fontStyle: 'italic' }} value={sel.example} onChange={(e) => setField('example', e.target.value)} /></label>
              {agFor(sel.id) && (agFor(sel.id)!.laptop || agFor(sel.id)!.cloud) && (
                <div className="row small" style={{ background: 'var(--side)', borderRadius: 8, padding: '10px 14px', gap: 16 }}>
                  <strong className="muted">On your sample</strong>
                  <span className="row laptop" style={{ gap: 6, fontWeight: 600 }}><Laptop size={14} /> κ {formatKappa(agFor(sel.id)!.laptop?.kappa ?? null)} {kappaBand(agFor(sel.id)!.laptop?.kappa ?? null)}</span>
                  <span className="row cloud" style={{ gap: 6, fontWeight: 600 }}><Cloud size={14} /> κ {formatKappa(agFor(sel.id)!.cloud?.kappa ?? null)} {kappaBand(agFor(sel.id)!.cloud?.kappa ?? null)}</span>
                </div>
              )}
              <div className="row" style={{ borderTop: '1px solid var(--rule)', paddingTop: 14 }}>
                <span className="small faint spacer">{dirty ? 'Unsaved changes' : ''}</span>
                <button className="btn small" onClick={remove}><Trash2 size={14} /> Delete code</button>
              </div>
            </div>
          ) : (
            <div className="card empty">Add your first code, or draft codes from your research question.</div>
          )}
        </div>
      </div>
    </>
  );
}
