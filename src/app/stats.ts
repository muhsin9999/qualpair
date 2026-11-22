import { db } from '../db/db';
import { codableSegments, currentCodebook } from '../services/core';
import { getSample } from '../services/coding';
import { disagreements } from '../services/results';

export interface StudyStats {
  interviews: number;
  codes: number;
  codable: number;
  sampleSize: number;
  sampleDone: number;
  laptopDone: number;
  cloudDone: number;
  approved: number;
  open: number;
  decided: number;
  ledger: number;
  perTranscript: Map<string, { codable: number; sample: number; laptop: number; cloud: number; approved: boolean; open: number; speakersSet: boolean }>;
}

/** One pass over the study that the nav, overview and pipeline table all read from. */
export async function studyStats(pid: string): Promise<StudyStats> {
  const [transcripts, book, segs, sample, codings, approvals, ledger] = await Promise.all([
    db.transcripts.where('projectId').equals(pid).toArray(),
    currentCodebook(pid),
    codableSegments(pid),
    getSample(pid),
    db.codings.where('projectId').equals(pid).toArray(),
    db.approvals.where('projectId').equals(pid).toArray(),
    db.ledger.where('projectId').equals(pid).count(),
  ]);
  const v = book?.version ?? 0;
  const has = (coder: string) => new Set(codings.filter((c) => c.coder === coder && (coder === 'human' || c.codebookVersion === v)).map((c) => c.segmentId));
  const human = has('human');
  const device = has('device');
  const cloud = has('cloud');
  const sampleIds = new Set(sample?.segmentIds ?? []);
  const dis = await disagreements(pid);
  const approvedSet = new Set(approvals.map((a) => a.transcriptId));
  const perTranscript: StudyStats['perTranscript'] = new Map();
  for (const t of transcripts) {
    const ts = segs.filter((s) => s.transcriptId === t.id);
    perTranscript.set(t.id, {
      codable: ts.length,
      sample: ts.filter((s) => sampleIds.has(s.id)).length,
      laptop: ts.filter((s) => device.has(s.id)).length,
      cloud: ts.filter((s) => cloud.has(s.id)).length,
      approved: approvedSet.has(t.id),
      open: dis.filter((d) => d.segment.transcriptId === t.id && !d.decision).length,
      speakersSet: t.interviewerSpeakers.length > 0,
    });
  }
  return {
    interviews: transcripts.length,
    codes: book?.codes.length ?? 0,
    codable: segs.length,
    sampleSize: sampleIds.size,
    sampleDone: [...sampleIds].filter((id) => human.has(id)).length,
    laptopDone: segs.filter((s) => device.has(s.id)).length,
    cloudDone: segs.filter((s) => cloud.has(s.id)).length,
    approved: approvedSet.size,
    open: dis.filter((d) => !d.decision).length,
    decided: dis.filter((d) => d.decision).length,
    ledger,
    perTranscript,
  };
}
