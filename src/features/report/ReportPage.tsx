import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, Download, Eye, EyeOff, FileText, Minus, Plus, Printer } from 'lucide-react';
import { usePid } from '../../app/hooks';
import { PageHead, Segmented } from '../../app/ui';
import { db } from '../../db/db';
import { formatKappa } from '../../domain/stats/agreement';
import {
  buildReport, dataFlowText, reportStyle, limitationsText, methodText, reportSettings, saveReportSettings, SECTIONS, summarySentences, type ReportData, type SectionId,
} from '../../services/report';
import { downloadBlob, downloadText, qdcXml, toCsv } from '../../services/export';
import { PagedPreview } from './PagedPreview';
import { Select } from '../../app/Select';
import { Menu } from '../../app/Menu';
import { ACCENTS, agreementSvg, matrixSvg, prevalenceSvg, svgToPng } from './figures';
import { buildDocx } from './docx';
import { coreqRows } from './coreq';
import { codableSegments, currentCodebook } from '../../services/core';
import { finalCodes } from '../../services/results';
import type { ReportFont, ReportSettings } from '../../types';

const FONTS: ReportFont[] = ['Times New Roman', 'Georgia', 'Calibri', 'Arial'];
/** Each Office font with its free metric-compatible stand-ins, for computers without it. */
const FONT_STACK: Record<ReportFont, string> = {
  'Times New Roman': "'Times New Roman', Tinos, 'Liberation Serif', Times, serif",
  Georgia: "Georgia, Gelasio, serif",
  Calibri: "Calibri, Carlito, 'Source Sans 3', sans-serif",
  Arial: "Arial, Arimo, 'Liberation Sans', Helvetica, sans-serif",
};

const FIGS: SectionId[] = ['fig-prevalence', 'fig-agreement', 'app-matrix'];

function Svg({ svg }: { svg: string }) {
  return <div className="svg-fig" style={{ width: '100%', overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: svg.replace(/width="[\d.]+" height="[\d.]+"/, 'width="100%"') }} />;
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
          <div className="note"><i>Note.</i> Counts show participants (n = {N}) with at least one paragraph coded to each theme after disagreements were resolved.{d.themes.some((t) => t.heldBack) ? ` ${d.themes.filter((t) => t.heldBack).map((t) => `“${t.code.name}”`).join(', ')} not shown: agreement was below the pass mark (κ < ${d.threshold.toFixed(2)}).` : ''} Source: QualPair analysis of {N} interview transcripts.</div>
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
            <tbody>{rows.map((r) => <tr key={r.code.id}><td>{r.code.name}</td><td className="num">{r.nLaptop || r.nCloud}</td><td className="num">{r.laptop ? `${Math.round(r.laptop.po * 100)}%` : '—'}</td><td className="num">{r.insufficient ? '—' : cell(r.laptop?.kappa)}</td><td className="num">{r.insufficient ? '—' : cell(r.cloud?.kappa)}</td></tr>)}</tbody></table>
          <div className="note"><i>Note.</i> R = researcher; L = laptop reader (Gemini Nano, on device); C = cloud reader. n = paragraphs in the researcher’s sample. Agreement = observed agreement, researcher vs laptop reader. — = not measurable (the researcher used the code in all or none of the sample). <sup>a</sup> Below the pass mark of κ = {d.threshold.toFixed(2)}, set before coding.</div>
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
  const [jump, setJump] = useState<{ id: string; n: number }>();
  const [zoom, setZoom] = useState<number | 'fit' | 'page'>('fit');
  const [scale, setScale] = useState(1);
  const pick = (id: SectionId) => {
    setSel(id);
    setJump((j) => ({ id, n: (j?.n ?? 0) + 1 }));
  };
  if (!settings || !d) return null;
  const accent = ACCENTS[accentIdx]!;
  const style = reportStyle(settings);
  // On screen an A4 sheet is 640 px wide (0.81 of real size), so 1 pt ≈ 1.075 px. Word's "single" ≈ CSS 1.2.
  const repStyle = { '--rep-font': FONT_STACK[style.font], '--rep-size': `${(style.fontSize * 1.075).toFixed(2)}px`, '--rep-lh': String(style.lineSpacing === 1 ? 1.2 : style.lineSpacing === 1.5 ? 1.75 : 2.3) } as CSSProperties;
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
    downloadText(`${d!.project.name} backup.json`, JSON.stringify({ app: 'QualPair', version: 1, exportedAt: new Date().toISOString(), data: dump }), 'application/json');
  }

  const printPdf = () => { document.body.classList.add('print-report'); window.print(); document.body.classList.remove('print-report'); };
  const shown = order.length - settings.hiddenSections.filter((h) => order.includes(h as SectionId)).length;
  const selHidden = settings.hiddenSections.includes(sel);
  const toggle = (id: SectionId) => save({ hiddenSections: settings.hiddenSections.includes(id) ? settings.hiddenSections.filter((x) => x !== id) : [...settings.hiddenSections, id] });

  return (
    <>
      <PageHead title="Report" sub={`Draft · ${d.undecided ? `${d.undecided} disagreements still undecided` : 'all disagreements decided'}`}>
        <Menu label="More" icon={<Download size={16} />} items={[
          { label: 'Coded paragraphs', hint: 'CSV, one row per paragraph', onSelect: () => void csvSegments() },
          { label: 'Codebook for NVivo / ATLAS.ti', hint: 'QDC file', onSelect: async () => { const b = await currentCodebook(pid); if (b) downloadText(`${d.project.name} codebook.qdc`, qdcXml(d.project.name, b.codes), 'application/xml'); } },
          { label: 'Study backup', hint: 'JSON, everything in this study', onSelect: () => void backup() },
        ]} />
        <button className="btn" onClick={word} disabled={!!busy}><FileText size={16} /> Word</button>
        <button className="btn primary" onClick={printPdf}><Printer size={16} /> Print / save as PDF</button>
      </PageHead>
      {busy && <div className="notice neutral" style={{ margin: '12px 32px 0' }}>{busy}</div>}
      <div className="editor">
        <div className="ed-bar" role="toolbar" aria-label="Report format">
          <Select compact strong label="Template" style={{ width: 190 }} value={settings.template} onChange={(v) => save({ template: v })}
            options={[{ value: 'apa', label: 'Academic (APA 7)' }, { value: 'evaluation', label: 'Evaluation report' }]} />
          <span className="ed-sep" />
          <Select compact label="Font" style={{ width: 172 }} value={style.font} onChange={(v) => save({ font: v })}
            options={FONTS.map((f) => ({ value: f, label: f, style: { fontFamily: FONT_STACK[f], fontSize: 15 } }))} />
          <Segmented compact label="Text size" value={style.fontSize} onChange={(v) => save({ fontSize: v })} options={[[11, '11 pt'], [12, '12 pt']]} />
          <Segmented compact label="Line spacing" value={style.lineSpacing} onChange={(v) => save({ lineSpacing: v })} options={[[1, 'Single'], [1.5, '1.5'], [2, 'Double']]} />
          <span className="spacer" />
          <Segmented compact label="Fit" value={typeof zoom === 'number' ? '' : zoom} onChange={(v) => v && setZoom(v)} options={[['fit', 'Fit width'], ['page', 'Whole page']]} />
          <div className="ed-zoom" role="group" aria-label="Zoom">
            <button type="button" aria-label="Zoom out" disabled={scale <= 0.5} onClick={() => setZoom(Math.max(0.5, Math.round((scale - 0.1) * 10) / 10))}><Minus size={15} /></button>
            <button type="button" className="pct" title="Fit page width" aria-label={`Zoom ${Math.round(scale * 100)}%, fit page width`} onClick={() => setZoom('fit')}>{Math.round(scale * 100)}%</button>
            <button type="button" aria-label="Zoom in" disabled={scale >= 1.5} onClick={() => setZoom(Math.min(1.5, Math.round((scale + 0.1) * 10) / 10))}><Plus size={15} /></button>
          </div>
        </div>
        <div className="ed-body">
          <nav className="ed-rail" aria-label="Report sections">
            <div className="ed-rail-h"><span>Sections</span><span className="faint">{shown} of {order.length} shown</span></div>
            {order.map((id) => {
              const hidden = settings.hiddenSections.includes(id);
              const label = SECTIONS.find((s) => s.id === id)!.label;
              const [tag, name] = label.includes(' · ') ? label.split(' · ') as [string, string] : ['', label];
              return (
                <div key={id} className={`ed-sec${sel === id ? ' on' : ''}${hidden ? ' off' : ''}`}>
                  <button type="button" className="ed-sec-name" onClick={() => pick(id)} title={label} aria-current={sel === id ? 'true' : undefined}>
                    <span className="nm">{name}</span>{tag && <span className="tag">{tag}</span>}
                  </button>
                  <span className="ed-sec-tools">
                    <button type="button" onClick={() => move(id, -1)} aria-label={`Move ${name} up`}><ArrowUp size={13} /></button>
                    <button type="button" onClick={() => move(id, 1)} aria-label={`Move ${name} down`}><ArrowDown size={13} /></button>
                  </span>
                  <button type="button" className="ed-eye" aria-label={hidden ? `Show ${name}` : `Hide ${name}`} aria-pressed={!hidden} onClick={() => toggle(id)}>
                    {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              );
            })}
          </nav>

          <PagedPreview className="ed-desk" header={d.settings.title} jump={jump} repStyle={repStyle} zoom={zoom} onScale={setScale}>
            {d.practice && <div className="notice" style={{ fontFamily: 'var(--ui)', fontSize: 10, marginBottom: 8 }}>Draft made with practice readers (keyword rules, no AI). Not for reporting.</div>}
            {visible.map((id) => (
              <div key={id} data-sec={id} className={sel === id ? 'sel-block' : ''} onClick={() => setSel(id)} style={{ marginBottom: 14, cursor: 'pointer' }}>
                <Section id={id} d={d} accent={accent} />
              </div>
            ))}
          </PagedPreview>

          <aside className="ed-insp" aria-label="Section settings">
            <div className="ed-insp-h">{SECTIONS.find((s) => s.id === sel)?.label}</div>
            <div className="ed-insp-b">
              {selHidden && <div className="notice small">Hidden from the report. <button type="button" className="linkish" onClick={() => toggle(sel)}>Show it</button></div>}
              {sel === 'cover' && (['title', 'subtitle', 'author', 'institution'] as const).map((k) => (
                <label key={k} className="field"><span style={{ textTransform: 'capitalize' }}>{k}</span>
                  <input className="input" defaultValue={settings[k]} onBlur={(e) => save({ [k]: e.target.value })} /></label>
              ))}
              {sel === 'fig-prevalence' && (
                <>
                  <div className="field"><span>Highlight</span>
                    <Select label="Highlight" value={settings.highlightCodeId ?? ''} onChange={(v) => save({ highlightCodeId: v || undefined })}
                      options={[{ value: '', label: 'Largest theme' }, ...d.themes.map((t) => ({ value: t.code.id, label: t.code.name }))]} /></div>
                  <div className="field"><span>Highlight colour</span>
                    <div className="row" style={{ gap: 8 }}>
                      {ACCENTS.map((c, i) => <button key={c} type="button" className={`swatch${accentIdx === i ? ' on' : ''}`} aria-label={`Colour ${i + 1}`} aria-pressed={accentIdx === i} onClick={() => setAccentIdx(i)} style={{ background: c }} />)}
                    </div></div>
                </>
              )}
              {FIGS.includes(sel) && (
                <div className="field"><span>Download this figure</span>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn small grow" onClick={async () => { const png = await svgToPng(figSvg(sel), 3); downloadBlob(`${sel}.png`, new Blob([png.bytes as BlobPart], { type: 'image/png' })); }}>PNG</button>
                    <button className="btn small grow" onClick={() => downloadText(`${sel}.svg`, figSvg(sel), 'image/svg+xml')}>SVG</button>
                    <button className="btn small grow" onClick={() => downloadText(`${sel}.csv`, figCsv(sel), 'text/csv')}>Data</button>
                  </div></div>
              )}
              {!FIGS.includes(sel) && sel !== 'cover' && <p className="small muted" style={{ margin: 0 }}>Written from your study’s data. Change the wording in the Word file.</p>}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
