import { db, newId } from '../db/db';
import { agreement, type AgreementResult } from '../domain/stats/agreement';
import type { Code, Coding, Decision, DecisionOutcome, Segment } from '../types';
import { codableSegments, currentCodebook } from './core';
import { getSample } from './coding';

/** codings[segmentId][coder][codeId] = applied, for the current codebook version. */
export type CodingIndex = Map<string, { human?: Map<string, boolean>; device?: Map<string, boolean>; cloud?: Map<string, boolean>; evidence: Map<string, string> }>;

export async function codingIndex(projectId: string): Promise<{ index: CodingIndex; version: number }> {
  const book = await currentCodebook(projectId);
  const version = book?.version ?? 0;
  const rows = await db.codings.where('projectId').equals(projectId).toArray();
  const index: CodingIndex = new Map();
  for (const r of rows) {
    // Human codes survive codebook edits; machine codes must match the current version.
    if (r.coder !== 'human' && r.codebookVersion !== version) continue;
    let e = index.get(r.segmentId);
    if (!e) index.set(r.segmentId, (e = { evidence: new Map() }));
    const m = (e[r.coder] ??= new Map<string, boolean>());
    m.set(r.codeId, r.applied);
    if (r.applied && r.evidence) e.evidence.set(`${r.coder}:${r.codeId}`, r.evidence);
  }
  return { index, version };
}

export interface CodeAgreement {
  code: Code;
  /** Units: sample paragraphs coded by the human and the reader. */
  nLaptop: number;
  nCloud: number;
  /** Paragraphs in the sample where the human applied this code. */
  humanApplied: number;
  laptop: AgreementResult | null;
  cloud: AgreementResult | null;
  laptopVsCloud: AgreementResult | null;
  passes: boolean;
}

export async function agreementByCode(projectId: string): Promise<{ codes: CodeAgreement[]; sampleSize: number; humanDone: number; threshold: number }> {
  const project = await db.projects.get(projectId);
  const book = await currentCodebook(projectId);
  const sample = await getSample(projectId);
  const threshold = project?.kappaThreshold ?? 0.6;
  if (!book || !sample) return { codes: [], sampleSize: sample?.segmentIds.length ?? 0, humanDone: 0, threshold };
  const { index } = await codingIndex(projectId);
  const humanSegs = sample.segmentIds.filter((id) => index.get(id)?.human);
  const codes = book.codes.map((code): CodeAgreement => {
    const pair = (a: 'human' | 'device', b: 'device' | 'cloud') => {
      const ids = humanSegs.filter((id) => index.get(id)?.[a] && index.get(id)?.[b]);
      if (!ids.length) return { r: null, n: 0 };
      const x = ids.map((id) => index.get(id)![a]!.get(code.id) ?? false);
      const y = ids.map((id) => index.get(id)![b]!.get(code.id) ?? false);
      return { r: agreement(x, y), n: ids.length };
    };
    const l = pair('human', 'device');
    const c = pair('human', 'cloud');
    const lc = pair('device', 'cloud');
    const ks = [l.r?.kappa, c.r?.kappa].filter((k): k is number => typeof k === 'number');
    return {
      code,
      nLaptop: l.n,
      nCloud: c.n,
      humanApplied: humanSegs.filter((id) => index.get(id)?.human?.get(code.id)).length,
      laptop: l.r,
      cloud: c.r,
      laptopVsCloud: lc.r,
      passes: ks.length > 0 && ks.every((k) => k >= threshold),
    };
  });
  return { codes, sampleSize: sample.segmentIds.length, humanDone: humanSegs.length, threshold };
}

export interface Disagreement {
  segment: Segment;
  code: Code;
  laptop: boolean;
  cloud: boolean;
  laptopEvidence?: string;
  cloudEvidence?: string;
  decision?: Decision;
}

/**
 * Places where the two readers disagree on a code, outside the calibration sample
 * (sample paragraphs are already decided by the researcher).
 */
export async function disagreements(projectId: string): Promise<Disagreement[]> {
  const book = await currentCodebook(projectId);
  if (!book) return [];
  const { index } = await codingIndex(projectId);
  const segs = await codableSegments(projectId);
  const decisions = await db.decisions.where('projectId').equals(projectId).toArray();
  const dmap = new Map(decisions.map((d) => [`${d.segmentId}:${d.codeId}`, d]));
  const out: Disagreement[] = [];
  for (const s of segs) {
    const e = index.get(s.id);
    if (!e?.device || !e.cloud || e.human) continue;
    for (const code of book.codes) {
      const l = e.device.get(code.id) ?? false;
      const c = e.cloud.get(code.id) ?? false;
      if (l === c) continue;
      out.push({
        segment: s,
        code,
        laptop: l,
        cloud: c,
        laptopEvidence: e.evidence.get(`device:${code.id}`),
        cloudEvidence: e.evidence.get(`cloud:${code.id}`),
        decision: dmap.get(`${s.id}:${code.id}`),
      });
    }
  }
  return out;
}

export async function decide(projectId: string, segmentId: string, codeId: string, outcome: DecisionOutcome, memo = ''): Promise<Decision> {
  const existing = await db.decisions.where('segmentId').equals(segmentId).and((d) => d.codeId === codeId).first();
  const number = existing?.number ?? (await db.decisions.where('projectId').equals(projectId).count()) + 1;
  const d: Decision = { id: existing?.id ?? newId(), projectId, number, segmentId, codeId, outcome, memo: memo || existing?.memo || '', decidedAt: Date.now() };
  await db.decisions.put(d);
  return d;
}

/**
 * The final code set used in the report:
 * the researcher's own coding where it exists, then their decisions, then agreed reader codes.
 * Undecided disagreements are left out (and counted).
 */
export async function finalCodes(projectId: string): Promise<{ applied: Map<string, Set<string>>; undecided: number }> {
  const book = await currentCodebook(projectId);
  const { index } = await codingIndex(projectId);
  const segs = await codableSegments(projectId);
  const decisions = new Map((await db.decisions.where('projectId').equals(projectId).toArray()).map((d) => [`${d.segmentId}:${d.codeId}`, d]));
  const applied = new Map<string, Set<string>>();
  let undecided = 0;
  for (const s of segs) {
    const e = index.get(s.id);
    const set = new Set<string>();
    for (const code of book?.codes ?? []) {
      if (e?.human) {
        if (e.human.get(code.id)) set.add(code.id);
        continue;
      }
      const d = decisions.get(`${s.id}:${code.id}`);
      if (d && d.outcome !== 'skipped') {
        if (d.outcome === 'applied') set.add(code.id);
        continue;
      }
      const l = e?.device?.get(code.id);
      const c = e?.cloud?.get(code.id);
      if (l !== undefined && c !== undefined) {
        if (l === c) {
          if (l) set.add(code.id);
        } else undecided++;
      } else if (l) set.add(code.id);
    }
    applied.set(s.id, set);
  }
  return { applied, undecided };
}

export function codingsForSegment(rows: Coding[], coder: Coding['coder']) {
  return new Set(rows.filter((r) => r.coder === coder && r.applied).map((r) => r.codeId));
}
