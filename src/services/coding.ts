import { db, newId } from '../db/db';
import { seededSample } from '../domain/stats/agreement';
import type { Coder, Coding, Sample } from '../types';
import { codableSegments, currentCodebook, ledgerSink } from './core';
import type { DeviceReader } from '../ai/readers';

export async function getSample(projectId: string): Promise<Sample | undefined> {
  return db.samples.where('projectId').equals(projectId).first();
}

/** Draw the calibration sample once, reproducibly from a seed. */
export async function ensureSample(projectId: string, seed = Date.now() % 100000): Promise<Sample> {
  const existing = await getSample(projectId);
  if (existing) return existing;
  const project = await db.projects.get(projectId);
  const segs = await codableSegments(projectId);
  const count = Math.max(10, Math.round(segs.length * (project?.sampleShare ?? 0.15)));
  const picked = new Set(seededSample(segs.map((s) => s.id), count, seed));
  const sample: Sample = {
    id: newId(),
    projectId,
    kind: 'calibration',
    segmentIds: segs.filter((s) => picked.has(s.id)).map((s) => s.id),
    seed,
    madeByTeam: false,
    createdAt: Date.now(),
  };
  await db.samples.add(sample);
  return sample;
}

export async function resetSample(projectId: string) {
  const s = await getSample(projectId);
  if (!s) return;
  await db.codings.where('segmentId').anyOf(s.segmentIds).and((c) => c.coder === 'human').delete();
  await db.samples.delete(s.id);
}

/** Store one coder's full decision for a segment: a row per code, applied or not. */
export async function saveSegmentCoding(projectId: string, segmentId: string, coder: Coder, appliedCodeIds: string[], extra: { evidence?: string; promptVersion?: string } = {}) {
  const book = await currentCodebook(projectId);
  if (!book) throw new Error('Create a codebook first.');
  const now = Date.now();
  const rows: Coding[] = book.codes.map((c) => ({
    id: newId(),
    projectId,
    segmentId,
    codeId: c.id,
    coder,
    applied: appliedCodeIds.includes(c.id),
    evidence: appliedCodeIds.includes(c.id) ? extra.evidence : undefined,
    codebookVersion: book.version,
    promptVersion: extra.promptVersion,
    createdAt: now,
  }));
  await db.transaction('rw', db.codings, async () => {
    await db.codings.where('[segmentId+coder]').equals([segmentId, coder]).delete();
    await db.codings.bulkAdd(rows);
  });
}

export interface RunProgress {
  done: number;
  total: number;
  current?: { segmentId: string; codeIds: string[] };
  errors: number;
}

/**
 * Run the laptop reader over every participant segment it hasn't coded yet with the
 * current codebook version. Resumable: stopping keeps finished segments.
 */
export async function runLaptopReader(projectId: string, reader: DeviceReader, onProgress: (p: RunProgress) => void, signal?: AbortSignal) {
  const book = await currentCodebook(projectId);
  if (!book || !book.codes.length) throw new Error('Create a codebook first.');
  const segs = await codableSegments(projectId);
  const done = new Set(
    (await db.codings.where('[projectId+coder]').equals([projectId, 'device']).toArray()).filter((c) => c.codebookVersion === book.version).map((c) => c.segmentId),
  );
  const participants = new Map((await db.participants.where('projectId').equals(projectId).toArray()).map((p) => [p.id, p.label]));
  const transcripts = new Map((await db.transcripts.where('projectId').equals(projectId).toArray()).map((t) => [t.id, t.participantId]));
  const todo = segs.filter((s) => !done.has(s.id));
  const log = ledgerSink(projectId);
  const progress: RunProgress = { done: segs.length - todo.length, total: segs.length, errors: 0 };
  onProgress({ ...progress });
  for (const s of todo) {
    if (signal?.aborted) break;
    try {
      const label = participants.get(transcripts.get(s.transcriptId) ?? '') ?? 'Participant';
      const r = await reader.codeSegment(book.codes, label, s.text, log);
      await saveSegmentCoding(projectId, s.id, 'device', r.codeIds, { evidence: r.evidence, promptVersion: reader.isPractice ? 'practice' : 'device-code-s1@1' });
      progress.done++;
      progress.current = { segmentId: s.id, codeIds: r.codeIds };
    } catch (e) {
      progress.errors++;
      if (progress.errors >= 5 && progress.errors > progress.done / 4) {
        onProgress({ ...progress });
        throw e;
      }
    }
    onProgress({ ...progress });
  }
  return progress;
}

export async function coderCoverage(projectId: string, coder: Coder): Promise<Set<string>> {
  const rows = await db.codings.where('[projectId+coder]').equals([projectId, coder]).toArray();
  return new Set(rows.map((r) => r.segmentId));
}
