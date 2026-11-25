import { db, newId } from '../db/db';
import { DEFAULT_DEID } from '../domain/deid/rules';
import { guessInterviewers, parseTranscript, segmentTurns, vttToText } from '../domain/import/parse';
import type { Code, CodebookVersion, LedgerEntry, Participant, Project, Segment, Transcript } from '../types';
import type { LedgerSink } from '../ai/readers';
import { defaultPassMark, defaultSampleShare } from '../firebase/config';

export async function createProject(input: Partial<Project> & { name: string }): Promise<Project> {
  const now = Date.now();
  const p: Project = {
    id: newId(),
    researchQuestion: '',
    method: 'codebook',
    kappaThreshold: defaultPassMark(),
    sampleShare: defaultSampleShare(),
    isSample: false,
    deid: structuredClone(DEFAULT_DEID),
    createdAt: now,
    updatedAt: now,
    ...input,
  };
  await db.projects.add(p);
  return p;
}

export async function touchProject(projectId: string) {
  await db.projects.update(projectId, { updatedAt: Date.now() });
}

export async function deleteProject(projectId: string) {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      if (t.name === 'projects') await t.delete(projectId);
      else if (t.name === 'reports') await t.delete(projectId);
      else await t.where('projectId').equals(projectId).delete();
    }
  });
}

/** Import one transcript: parse speakers, guess the interviewer, create its segments. */
export async function importTranscript(projectId: string, title: string, raw: string, opts: { participantLabel?: string; isVtt?: boolean } = {}) {
  const parsed = parseTranscript(opts.isVtt ? vttToText(raw) : raw);
  if (!parsed.turns.length) throw new Error('No text found in this file.');
  const interviewers = guessInterviewers(parsed);
  const count = await db.participants.where('projectId').equals(projectId).count();
  const participant: Participant = { id: newId(), projectId, label: opts.participantLabel ?? `P${String(count + 1).padStart(2, '0')}`, attributes: {} };
  const transcript: Transcript = {
    id: newId(),
    projectId,
    participantId: participant.id,
    title,
    text: parsed.text,
    speakers: parsed.speakers,
    interviewerSpeakers: interviewers,
    importedAt: Date.now(),
  };
  const segments: Segment[] = segmentTurns(parsed.turns).map((s) => ({
    id: newId(),
    projectId,
    transcriptId: transcript.id,
    index: s.index,
    speaker: s.speaker,
    start: s.start,
    end: s.end,
    text: s.text,
    isInterviewer: interviewers.includes(s.speaker),
  }));
  await db.transaction('rw', db.participants, db.transcripts, db.segments, async () => {
    await db.participants.add(participant);
    await db.transcripts.add(transcript);
    await db.segments.bulkAdd(segments);
  });
  await touchProject(projectId);
  return { transcript, participant, segmentCount: segments.length };
}

export async function setInterviewers(transcriptId: string, speakers: string[]) {
  await db.transaction('rw', db.transcripts, db.segments, async () => {
    await db.transcripts.update(transcriptId, { interviewerSpeakers: speakers });
    const segs = await db.segments.where('transcriptId').equals(transcriptId).toArray();
    await db.segments.bulkPut(segs.map((s) => ({ ...s, isInterviewer: speakers.includes(s.speaker) })));
  });
}

export async function deleteTranscript(transcriptId: string) {
  const t = await db.transcripts.get(transcriptId);
  if (!t) return;
  const segIds = (await db.segments.where('transcriptId').equals(transcriptId).primaryKeys()) as string[];
  await db.transaction('rw', [db.transcripts, db.segments, db.codings, db.accessCopies, db.approvals, db.participants, db.decisions], async () => {
    await db.codings.where('segmentId').anyOf(segIds).delete();
    await db.decisions.where('segmentId').anyOf(segIds).delete();
    await db.accessCopies.where('transcriptId').equals(transcriptId).delete();
    await db.approvals.delete(transcriptId);
    await db.segments.where('transcriptId').equals(transcriptId).delete();
    await db.transcripts.delete(transcriptId);
    await db.participants.delete(t.participantId);
  });
}

export async function currentCodebook(projectId: string): Promise<CodebookVersion | undefined> {
  const all = await db.codebooks.where('projectId').equals(projectId).sortBy('version');
  return all[all.length - 1];
}

/** Saving creates a new version, so every coding can say which definitions it used. */
export async function saveCodebook(projectId: string, codes: Code[], source: CodebookVersion['source'] = 'human'): Promise<CodebookVersion> {
  const cur = await currentCodebook(projectId);
  const v: CodebookVersion = { id: newId(), projectId, version: (cur?.version ?? 0) + 1, codes, source, createdAt: Date.now() };
  await db.codebooks.add(v);
  await touchProject(projectId);
  return v;
}

export function ledgerSink(projectId: string): LedgerSink {
  return (e) => {
    const entry: LedgerEntry = { ...e, id: newId(), projectId, at: Date.now() };
    void db.ledger.add(entry);
  };
}

export function newCode(name: string, color: number, fields: Partial<Code> = {}): Code {
  return { id: newId(), name, definition: '', whenToUse: '', whenNotToUse: '', example: '', color, ...fields };
}

/** Segments that get coded: participant turns only. */
export async function codableSegments(projectId: string): Promise<Segment[]> {
  const all = await db.segments.where('projectId').equals(projectId).toArray();
  const order = new Map((await db.transcripts.where('projectId').equals(projectId).sortBy('importedAt')).map((t, i) => [t.id, i]));
  return all.filter((s) => !s.isInterviewer).sort((a, b) => (order.get(a.transcriptId)! - order.get(b.transcriptId)!) || a.index - b.index);
}
