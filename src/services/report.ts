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
  practice: boolean;
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
    practice: ledgerRows.some((r) => r.promptVersion === 'practice'),
  };
}

const n = (x: number) => x.toLocaleString('en-GB');

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
  if (kl !== null || kc !== null)
    out.push(`Agreement between the researcher and the AI readers was ${kappaBand(Math.min(kl ?? 1, kc ?? 1))} (median κ = ${formatKappa(kl)} for the laptop reader and ${formatKappa(kc)} for the cloud reader, across ${d.codes.length} codes).`);
  return out;
}

export function methodText(d: ReportData): string {
  const N = d.participants.length;
  const share = d.totalParagraphs ? Math.round((d.sampleSize / d.totalParagraphs) * 100) : 0;
  return [
    `Transcripts of ${N} interview${N === 1 ? '' : 's'} were divided into ${n(d.totalParagraphs)} participant paragraphs (one paragraph per speaker turn; long turns were split at sentence boundaries). Interviewer turns were kept for context but not coded.`,
    `The researcher wrote a codebook of ${d.codes.length} codes, each with a definition, inclusion and exclusion criteria, and an example.`,
    `The researcher first coded a random sample of ${d.sampleSize} paragraphs (${share}%). The pass mark for agreement (Cohen’s κ ≥ ${d.threshold.toFixed(2)}) was fixed before any AI coding.`,
    `Two AI readers then coded every paragraph independently, without seeing each other’s or the researcher’s codes. The laptop reader (Gemini Nano, running on the researcher’s computer in Chrome through Firebase AI Logic in on-device-only mode) read the original transcripts. The cloud reader (${(d.ledger.cloudModels.length ? d.ledger.cloudModels : [cloudModel()]).join(', ')}, through Firebase AI Logic) read only de-identified access copies that the researcher had reviewed and approved.`,
    `Agreement of each reader with the researcher was measured per code with Cohen’s κ on the researcher’s sample. Codes below the pass mark were held back from the findings. Where the two readers disagreed, the researcher decided each case (${n(d.decisions)} decisions, each logged with an optional memo).${d.undecided ? ` ${n(d.undecided)} disagreements were still undecided and are not counted.` : ''}`,
    `AI coding was used to support, not replace, the researcher’s interpretation. All themes and quotations were reviewed by the researcher.`,
  ].join(' ');
}

export function dataFlowText(d: ReportData): string {
  return [
    `Original transcripts were stored only in the researcher’s browser and processed only on the researcher’s computer (${n(d.ledger.device)} on-device AI calls).`,
    `Before any cloud processing, names on the researcher’s list, places, phone numbers, email addresses and dates were replaced with placeholders, and the researcher approved each access copy. Only approved access copies and the code definitions were sent to the cloud reader (${n(d.ledger.cloud)} calls, ${d.ledger.cloudKB.toFixed(1)} KB in total).`,
    `Every AI call was logged with its time, location (on device or in the cloud), model and prompt version; the exact text of every cloud request is kept in the study’s activity log.`,
  ].join(' ');
}

export function limitationsText(d: ReportData): string {
  return [
    'These findings are illustrative and exploratory. Qualitative interviews give insight into experiences and reasons, not conclusions that can be generalised to a wider population.',
    'Counts show how many participants mentioned a theme; they are not measures of importance.',
    `Agreement was measured on a sample of ${d.humanDone} paragraphs; κ can be unstable for codes that were rarely used.`,
    d.practice ? 'Practice readers (keyword rules) were used for some coding in this draft; replace them with the AI readers before reporting.' : '',
  ].filter(Boolean).join(' ');
}
