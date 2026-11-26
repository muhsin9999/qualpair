import {
  AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import { formatKappa } from '../../domain/stats/agreement';
import { agreementNote, dataFlowText, heldBackIds, limitationsText, matrixNote, methodText, pl, reportStyle, summarySentences, type ReportData, type SectionId } from '../../services/report';
import { agreementSvg, matrixSvg, prevalenceSvg, svgToPng, ACCENTS } from './figures';
import { coreqRows } from './coreq';

let FONT = 'Calibri';
/** Body size in half-points; other sizes keep their distance from the 11 pt original. */
let BASE = 22;
const S = (n: number) => n - 22 + BASE;
const rule = { style: BorderStyle.SINGLE, size: 6, color: '222222' };
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

function p(text: string, opts: { bold?: boolean; italics?: boolean; size?: number; after?: number } = {}) {
  return new Paragraph({ spacing: { after: opts.after ?? 120 }, children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size ?? S(22), font: FONT })] });
}

/** APA tables: horizontal rules only (top, under the header, bottom). */
function apaTable(header: string[], rows: string[][], numericCols: number[] = []) {
  const cell = (t: string, i: number, isHead: boolean, isLast: boolean) =>
    new TableCell({
      borders: { top: isHead ? rule : none, bottom: isHead || isLast ? rule : none, left: none, right: none },
      children: [new Paragraph({ spacing: { line: 240 }, alignment: numericCols.includes(i) ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: t, bold: isHead, size: S(19), font: FONT })] })],
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: [
      new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, i, true, false)) }),
      ...rows.map((r, ri) => new TableRow({ children: r.map((t, i) => cell(t, i, false, ri === rows.length - 1)) })),
    ],
  });
}

async function figure(svg: string) {
  const png = await svgToPng(svg, 2);
  const w = 600;
  return new Paragraph({ children: [new ImageRun({ type: 'png', data: png.bytes, transformation: { width: w, height: Math.round((png.height / png.width) * w) } })] });
}

function caption(kind: 'Figure' | 'Table', num: string, title: string) {
  return [p(`${kind} ${num}`, { bold: true, after: 40 }), p(title, { italics: true, after: 80 })];
}

export async function buildDocx(d: ReportData, order: SectionId[]): Promise<Blob> {
  const style = reportStyle(d.settings);
  FONT = style.font;
  BASE = style.fontSize * 2;
  const N = d.participants.length;
  const accent = ACCENTS[0];
  const kids: Array<Paragraph | Table> = [];
  for (const id of order) {
    if (id === 'cover') {
      kids.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: d.settings.title, font: FONT, size: S(40), bold: true })] }));
      if (d.settings.subtitle) kids.push(p(d.settings.subtitle, { size: S(26) }));
      const by = [d.settings.author, d.settings.institution, new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })].filter(Boolean).join(' · ');
      kids.push(p(by, { size: S(20) }));
      kids.push(p('Summary', { bold: true, size: S(26) }));
      for (const s of summarySentences(d)) kids.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: s, font: FONT, size: S(22) })] }));
    } else if (id === 'participants') {
      kids.push(...caption('Table', '1', 'Participants'));
      const keys = [...new Set(d.participants.flatMap((x) => Object.keys(x.attributes).filter((k) => x.attributes[k])))];
      kids.push(apaTable(['Participant', ...keys, 'Paragraphs'], d.participants.map((x) => [x.label, ...keys.map((k) => x.attributes[k] || '—'), String(x.paragraphs)]), [keys.length + 1]));
      kids.push(p(''));
    } else if (id === 'method') {
      kids.push(p('Method', { bold: true, size: S(26) }));
      kids.push(p(methodText(d)));
    } else if (id === 'fig-prevalence') {
      kids.push(...caption('Figure', '1', 'Number of Participants Who Discussed Each Theme'));
      kids.push(await figure(prevalenceSvg(d.themes, N, d.settings.highlightCodeId, accent, 560)));
      kids.push(p(`Note. Counts show participants (n = ${N}) with at least one paragraph coded to each theme after disagreements were resolved. Codes below the pass mark are not shown.`, { size: S(18) }));
    } else if (id === 'themes') {
      kids.push(...caption('Table', '2', 'Themes, Prevalence and Illustrative Quotations'));
      kids.push(apaTable(['Theme', 'Definition', 'Participants', 'Illustrative quotation'], d.themes.filter((t) => !t.heldBack).map((t) => [t.code.name, t.code.definition, `${t.participants} of ${N}`, t.quotes[0] ? `“${t.quotes[0].text}” (${t.quotes[0].label}${t.quotes[0].attrs ? `, ${t.quotes[0].attrs}` : ''})` : '—']), [2]));
      kids.push(p(''));
    } else if (id === 'agreement') {
      kids.push(...caption('Table', '3', 'Intercoder Agreement by Code'));
      const rows = d.agreement.slice().sort((a, b) => Math.min(a.laptop?.kappa ?? 1, a.cloud?.kappa ?? 1) - Math.min(b.laptop?.kappa ?? 1, b.cloud?.kappa ?? 1));
      const mark = (k: number | null | undefined) => (k == null ? '—' : `${formatKappa(k)}${k < d.threshold ? 'ᵃ' : ''}`);
      kids.push(apaTable(['Code', 'n', d.readers.laptop ? 'Agreement (L)' : 'Agreement (C)', 'κ R–L', 'κ R–C'], rows.map((r) => [r.code.name, String(r.nLaptop || r.nCloud), (r.laptop ?? r.cloud) ? `${Math.round((r.laptop ?? r.cloud)!.po * 100)}%` : '—', r.insufficient ? '—' : mark(r.laptop?.kappa), r.insufficient ? '—' : mark(r.cloud?.kappa)]), [1, 2, 3, 4]));
      kids.push(p(`Note. ${agreementNote(d)}`, { size: S(18) }));
    } else if (id === 'fig-agreement') {
      kids.push(...caption('Figure', '2', 'Agreement Between Each AI Reader and the Researcher, by Code (Cohen’s κ)'));
      kids.push(await figure(agreementSvg(d.agreement, d.threshold, 560)));
      kids.push(p(`Note. Agreement was computed on ${pl(d.humanDone, 'paragraph')} coded by the researcher, before disagreements were resolved. The dashed line marks the pass mark, fixed when the sample was drawn.`, { size: S(18) }));
    } else if (id === 'limits') {
      kids.push(p('Limitations', { bold: true, size: S(26) }));
      kids.push(p(limitationsText(d)));
    } else if (id === 'dataflow') {
      kids.push(p('How data moved', { bold: true, size: S(26) }));
      kids.push(p(dataFlowText(d)));
    } else if (id === 'app-codebook') {
      kids.push(p('Appendix A. Codebook', { bold: true, size: S(26) }));
      kids.push(apaTable(['Code', 'Definition', 'Use when', 'Do not use when'], d.codes.map((c) => [c.name, c.definition, c.whenToUse, c.whenNotToUse])));
      kids.push(p(''));
    } else if (id === 'app-matrix') {
      kids.push(p('Appendix B. Codes by Participant', { bold: true, size: S(26) }));
      kids.push(...caption('Figure', 'B1', 'Paragraphs Coded to Each Theme, by Participant'));
      kids.push(await figure(matrixSvg(d.themes.map((t) => t.code), d.participants.map((x) => x.label), d.matrix, 560, heldBackIds(d))));
      kids.push(p(`Note. ${matrixNote(d)}`, { size: S(18) }));
    } else if (id === 'app-coreq') {
      kids.push(p('Appendix C. COREQ Items (Analysis and Findings)', { bold: true, size: S(26) }));
      kids.push(apaTable(['COREQ item', 'Answer'], coreqRows(d).map((r) => [`${r.no}. ${r.item}`, r.answer])));
    }
  }
  const doc = new Document({ creator: 'QualPair', title: d.settings.title, styles: { default: { document: { run: { font: FONT, size: BASE }, paragraph: { spacing: { line: Math.round(240 * style.lineSpacing) } } } } }, sections: [{ children: kids }] });
  return Packer.toBlob(doc);
}
