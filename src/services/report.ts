import { db } from '../db/db';
import { formatKappa, kappaBand } from '../domain/stats/agreement';
import type { Code, LedgerEntry, Participant, Project, ReportSettings, Transcript } from '../types';
import { codableSegments, currentCodebook } from './core';
import { getSample } from './coding';
import { agreementByCode, finalCodes, type CodeAgreement } from './results';
import { cloudModel } from '../firebase/config';

export const SECTIONS = [
  { id: 'cover', label: 'Title and summary' },
  { id: 'participants', label: 'Table 1 · Participants' },
  { id: 'method', label: 'Method' },
  { id: 'fig-prevalence', label: 'Figure 1 · Themes' },
  { id: 'themes', label: 'Table 2 · Themes and quotes' },
  { id: 'agreement', label: 'Table 3 · Agreement' },
  { id: 'fig-agreement', label: 'Figure 2 · Agreement by code' },
  { id: 'limits', label: 'Limitations' },
  { id: 'dataflow', label: 'How data moved' },
  { id: 'app-codebook', label: 'Appendix · Codebook' },
  { id: 'app-matrix', label: 'Appendix · Codes by participant' },
  { id: 'app-coreq', label: 'Appendix · COREQ items' },
] as const;
export type SectionId = (typeof SECTIONS)[number]['id'];

export interface Quote {
  text: string;
  label: string;
  attrs: string;
}

export interface ThemeRow {
  code: Code;
  participants: number;
  paragraphs: number;
  quotes: Quote[];
  heldBack: boolean;
}

export interface ReportData {
  project: Project;
  settings: ReportSettings;
  codes: Code[];
  participants: Array<Participant & { transcript?: Transcript; paragraphs: number }>;
  themes: ThemeRow[];
  agreement: CodeAgreement[];
  threshold: number;
  sampleSize: number;
  humanDone: number;
  totalParagraphs: number;
  undecided: number;
  decisions: number;
  matrix: Map<string, Map<string, number>>;
  ledger: { device: number; cloud: number; cloudKB: number; first?: number; last?: number; models: string[]; cloudModels: string[] };
  /** True if any reader's coding in this study came from practice readers (keyword rules, no AI). */
  practice: boolean;
  /** What actually happened in this study, so the text never claims more. */
  readers: {
    laptop: number;
    cloud: number;
    laptopPractice: boolean;
    cloudPractice: boolean;
    /** The researcher finished their sample before any reader coded anything. */
    humanFirst: boolean;
    /** The sample (and with it the pass mark) was fixed before any reader coded anything. */
    sampleBeforeAI: boolean;
  };
}

export function defaultSettings(project: Project): ReportSettings {
  return {
    projectId: project.id,
    template: 'apa',
    title: project.researchQuestion ? project.researchQuestion.replace(/\?$/, '') : project.name,
    subtitle: 'Findings from a qualitative interview study',
    author: '',
    institution: '',
    hiddenSections: [],
    sectionOrder: SECTIONS.map((s) => s.id),
    updatedAt: Date.now(),
  };
}

/** The text style in force: the researcher's choice, or the template's default (APA 7: Times New Roman 12, double). */
export function reportStyle(s: Pick<ReportSettings, 'template' | 'font' | 'fontSize' | 'lineSpacing'>) {
  const apa = s.template === 'apa';
  return {
    font: s.font ?? (apa ? 'Times New Roman' : 'Calibri'),
    fontSize: s.fontSize ?? (apa ? 12 : 11),
    lineSpacing: s.lineSpacing ?? (apa ? 2 : 1),
  } as const;
}

export async function reportSettings(projectId: string): Promise<ReportSettings | undefined> {
  const s = await db.reports.get(projectId);
  if (s) return s;
  const p = await db.projects.get(projectId);
  return p ? defaultSettings(p) : undefined;
}

export async function saveReportSettings(s: ReportSettings) {
  await db.reports.put({ ...s, updatedAt: Date.now() });
}

function pickQuotes(texts: string[], max = 2): string[] {
  const good = texts.filter((t) => t.length >= 60 && t.length <= 320);
  const pool = (good.length ? good : texts).slice().sort((a, b) => Math.abs(a.length - 180) - Math.abs(b.length - 180));
  return pool.slice(0, max).map((t) => (t.length > 340 ? `${t.slice(0, 330).replace(/\s+\S*$/, '')}…` : t));
}

export async function buildReport(projectId: string): Promise<ReportData | undefined> {
  const project = await db.projects.get(projectId);
  if (!project) return undefined;
  const settings = (await reportSettings(projectId))!;
  const book = await currentCodebook(projectId);
  const codes = book?.codes ?? [];
  const transcripts = await db.transcripts.where('projectId').equals(projectId).sortBy('importedAt');
  const parts = await db.participants.where('projectId').equals(projectId).toArray();
  const segs = await codableSegments(projectId);
  const { applied, undecided } = await finalCodes(projectId);
  const ag = await agreementByCode(projectId);
  const sample = await getSample(projectId);
  const ledgerRows: LedgerEntry[] = await db.ledger.where('projectId').equals(projectId).toArray();
  const decisions = await db.decisions.where('projectId').equals(projectId).count();
  // Who coded what, and when: the method text describes only what really happened.
  const codingRows = await db.codings.where('projectId').equals(projectId).toArray();
  const segsBy = { device: new Set<string>(), cloud: new Set<string>() };
  const practiceBy = { device: false, cloud: false };
  let firstAI = Infinity;
  let lastHuman = 0;
  for (const c of codingRows) {
    if (c.coder === 'human') lastHuman = Math.max(lastHuman, c.createdAt);
    else {
      segsBy[c.coder].add(c.segmentId);
      if (c.promptVersion === 'practice') practiceBy[c.coder] = true;
      firstAI = Math.min(firstAI, c.createdAt);
    }
  }

  const pByT = new Map(transcripts.map((t) => [t.id, parts.find((p) => p.id === t.participantId)]));
  const participants = transcripts.map((t) => {
    const p = pByT.get(t.id)!;
    return { ...p, transcript: t, paragraphs: segs.filter((s) => s.transcriptId === t.id).length };
  });
  const matrix = new Map<string, Map<string, number>>();
  const themes: ThemeRow[] = codes.map((code) => {
    const hits = segs.filter((s) => applied.get(s.id)?.has(code.id));
    const byP = new Map<string, number>();
    for (const s of hits) {
      const label = pByT.get(s.transcriptId)?.label ?? '?';
      byP.set(label, (byP.get(label) ?? 0) + 1);
    }
    matrix.set(code.id, byP);
    const quoteSegs = pickQuotes(hits.map((h) => h.text));
    const quotes = quoteSegs.map((q) => {
      const seg = hits.find((h) => h.text.startsWith(q.slice(0, 40)))!;
      const p = pByT.get(seg.transcriptId);
      const attrs = Object.values(p?.attributes ?? {}).filter(Boolean)[0] ?? '';
      return { text: q, label: p?.label ?? '?', attrs };
    });
    const a = ag.codes.find((x) => x.code.id === code.id);
    const scored = a && (a.laptop || a.cloud);
    return { code, participants: byP.size, paragraphs: hits.length, quotes, heldBack: !!scored && !a!.insufficient && !a!.passes };
  });
  themes.sort((a, b) => b.participants - a.participants || b.paragraphs - a.paragraphs);

  const dev = ledgerRows.filter((r) => r.where === 'on_device');
  const cl = ledgerRows.filter((r) => r.where === 'in_cloud');
  return {
    project,
    settings,
    codes,
    participants,
    themes,
    agreement: ag.codes,
    threshold: ag.threshold,
    sampleSize: sample?.segmentIds.length ?? 0,
    humanDone: ag.humanDone,
    totalParagraphs: segs.length,
    undecided,
    decisions,
    matrix,
    ledger: {
      device: dev.length,
      cloud: cl.length,
      cloudKB: cl.reduce((n, r) => n + r.bytesSent, 0) / 1024,
      first: ledgerRows.length ? Math.min(...ledgerRows.map((r) => r.at)) : undefined,
      last: ledgerRows.length ? Math.max(...ledgerRows.map((r) => r.at)) : undefined,
      models: [...new Set(ledgerRows.map((r) => r.model))],
      cloudModels: [...new Set(cl.filter((r) => r.ok && r.task === 'second-read').map((r) => r.model))],
    },
    practice: practiceBy.device || practiceBy.cloud,
    readers: {
      laptop: segsBy.device.size,
      cloud: segsBy.cloud.size,
      laptopPractice: practiceBy.device,
      cloudPractice: practiceBy.cloud,
      humanFirst: lastHuman > 0 && lastHuman < firstAI,
      sampleBeforeAI: !!sample && sample.createdAt < firstAI,
    },
  };
}

const n = (x: number) => x.toLocaleString('en-GB');
/** "1 paragraph", "2 paragraphs". */
export const pl = (x: number, word: string, plural = `${word}s`) => `${n(x)} ${x === 1 ? word : plural}`;

function laptopName(d: ReportData) {
  return d.readers.laptopPractice ? 'a practice reader using keyword rules (no AI)' : 'Gemini Nano, running on the researcher’s computer in Chrome through Firebase AI Logic in on-device-only mode';
}
function cloudName(d: ReportData) {
  return d.readers.cloudPractice ? 'a practice reader using keyword rules (no AI)' : `${(d.ledger.cloudModels.length ? d.ledger.cloudModels : [cloudModel()]).join(', ')}, through Firebase AI Logic`;
}
function coverage(x: number, total: number) {
  return x >= total ? 'every paragraph' : `${n(x)} of ${pl(total, 'paragraph')}`;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function summarySentences(d: ReportData): string[] {
  const N = d.participants.length;
  const out = d.themes
    .filter((t) => !t.heldBack && t.participants > 0)
    .slice(0, 4)
    .map((t) => `${t.participants === N ? 'All' : t.participants > N / 2 ? 'Most' : t.participants > N / 4 ? 'Some' : 'A few'} participants (${t.participants} of ${N}) described ${t.code.definition.charAt(0).toLowerCase()}${t.code.definition.slice(1).replace(/\.$/, '')} (“${t.code.name}”).`);
  const kl = median(d.agreement.map((a) => a.laptop?.kappa).filter((k): k is number => typeof k === 'number'));
  const kc = median(d.agreement.map((a) => a.cloud?.kappa).filter((k): k is number => typeof k === 'number'));
  const parts = [kl !== null ? `${formatKappa(kl)} for the laptop reader` : '', kc !== null ? `${formatKappa(kc)} for the cloud reader` : ''].filter(Boolean);
  if (parts.length)
    out.push(`Agreement between the researcher and the ${parts.length === 2 ? 'AI readers' : kl !== null ? 'laptop reader' : 'cloud reader'} was ${kappaBand(Math.min(kl ?? 1, kc ?? 1))} (median κ = ${parts.join(' and ')}, across ${pl(d.codes.length, 'code')}).`);
  return out;
}

export function methodText(d: ReportData): string {
  const N = d.participants.length;
  const share = d.totalParagraphs ? Math.round((d.sampleSize / d.totalParagraphs) * 100) : 0;
  const { laptop, cloud } = d.readers;
  let readers: string;
  if (laptop && cloud)
    readers = `Two AI readers then coded the paragraphs independently, without seeing each other’s or the researcher’s codes. The laptop reader (${laptopName(d)}) read the original transcripts and coded ${coverage(laptop, d.totalParagraphs)}. The cloud reader (${cloudName(d)}) read only de-identified access copies that the researcher had reviewed and approved, and coded ${coverage(cloud, d.totalParagraphs)}.`;
  else if (laptop)
    readers = `A laptop reader (${laptopName(d)}) then read the original transcripts and coded ${coverage(laptop, d.totalParagraphs)}, without seeing the researcher’s codes. No cloud reader was used.`;
  else if (cloud)
    readers = `A cloud reader (${cloudName(d)}) then coded ${coverage(cloud, d.totalParagraphs)}, reading only de-identified access copies that the researcher had reviewed and approved, without seeing the researcher’s codes. No laptop reader was used.`;
  else readers = 'No AI reader has coded the paragraphs yet.';
  const both = laptop > 0 && cloud > 0;
  return [
    `Transcripts of ${pl(N, 'interview')} were divided into ${pl(d.totalParagraphs, 'participant paragraph')} (one paragraph per speaker turn; long turns were split at sentence boundaries). Interviewer turns were kept for context but not coded.`,
    `The researcher wrote a codebook of ${pl(d.codes.length, 'code')}, each with a definition, inclusion and exclusion criteria, and an example.`,
    `The researcher ${d.readers.humanFirst ? 'first coded' : 'coded'} a random sample of ${pl(d.sampleSize, 'paragraph')} (${share}%) by hand. The pass mark for agreement (Cohen’s κ ≥ ${d.threshold.toFixed(2)}) was fixed when the sample was drawn, ${d.readers.sampleBeforeAI ? 'before any AI coding' : 'before agreement was computed'}.`,
    readers,
    laptop || cloud
      ? `Agreement of ${both ? 'each reader' : 'the reader'} with the researcher was measured per code with Cohen’s κ on the researcher’s sample. Codes below the pass mark were held back from the findings.${both ? (d.decisions ? ` Where the two readers disagreed, the researcher decided each case (${pl(d.decisions, 'decision')}, each logged with an optional memo).${d.undecided ? ` ${pl(d.undecided, 'disagreement')} ${d.undecided === 1 ? 'was' : 'were'} still undecided and ${d.undecided === 1 ? 'is' : 'are'} not counted.` : ''}` : d.undecided ? ` Where the two readers disagree, the researcher decides each case; none had been decided when this draft was made (${pl(d.undecided, 'disagreement')} open, not counted).` : ' The two readers agreed on every paragraph.') : ''}`
      : '',
    `AI coding was used to support, not replace, the researcher’s interpretation. All themes and quotations were reviewed by the researcher.`,
  ].filter(Boolean).join(' ');
}

export function dataFlowText(d: ReportData): string {
  return [
    `Original transcripts were stored only in the researcher’s browser${d.ledger.device ? ` and processed only on the researcher’s computer (${pl(d.ledger.device, 'on-device AI call')})` : ''}.`,
    d.ledger.cloud
      ? `Before any cloud processing, names on the researcher’s list, places, phone numbers, email addresses and dates were replaced with placeholders, and the researcher approved each access copy. Only approved access copies and the code definitions were sent to the cloud reader (${pl(d.ledger.cloud, 'call')}, ${d.ledger.cloudKB.toFixed(1)} KB in total).`
      : 'Nothing from the interviews was sent to a cloud AI service.',
    `Every AI call was logged with its time, location (on device or in the cloud), model and prompt version; the exact text of every cloud request is kept in the study’s activity log.`,
  ].join(' ');
}

/** Codes held back from the findings because a reader agreed with the researcher below the pass mark. */
export function heldBackIds(d: ReportData): Set<string> {
  return new Set(d.themes.filter((t) => t.heldBack).map((t) => t.code.id));
}

/** Note under Figure B1. */
export function matrixNote(d: ReportData): string {
  const low = d.themes.filter((t) => t.heldBack).map((t) => `“${t.code.name}”`);
  return `Shading shows how many paragraphs of each participant’s interview were coded to each theme after disagreements were resolved; the number on the right is the total.${low.length ? ` ᵃ Below the pass mark of κ = ${d.threshold.toFixed(2)} (${low.join(', ')}): shown here for completeness, not reported in Figure 1 or Table 2.` : ''}`;
}

/** Footnote for the agreement table: says why a cell is empty, in this study. */
export function agreementNote(d: ReportData): string {
  const why = [
    !d.readers.laptop ? 'the laptop reader has not coded the sample' : '',
    !d.readers.cloud ? 'the cloud reader has not coded the sample' : '',
    'the researcher used the code in all or none of the sample',
  ].filter(Boolean);
  return `R = researcher; L = laptop reader (${d.readers.laptopPractice ? 'practice reader, no AI' : 'Gemini Nano, on device'}); C = cloud reader (${d.readers.cloudPractice ? 'practice reader, no AI' : 'Gemini, in the cloud'}). n = paragraphs in the researcher’s sample. Agreement = observed agreement between the researcher and the ${d.readers.laptop ? 'laptop' : 'cloud'} reader. Sorted from weakest agreement. — = not measurable: ${why.join('; or ')}. ᵃ Below the pass mark of κ = ${d.threshold.toFixed(2)}.`;
}

export function limitationsText(d: ReportData): string {
  return [
    'These findings are illustrative and exploratory. Qualitative interviews give insight into experiences and reasons, not conclusions that can be generalised to a wider population.',
    'Counts show how many participants mentioned a theme; they are not measures of importance.',
    `Agreement was measured on a sample of ${pl(d.humanDone, 'paragraph')}; κ can be unstable for codes that were rarely used.`,
    d.practice ? `Practice readers (keyword rules, no AI) did the ${d.readers.laptopPractice && d.readers.cloudPractice ? 'laptop and cloud' : d.readers.laptopPractice ? 'laptop' : 'cloud'} coding in this draft; replace them with the AI readers before reporting.` : '',
  ].filter(Boolean).join(' ');
}
