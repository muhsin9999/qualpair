/**
 * Core contracts for QualCheck. Every module imports its data shapes from here.
 * Changing a type here is a contract change: update the Dexie schema and tests with it.
 */

import type { DeidSettings } from './domain/deid/rules';

export type Id = string;

/** Who produced a coding decision. */
export type Coder = 'human' | 'device' | 'cloud';

/** Where an AI call ran. */
export type InferenceWhere = 'on_device' | 'in_cloud';

export interface Project {
  id: Id;
  name: string;
  researchQuestion: string;
  method: 'codebook' | 'framework' | 'content';
  /** Pass mark for Cohen's kappa, fixed before any reader runs. */
  kappaThreshold: number;
  /** Share of segments in the calibration sample (0–1). */
  sampleShare: number;
  isSample: boolean;
  /** What to hide in access copies (names list, rules). */
  deid: DeidSettings;
  createdAt: number;
  updatedAt: number;
}

export interface Participant {
  id: Id;
  projectId: Id;
  /** Public label used everywhere, e.g. "P03". */
  label: string;
  /** Free-form attributes used to split results in the report (e.g. group). */
  attributes: Record<string, string>;
}

export interface Transcript {
  id: Id;
  projectId: Id;
  participantId: Id;
  title: string;
  /** Original text. Never leaves the device. */
  text: string;
  /** Speaker labels found in the text, in order of first appearance. */
  speakers: string[];
  /** Which speaker labels are the interviewer. Empty until the user chooses. */
  interviewerSpeakers: string[];
  importedAt: number;
}

export interface Segment {
  id: Id;
  projectId: Id;
  transcriptId: Id;
  /** 0-based position within the transcript. Shown to users as paragraph index + 1. */
  index: number;
  speaker: string;
  /** Unicode code-point offsets into Transcript.text (REFI-QDA compatible). */
  start: number;
  end: number;
  text: string;
  isInterviewer: boolean;
}

export interface Code {
  id: Id;
  name: string;
  definition: string;
  whenToUse: string;
  whenNotToUse: string;
  example: string;
  /** Index into the code palette (0–7). */
  color: number;
}

export interface CodebookVersion {
  id: Id;
  projectId: Id;
  version: number;
  codes: Code[];
  source: 'human' | 'cloud-draft';
  createdAt: number;
}

export interface Coding {
  id: Id;
  projectId: Id;
  segmentId: Id;
  codeId: Id;
  coder: Coder;
  applied: boolean;
  /** Exact quote from the segment supporting the code (AI coders only). */
  evidence?: string;
  codebookVersion: number;
  promptVersion?: string;
  createdAt: number;
}

export type RedactionKind = 'name' | 'place' | 'phone' | 'email' | 'date' | 'custom' | 'suggested';

export interface Redaction {
  start: number;
  end: number;
  original: string;
  placeholder: string;
  kind: RedactionKind;
  /** Where the redaction came from. */
  source: 'your-list' | 'rule' | 'laptop-reader';
  /** Suggestions start as pending until the user keeps or hides them. */
  status: 'hidden' | 'kept' | 'pending';
}

export interface AccessCopy {
  segmentId: Id;
  projectId: Id;
  transcriptId: Id;
  redactions: Redaction[];
  redactedText: string;
}

export interface TranscriptApproval {
  transcriptId: Id;
  projectId: Id;
  approvedAt: number;
}

/** Brand that marks text as safe to send to the cloud. Only `approveForCloud` can create it. */
declare const approvedBrand: unique symbol;
export type ApprovedText = string & { readonly [approvedBrand]: true };

export interface ApprovedAccessSegment {
  segmentId: Id;
  participantLabel: string;
  speakerRole: 'interviewer' | 'participant';
  text: ApprovedText;
}

export interface Sample {
  id: Id;
  projectId: Id;
  kind: 'calibration';
  segmentIds: Id[];
  seed: number;
  /** True for the demo sample coded by the QualCheck team. */
  madeByTeam: boolean;
  createdAt: number;
}

export type DecisionOutcome = 'applied' | 'rejected' | 'skipped';

export interface Decision {
  id: Id;
  projectId: Id;
  /** Human-readable running number (#1, #2…). */
  number: number;
  segmentId: Id;
  codeId: Id;
  outcome: DecisionOutcome;
  memo: string;
  decidedAt: number;
}

export type LedgerTask = 'code-segment' | 'suggest-deid' | 'second-read' | 'draft-codebook' | 'suggest-definition' | 'warm-up';

export interface LedgerEntry {
  id: Id;
  projectId: Id;
  at: number;
  task: LedgerTask;
  where: InferenceWhere;
  model: string;
  promptVersion: string;
  segmentCount: number;
  bytesSent: number;
  /** Exact text sent, for cloud calls only. On-device calls never store content. */
  payloadPreview?: string;
  ok: boolean;
  error?: string;
}

export interface ReportSettings {
  projectId: Id;
  template: 'apa' | 'evaluation';
  title: string;
  subtitle: string;
  author: string;
  institution: string;
  hiddenSections: string[];
  sectionOrder: string[];
  highlightCodeId?: Id;
  updatedAt: number;
}
