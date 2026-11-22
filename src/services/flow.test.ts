import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { PracticeCloudReader, PracticeDeviceReader } from '../ai/practice';
import type { CloudReader } from '../ai/readers';
import type { ApprovedAccessSegment, Code } from '../types';
import { createProject, importTranscript, newCode, saveCodebook } from './core';
import { ensureSample, runLaptopReader, saveSegmentCoding } from './coding';
import { approveTranscript, buildAccessCopies, runCloudReader, setRedactionStatus } from './access';
import { agreementByCode, decide, disagreements, finalCodes } from './results';

const TEXT = [
  'I: How did you find seeing a doctor?',
  'P: My friend Bisi told me to wait for an appointment. The waiting was three weeks in Leeds.',
  'I: What did you do?',
  'P: I took medicine I brought from home, antibiotics from my mother.',
  'I: Anything else?',
  'P: The GP receptionist said no appointments, so I waited and the pain got worse.',
  'I: And the language?',
  'P: Sometimes I did not understand the doctor because of the accent.',
].join('\n');

let codes: Code[];

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function setup() {
  const p = await createProject({ name: 'Test', researchQuestion: 'How do students seek care?', sampleShare: 0.5 });
  await db.projects.update(p.id, { deid: { ...p.deid, alwaysHide: [{ term: 'Bisi', placeholder: 'friend 1' }] } });
  const { transcript } = await importTranscript(p.id, 'Interview 1', TEXT);
  codes = [
    newCode('Waiting and access', 0, { definition: 'Waiting for an appointment delays care' }),
    newCode('Self-medication', 1, { definition: 'Taking medicine brought from home' }),
    newCode('Language', 2, { definition: 'Language or accent problems understanding the doctor' }),
  ];
  await saveCodebook(p.id, codes);
  return { projectId: p.id, transcriptId: transcript.id };
}

describe('end-to-end flow with practice readers', () => {
  it('imports, detects the interviewer and keeps participant turns codable', async () => {
    const { transcriptId } = await setup();
    const t = await db.transcripts.get(transcriptId);
    expect(t!.interviewerSpeakers).toEqual(['I']);
    const segs = await db.segments.where('transcriptId').equals(transcriptId).toArray();
    expect(segs.filter((s) => !s.isInterviewer)).toHaveLength(4);
  });

  it('runs both readers, scores agreement and resolves disagreements', async () => {
    const { projectId, transcriptId } = await setup();
    const sample = await ensureSample(projectId, 7);
    expect(sample.segmentIds.length).toBeGreaterThan(0);
    for (const id of sample.segmentIds) await saveSegmentCoding(projectId, id, 'human', [codes[0]!.id]);

    const lap = await runLaptopReader(projectId, new PracticeDeviceReader(), () => {});
    expect(lap.done).toBe(4);

    await buildAccessCopies(transcriptId);
    await approveTranscript(transcriptId);
    const cl = await runCloudReader(projectId, new PracticeCloudReader(), () => {});
    expect(cl.done).toBe(4);

    const ag = await agreementByCode(projectId);
    expect(ag.codes).toHaveLength(3);
    expect(ag.humanDone).toBe(sample.segmentIds.length);

    const dis = await disagreements(projectId);
    for (const d of dis) await decide(projectId, d.segment.id, d.code.id, 'applied');
    const fin = await finalCodes(projectId);
    expect(fin.undecided).toBe(0);
  });

  it('never sends a listed name to the cloud reader', async () => {
    const { projectId, transcriptId } = await setup();
    await buildAccessCopies(transcriptId);
    await approveTranscript(transcriptId);
    const sent: string[] = [];
    const spy: CloudReader = {
      ...new PracticeCloudReader(),
      kind: 'cloud',
      modelName: 'spy',
      isPractice: true,
      async codeBatch(_c: Code[], segs: ApprovedAccessSegment[]) {
        sent.push(...segs.map((s) => s.text));
        return new Map();
      },
      draftCodebook: async () => [],
      suggestDefinition: async () => ({ definition: '', whenToUse: '', whenNotToUse: '', why: '' }),
    };
    await runCloudReader(projectId, spy, () => {});
    expect(sent.length).toBe(4);
    expect(sent.join(' ')).not.toMatch(/Bisi|Leeds/);
    expect(sent.join(' ')).toContain('[friend 1]');
  });

  it('refuses to approve when a listed name is kept visible', async () => {
    const { transcriptId } = await setup();
    const copies = await buildAccessCopies(transcriptId);
    const withName = copies.find((c) => c.redactions.some((r) => r.original === 'Bisi'))!;
    const r = withName.redactions.find((x) => x.original === 'Bisi')!;
    await setRedactionStatus(withName.segmentId, r.start, 'kept');
    await expect(approveTranscript(transcriptId)).rejects.toThrow(/Bisi/);
  });
});
