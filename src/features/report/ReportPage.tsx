import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { ArrowDown, ArrowUp, Download, Eye, EyeOff, FileText, Printer } from 'lucide-react';
import { usePid } from '../../app/hooks';
import { PageHead } from '../../app/ui';
import { db } from '../../db/db';
import { formatKappa } from '../../domain/stats/agreement';
import {
  buildReport, dataFlowText, limitationsText, methodText, reportSettings, saveReportSettings, SECTIONS, summarySentences, type ReportData, type SectionId,
} from '../../services/report';
import { downloadBlob, downloadText, qdcXml, toCsv } from '../../services/export';
import { ACCENTS, agreementSvg, matrixSvg, prevalenceSvg, svgToPng } from './figures';
import { buildDocx } from './docx';
import { coreqRows } from './coreq';
import { codableSegments, currentCodebook } from '../../services/core';
import { finalCodes } from '../../services/results';
import type { ReportSettings } from '../../types';

const FIGS: SectionId[] = ['fig-prevalence', 'fig-agreement', 'app-matrix'];

function Svg({ svg }: { svg: string }) {
  return <div style={{ width: '100%', overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: svg.replace(/width="[\d.]+" height="[\d.]+"/, 'width="100%"') }} />;
}

function Section({ id, d, accent }: { id: SectionId; d: ReportData; accent: string }) {
  const N = d.participants.length;
  switch (id) {
    case 'cover':
      return (
        <div>
          <div style={{ font: '700 9px var(--ui)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{d.settings.template === 'apa' ? 'Findings report' : 'Evaluation report'} · {d.project.name}</div>
          <h1>{d.settings.title}</h1>
          {d.settings.subtitle && <div style={{ font: '14px var(--read)', color: '#414042' }}>{d.settings.subtitle}</div>}
          <div style={{ font: '10px var(--ui)', color: '#707071', margin: '6px 0 10px' }}>
            {[d.settings.author || 'Author name', d.settings.institution || 'Institution', new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })].join(' · ')}
          </div>
          <div style={{ borderTop: '1px solid #E3E3E3', paddingTop: 8 }}>
            <h2 style={{ marginTop: 4 }}>{d.settings.template === 'apa' ? 'Summary' : 'Key findings'}</h2>
            <ul style={{ margin: 0, paddingLeft: 18 }}>{summarySentences(d).map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        </div>
      );
    case 'participants': {
      const keys = [...new Set(d.participants.flatMap((x) => Object.keys(x.attributes).filter((k) => x.attributes[k])))];
      return (
        <div>
          <div className="fig-num">Table 1</div><div className="fig-title">Participants</div>
          <table className="apa"><thead><tr><th>Participant</th>{keys.map((k) => <th key={k}>{k}</th>)}<th className="num">Paragraphs</th></tr></thead>
            <tbody>{d.participants.map((x) => <tr key={x.id}><td>{x.label}</td>{keys.map((k) => <td key={k}>{x.attributes[k] || '—'}</td>)}<td className="num">{x.paragraphs}</td></tr>)}</tbody></table>
        </div>
      );
    }
    case 'method':
      return <div><h2>Method</h2><p>{methodText(d)}</p></div>;
    case 'fig-prevalence':
      return (
        <div>
          <div className="fig-num">Figure 1</div><div className="fig-title">Number of Participants Who Discussed Each Theme</div>
          <Svg svg={prevalenceSvg(d.themes, N, d.settings.highlightCodeId, accent)} />
          <div className="note"><i>Note.</i> Counts show participants (n = {N}) with at least one paragraph coded to each theme after disagreements were resolved.{d.themes.some((t) => t.heldBack) ? ` ${d.themes.filter((t) => t.heldBack).map((t) => `“${t.code.name}”`).join(', ')} not shown: agreement was below the pass mark (κ < ${d.threshold.toFixed(2)}).` : ''} Source: QualCheck analysis of {N} interview transcripts.</div>
        </div>
      );
    case 'themes':
      return (
        <div>
          <div className="fig-num">Table 2</div><div className="fig-title">Themes, Prevalence and Illustrative Quotations</div>
          <table className="apa"><thead><tr><th>Theme</th><th className="num">Participants</th><th>Illustrative quotation</th></tr></thead>
            <tbody>{d.themes.filter((t) => !t.heldBack).map((t) => (
              <tr key={t.code.id}><td style={{ fontWeight: 600, width: 120 }}>{t.code.name}</td><td className="num" style={{ width: 70 }}>{t.participants} of {N}</td>
                <td style={{ fontFamily: 'var(--read)' }}>{t.quotes[0] ? <>‘{t.quotes[0].text}’ <span style={{ fontFamily: 'var(--ui)' }}>({t.quotes[0].label}{t.quotes[0].attrs ? `, ${t.quotes[0].attrs}` : ''})</span></> : '—'}</td></tr>
            ))}</tbody></table>
        </div>
      );
    case 'agreement': {
      const rows = d.agreement.slice().sort((a, b) => Math.min(a.laptop?.kappa ?? 1, a.cloud?.kappa ?? 1) - Math.min(b.laptop?.kappa ?? 1, b.cloud?.kappa ?? 1));
      const cell = (k: number | null | undefined) => (k == null ? '—' : <>{k < d.threshold ? <b>{formatKappa(k)}<sup>a</sup></b> : formatKappa(k)}</>);
      return (
        <div>
          <div className="fig-num">Table 3</div><div className="fig-title">Intercoder Agreement by Code</div>
          <table className="apa"><thead><tr><th>Code</th><th className="num">n</th><th className="num">Agreement</th><th className="num">κ R–L</th><th className="num">κ R–C</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.code.id}><td>{r.code.name}</td><td className="num">{r.nLaptop || r.nCloud}</td><td className="num">{r.laptop ? `${Math.round(r.laptop.po * 100)}%` : '—'}</td><td className="num">{cell(r.laptop?.kappa)}</td><td className="num">{cell(r.cloud?.kappa)}</td></tr>)}</tbody></table>
          <div className="note"><i>Note.</i> R = researcher; L = laptop reader (Gemini Nano, on device); C = cloud reader. n = paragraphs in the researcher’s sample. Agreement = observed agreement, researcher vs laptop reader. — = κ undefined (code used in all or none of the sample). <sup>a</sup> Below the pass mark of κ = {d.threshold.toFixed(2)}, set before coding.</div>
        </div>
      );
    }
    case 'fig-agreement':
      return (
        <div>
          <div className="fig-num">Figure 2</div><div className="fig-title">Agreement Between Each AI Reader and the Researcher, by Code (Cohen’s κ)</div>
          <Svg svg={agreementSvg(d.agreement, d.threshold)} />
          <div className="note"><i>Note.</i> Computed on {d.humanDone} paragraphs coded by the researcher, before disagreements were resolved. The dashed line marks the pass mark, set before coding began.</div>
        </div>
      );
    case 'limits':
      return <div><h2>Limitations</h2><p>{limitationsText(d)}</p></div>;
    case 'dataflow':
      return <div><h2>How data moved</h2><p>{dataFlowText(d)}</p></div>;
    case 'app-codebook':
      return (
        <div>
          <h2>Appendix A. Codebook</h2>
          <table className="apa"><thead><tr><th>Code</th><th>Definition</th><th>Do not use when</th></tr></thead>
            <tbody>{d.codes.map((c) => <tr key={c.id}><td style={{ fontWeight: 600 }}>{c.name}</td><td>{c.definition}</td><td>{c.whenNotToUse}</td></tr>)}</tbody></table>
        </div>
      );
    case 'app-matrix':
      return (
        <div>
          <h2>Appendix B. Codes by participant</h2>
          <div className="fig-num">Figure B1</div><div className="fig-title">Paragraphs Coded to Each Theme, by Participant</div>
          <Svg svg={matrixSvg(d.themes.map((t) => t.code), d.participants.map((x) => x.label), d.matrix)} />
        </div>
      );
    case 'app-coreq':
      return (
        <div>
          <h2>Appendix C. COREQ items (analysis and findings)</h2>
          <table className="apa"><thead><tr><th>Item</th><th>Answer</th></tr></thead><tbody>{coreqRows(d).map((r) => <tr key={r.no}><td>{r.no}. {r.item}</td><td>{r.answer}</td></tr>)}</tbody></table>
        </div>
      );
  }
}

export default function ReportPage() {
  const pid = usePid();
  const settings = useLiveQuery(() => reportSettings(pid), [pid]);
  const d = useLiveQuery(() => buildReport(pid), [pid, settings?.updatedAt]);
  const [sel, setSel] = useState<SectionId>('fig-prevalence');
  const [busy, setBusy] = useState('');
  const [accentIdx, setAccentIdx] = useState(0);
  if (!settings || !d) return null;
  const accent = ACCENTS[accentIdx]!;
  const order = (settings.sectionOrder.filter((s) => SECTIONS.some((x) => x.id === s)) as SectionId[]).concat(SECTIONS.map((s) => s.id).filter((id) => !settings.sectionOrder.includes(id)));
  const visible = order.filter((id) => !settings.hiddenSections.includes(id));
  const save = (s: Partial<ReportSettings>) => saveReportSettings({ ...settings, ...s });
  const move = (id: SectionId, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    void save({ sectionOrder: next });
  };
  const figSvg = (id: SectionId) =>
    id === 'fig-prevalence' ? prevalenceSvg(d.themes, d.participants.length, settings.highlightCodeId, accent, 640)
      : id === 'fig-agreement' ? agreementSvg(d.agreement, d.threshold, 640)
        : matrixSvg(d.themes.map((t) => t.code), d.participants.map((x) => x.label), d.matrix, 640);
  const figCsv = (id: SectionId) =>
    id === 'fig-prevalence' ? toCsv([['theme', 'participants', 'paragraphs'], ...d.themes.map((t) => [t.code.name, t.participants, t.paragraphs])])
      : id === 'fig-agreement' ? toCsv([['code', 'n', 'kappa_laptop', 'kappa_cloud', 'kappa_laptop_cloud'], ...d.agreement.map((a) => [a.code.name, a.nLaptop, a.laptop?.kappa ?? '', a.cloud?.kappa ?? '', a.laptopVsCloud?.kappa ?? ''])])
        : toCsv([['code', ...d.participants.map((p) => p.label)], ...d.themes.map((t) => [t.code.name, ...d.participants.map((p) => d.matrix.get(t.code.id)?.get(p.label) ?? 0)])]);

  async function word() {
    setBusy('Building the Word report…');
    try {
      downloadBlob(`${d!.project.name} report.docx`, await buildDocx(d!, visible));
    } finally {
      setBusy('');
    }
  }
  async function csvSegments() {
    const book = await currentCodebook(pid);
    const segs = await codableSegments(pid);
    const { applied } = await finalCodes(pid);
    const titles = new Map((await db.transcripts.where('projectId').equals(pid).toArray()).map((t) => [t.id, t.title]));
    const rows: unknown[][] = [['interview', 'paragraph', 'text', ...(book?.codes.map((c) => c.name) ?? [])]];
    for (const s of segs) rows.push([titles.get(s.transcriptId), s.index + 1, s.text, ...(book?.codes.map((c) => (applied.get(s.id)?.has(c.id) ? 1 : 0)) ?? [])]);
    downloadText(`${d!.project.name} coded paragraphs.csv`, toCsv(rows), 'text/csv');
  }
  async function backup() {
    const dump: Record<string, unknown> = {};
    for (const t of db.tables) dump[t.name] = t.name === 'projects' ? [await db.projects.get(pid)] : t.name === 'reports' ? [await db.reports.get(pid)] : await t.where('projectId').equals(pid).toArray();
    downloadText(`${d!.project.name} backup.json`, JSON.stringify({ app: 'QualCheck', version: 1, exportedAt: new Date().toISOString(), data: dump }), 'application/json');
  }

  return (
    <>
      <PageHead title="Report" sub={`Draft · ${d.undecided ? `${d.undecided} disagreements still undecided` : 'all disagreements decided'}`}>
        <button className="btn" onClick={word} disabled={!!busy}><FileText size={16} /> Word</button>
        <button className="btn primary" onClick={() => { document.body.classList.add('print-report'); window.print(); document.body.classList.remove('print-report'); }}><Printer size={16} /> Export PDF</button>
      </PageHead>
      {busy && <div className="notice neutral" style={{ margin: '12px 32px 0' }}>{busy}</div>}
      <div className="work" style={{ paddingTop: 16 }}>
        <div className="stack" style={{ width: 240, flex: 'none', gap: 2 }}>
          <label className="field" style={{ marginBottom: 10 }}>
            <span className="small faint" style={{ fontWeight: 400 }}>Template</span>
            <select className="select" style={{ fontWeight: 700 }} value={settings.template} onChange={(e) => save({ template: e.target.value as ReportSettings['template'] })}>
              <option value="apa">Academic (APA 7)</option>
              <option value="evaluation">Evaluation report</option>
            </select>
          </label>
          <span className="label">Sections</span>
          {order.map((id) => {
            const hidden = settings.hiddenSections.includes(id);
            const label = SECTIONS.find((s) => s.id === id)!.label;
            return (
              <div key={id} className="row" style={{ padding: '5px 6px', borderRadius: 7, border: sel === id ? '1.5px solid var(--ink)' : '1.5px solid transparent', background: sel === id ? 'var(--page)' : undefined, gap: 4 }}>
                <button className="btn ghost small" style={{ padding: 2 }} onClick={() => move(id, -1)} aria-label="Move up"><ArrowUp size={12} /></button>
                <button className="btn ghost small" style={{ padding: 2 }} onClick={() => move(id, 1)} aria-label="Move down"><ArrowDown size={12} /></button>
                <button onClick={() => setSel(id)} style={{ flex: 1, textAlign: 'left', border: 0, background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: sel === id ? 700 : 400, color: hidden ? 'var(--ink3)' : 'var(--ink)' }}>{label}</button>
                <button className="btn ghost small" style={{ padding: 2 }} aria-label={hidden ? 'Show section' : 'Hide section'} onClick={() => save({ hiddenSections: hidden ? settings.hiddenSections.filter((x) => x !== id) : [...settings.hiddenSections, id] })}>
                  {hidden ? <EyeOff size={14} color="var(--rule)" /> : <Eye size={14} color="var(--ink3)" />}
                </button>
              </div>
            );
          })}
          <div style={{ height: 12 }} />
          <span className="label">More exports</span>
          <button className="btn small" onClick={csvSegments}><Download size={14} /> Coded paragraphs (.csv)</button>
          <button className="btn small" onClick={async () => { const b = await currentCodebook(pid); if (b) downloadText(`${d.project.name} codebook.qdc`, qdcXml(d.project.name, b.codes), 'application/xml'); }}><Download size={14} /> Codebook for NVivo / ATLAS.ti (.qdc)</button>
          <button className="btn small" onClick={backup}><Download size={14} /> Study backup (.json)</button>
        </div>

        <div className="grow" style={{ display: 'flex', justifyContent: 'center', overflow: 'auto' }}>
          <div className="a4 report-print">
            <div style={{ font: '9px var(--ui)', color: '#707071', borderBottom: '1px solid #E3E3E3', paddingBottom: 6, marginBottom: 10 }}>{d.settings.title}</div>
            {d.practice && <div className="notice" style={{ fontFamily: 'var(--ui)', fontSize: 10, marginBottom: 8 }}>Draft made with practice readers (keyword rules, no AI). Not for reporting.</div>}
            {visible.map((id) => (
              <div key={id} className={sel === id ? 'sel-block' : ''} onClick={() => setSel(id)} style={{ marginBottom: 14, cursor: 'pointer' }}>
                <Section id={id} d={d} accent={accent} />
              </div>
            ))}
          </div>
        </div>

        <div className="card stack" style={{ width: 280, flex: 'none', padding: 0, gap: 0 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--rule)', fontWeight: 800 }}>{SECTIONS.find((s) => s.id === sel)?.label}</div>
          {sel === 'cover' && (
            <div className="stack" style={{ padding: 16 }}>
              {(['title', 'subtitle', 'author', 'institution'] as const).map((k) => (
                <label key={k} className="field"><span style={{ textTransform: 'capitalize' }}>{k}</span>
                  <input className="input" defaultValue={settings[k]} onBlur={(e) => save({ [k]: e.target.value })} /></label>
              ))}
            </div>
          )}
          {FIGS.includes(sel) && (
            <div className="stack" style={{ padding: 16, gap: 14 }}>
              {sel === 'fig-prevalence' && (
                <>
                  <label className="field"><span>Highlight</span>
                    <select className="select" value={settings.highlightCodeId ?? ''} onChange={(e) => save({ highlightCodeId: e.target.value || undefined })}>
                      <option value="">Largest theme</option>
                      {d.themes.map((t) => <option key={t.code.id} value={t.code.id}>{t.code.name}</option>)}
                    </select></label>
                  <div className="row"><span className="small muted spacer">Highlight colour</span>
                    {ACCENTS.map((c, i) => <button key={c} aria-label={`Colour ${i + 1}`} onClick={() => setAccentIdx(i)} style={{ width: 20, height: 20, borderRadius: 10, background: c, border: accentIdx === i ? '2px solid var(--ink)' : 'none', outline: accentIdx === i ? '2px solid #fff' : 'none', outlineOffset: -4, cursor: 'pointer' }} />)}
                  </div>
                  <span className="tiny faint">Bars are grey with one highlight, sorted largest first. Held-back codes are left out.</span>
                </>
              )}
              <span className="small" style={{ fontWeight: 700 }}>Download this figure</span>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn small grow" onClick={async () => { const png = await svgToPng(figSvg(sel), 3); downloadBlob(`${sel}.png`, new Blob([png.bytes as BlobPart], { type: 'image/png' })); }}>PNG</button>
                <button className="btn small grow" onClick={() => downloadText(`${sel}.svg`, figSvg(sel), 'image/svg+xml')}>SVG</button>
                <button className="btn small grow" onClick={() => downloadText(`${sel}.csv`, figCsv(sel), 'text/csv')}>Data</button>
              </div>
            </div>
          )}
          {!FIGS.includes(sel) && sel !== 'cover' && (
            <div className="small muted" style={{ padding: 16 }}>This section is written from your study’s data. Hide it with the eye, or move it with the arrows. Edit the Word file for final wording.</div>
          )}
        </div>
      </div>
    </>
  );
}
