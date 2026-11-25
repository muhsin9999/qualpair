import { db } from '../db/db';
import { applyRedactions, approveForCloud, findRedactions, mergeSuggestions } from '../domain/deid/rules';
import type { AccessCopy, ApprovedAccessSegment, Redaction } from '../types';
import type { CloudReader, DeviceReader } from '../ai/readers';
import { codableSegments, currentCodebook, ledgerSink } from './core';
import { saveSegmentCoding, type RunProgress } from './coding';

/**
 * (Re)build access copies for a transcript from the current rules, keeping the
 * user's earlier keep/hide decisions and any laptop suggestions.
 */
export async function buildAccessCopies(transcriptId: string): Promise<AccessCopy[]> {
  const t = await db.transcripts.get(transcriptId);
  if (!t) return [];
  const project = await db.projects.get(t.projectId);
  if (!project) return [];
  const segs = (await db.segments.where('transcriptId').equals(transcriptId).sortBy('index')).filter((s) => !s.isInterviewer);
  const old = new Map((await db.accessCopies.where('transcriptId').equals(transcriptId).toArray()).map((c) => [c.segmentId, c]));
  const copies: AccessCopy[] = segs.map((s) => {
    const prev = old.get(s.id);
    const base = findRedactions(s.text, project.deid);
    // Carry over user decisions on rule matches, and keep laptop suggestions.
    const decided = base.map((r) => {
      const p = prev?.redactions.find((x) => x.start === r.start && x.end === r.end);
      return p && p.status === 'kept' ? { ...r, status: 'kept' as const } : r;
    });
    const suggestions = (prev?.redactions ?? []).filter((r) => r.source === 'laptop-reader' && !decided.some((d) => r.start < d.end && r.end > d.start));
    const redactions = [...decided, ...suggestions].sort((a, b) => a.start - b.start);
    return { segmentId: s.id, projectId: t.projectId, transcriptId, redactions, redactedText: applyRedactions(s.text, redactions) };
  });
  await db.transaction('rw', db.accessCopies, db.approvals, async () => {
    await db.accessCopies.where('transcriptId').equals(transcriptId).delete();
    await db.accessCopies.bulkAdd(copies);
    // Any rebuild needs a fresh approval.
    await db.approvals.delete(transcriptId);
  });
  return copies;
}

export async function rebuildAllAccessCopies(projectId: string) {
  const ts = await db.transcripts.where('projectId').equals(projectId).toArray();
  for (const t of ts) await buildAccessCopies(t.id);
}

/** Ask the laptop reader (on device) for names and places the rules missed. */
/** Ask the laptop reader for names and places in every paragraph. Returns how many new words it suggested. */
export async function suggestWithLaptop(transcriptId: string, reader: DeviceReader, onProgress?: (done: number, total: number) => void): Promise<{ paragraphs: number; found: number }> {
  const t = await db.transcripts.get(transcriptId);
  if (!t) return { paragraphs: 0, found: 0 };
  let copies = await db.accessCopies.where('transcriptId').equals(transcriptId).toArray();
  if (!copies.length) copies = await buildAccessCopies(transcriptId);
  const segs = new Map((await db.segments.where('transcriptId').equals(transcriptId).toArray()).map((s) => [s.id, s]));
  const log = ledgerSink(t.projectId);
  let done = 0;
  let found = 0;
  const fromLaptop = (rs: Redaction[]) => rs.filter((r) => r.source === 'laptop-reader').length;
  for (const c of copies) {
    const s = segs.get(c.segmentId);
    if (!s) continue;
    const items = await reader.suggestDeid(s.text, log);
    const redactions = mergeSuggestions(s.text, c.redactions, items);
    found += Math.max(0, fromLaptop(redactions) - fromLaptop(c.redactions));
    await db.accessCopies.put({ ...c, redactions, redactedText: applyRedactions(s.text, redactions) });
    onProgress?.(++done, copies.length);
  }
  await db.approvals.delete(transcriptId);
  return { paragraphs: done, found };
}

export async function setRedactionStatus(segmentId: string, start: number, status: Redaction['status']) {
  const c = await db.accessCopies.get(segmentId);
  const s = await db.segments.get(segmentId);
  if (!c || !s) return;
  const redactions = c.redactions.map((r) => (r.start === start ? { ...r, status } : r));
  await db.accessCopies.put({ ...c, redactions, redactedText: applyRedactions(s.text, redactions) });
  await db.approvals.delete(c.transcriptId);
}

/** Decide every pending suggestion with the same text in one transcript at once. */
export async function decideTerm(transcriptId: string, original: string, status: 'hidden' | 'kept') {
  const copies = await db.accessCopies.where('transcriptId').equals(transcriptId).toArray();
  const segs = new Map((await db.segments.where('transcriptId').equals(transcriptId).toArray()).map((s) => [s.id, s]));
  const updated = copies.map((c) => {
    const redactions = c.redactions.map((r) => (r.original.toLowerCase() === original.toLowerCase() && r.source === 'laptop-reader' ? { ...r, status } : r));
    return { ...c, redactions, redactedText: applyRedactions(segs.get(c.segmentId)?.text ?? '', redactions) };
  });
  await db.accessCopies.bulkPut(updated);
  await db.approvals.delete(transcriptId);
}

export async function approveTranscript(transcriptId: string) {
  const t = await db.transcripts.get(transcriptId);
  const project = t && (await db.projects.get(t.projectId));
  if (!t || !project) throw new Error('Transcript not found');
  const copies = await db.accessCopies.where('transcriptId').equals(transcriptId).toArray();
  // Throws if anything is undecided or a listed name is still visible.
  for (const c of copies) approveForCloud(c.redactedText, c.redactions, project.deid.alwaysHide);
  await db.approvals.put({ transcriptId, projectId: t.projectId, approvedAt: Date.now() });
}

/**
 * Collect approved access-copy segments. This is the only path that produces data
 * for the cloud reader, and it re-checks every segment through approveForCloud.
 */
export async function approvedSegments(projectId: string): Promise<ApprovedAccessSegment[]> {
  const project = await db.projects.get(projectId);
  if (!project) return [];
  const approved = new Set((await db.approvals.where('projectId').equals(projectId).toArray()).map((a) => a.transcriptId));
  const segs = await codableSegments(projectId);
  const copies = new Map((await db.accessCopies.where('projectId').equals(projectId).toArray()).map((c) => [c.segmentId, c]));
  const labels = new Map((await db.participants.where('projectId').equals(projectId).toArray()).map((p) => [p.id, p.label]));
  const tp = new Map((await db.transcripts.where('projectId').equals(projectId).toArray()).map((t) => [t.id, t.participantId]));
  const out: ApprovedAccessSegment[] = [];
  for (const s of segs) {
    if (!approved.has(s.transcriptId)) continue;
    const c = copies.get(s.id);
    if (!c) continue;
    out.push({
      segmentId: s.id,
      participantLabel: labels.get(tp.get(s.transcriptId) ?? '') ?? 'Participant',
      speakerRole: 'participant',
      text: approveForCloud(c.redactedText, c.redactions, project.deid.alwaysHide),
    });
  }
  return out;
}

export async function runCloudReader(projectId: string, reader: CloudReader, onProgress: (p: RunProgress) => void, signal?: AbortSignal, batchSize = 15) {
  const book = await currentCodebook(projectId);
  if (!book) throw new Error('Create a codebook first.');
  const all = await approvedSegments(projectId);
  const done = new Set(
    (await db.codings.where('[projectId+coder]').equals([projectId, 'cloud']).toArray()).filter((c) => c.codebookVersion === book.version).map((c) => c.segmentId),
  );
  const todo = all.filter((s) => !done.has(s.segmentId));
  const log = ledgerSink(projectId);
  const progress: RunProgress = { done: all.length - todo.length, total: all.length, errors: 0 };
  onProgress({ ...progress });
  for (let i = 0; i < todo.length; i += batchSize) {
    if (signal?.aborted) break;
    const batch = todo.slice(i, i + batchSize);
    try {
      const res = await reader.codeBatch(book.codes, batch, log);
      for (const s of batch) {
        const r = res.get(s.segmentId);
        if (!r) continue;
        await saveSegmentCoding(projectId, s.segmentId, 'cloud', r.codeIds, { evidence: r.evidence, promptVersion: reader.isPractice ? 'practice' : 'cloud-code-batch@1' });
        progress.done++;
      }
    } catch (e) {
      progress.errors++;
      onProgress({ ...progress });
      if (progress.errors >= 3) throw e;
    }
    onProgress({ ...progress });
  }
  return progress;
}
