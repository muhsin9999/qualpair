import Dexie, { type EntityTable } from 'dexie';
import type {
  AccessCopy,
  CodebookVersion,
  Coding,
  Decision,
  LedgerEntry,
  Participant,
  Project,
  ReportSettings,
  Sample,
  Segment,
  Transcript,
  TranscriptApproval,
} from '../types';

/**
 * All project data lives in the browser's IndexedDB. Nothing here is synced anywhere.
 */
export class QualPairDB extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  participants!: EntityTable<Participant, 'id'>;
  transcripts!: EntityTable<Transcript, 'id'>;
  segments!: EntityTable<Segment, 'id'>;
  codebooks!: EntityTable<CodebookVersion, 'id'>;
  codings!: EntityTable<Coding, 'id'>;
  accessCopies!: EntityTable<AccessCopy, 'segmentId'>;
  approvals!: EntityTable<TranscriptApproval, 'transcriptId'>;
  samples!: EntityTable<Sample, 'id'>;
  decisions!: EntityTable<Decision, 'id'>;
  ledger!: EntityTable<LedgerEntry, 'id'>;
  reports!: EntityTable<ReportSettings, 'projectId'>;

  // The database keeps the app's earlier name, so studies saved before the rename stay.
  constructor(name = 'qualcheck') {
    super(name);
    this.version(1).stores({
      projects: 'id, updatedAt',
      participants: 'id, projectId',
      transcripts: 'id, projectId, participantId',
      segments: 'id, projectId, transcriptId, [transcriptId+index]',
      codebooks: 'id, projectId, [projectId+version]',
      codings: 'id, projectId, segmentId, [projectId+coder], [segmentId+coder]',
      accessCopies: 'segmentId, projectId, transcriptId',
      approvals: 'transcriptId, projectId',
      samples: 'id, projectId',
      decisions: 'id, projectId, segmentId, number',
      ledger: 'id, projectId, at',
      reports: 'projectId',
    });
  }
}

export const db = new QualPairDB();

export function newId(): string {
  return crypto.randomUUID();
}
