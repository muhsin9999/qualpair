import type { ApprovedAccessSegment, Code, LedgerEntry } from '../types';

export type DeviceStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported';

export interface CodeResult {
  codeIds: string[];
  evidence?: string;
  /** Prompt version that produced this result, when the reader can vary it. */
  promptVersion?: string;
}

export type LedgerSink = (entry: Omit<LedgerEntry, 'id' | 'projectId' | 'at'>) => void;

/** The laptop reader: Gemini Nano in Chrome, device-only. Receives original text. */
export interface DeviceReader {
  readonly kind: 'device';
  readonly modelName: string;
  /** True when this is the practice reader (keyword rules, no AI). */
  readonly isPractice: boolean;
  status(): Promise<DeviceStatus>;
  /** Download (needs a user gesture) or load the model into memory. */
  warmUp(onProgress?: (fraction: number) => void): Promise<void>;
  codeSegment(codes: Code[], speakerLabel: string, text: string, log: LedgerSink): Promise<CodeResult>;
  suggestDeid(text: string, log: LedgerSink): Promise<string[]>;
}

export interface DefinitionSuggestion {
  definition: string;
  whenToUse: string;
  whenNotToUse: string;
  why: string;
}

/** The cloud reader: Gemini through Firebase AI Logic, cloud-only. Accepts approved access copies only. */
export interface CloudReader {
  readonly kind: 'cloud';
  readonly modelName: string;
  readonly isPractice: boolean;
  codeBatch(codes: Code[], segments: ApprovedAccessSegment[], log: LedgerSink): Promise<Map<string, CodeResult>>;
  draftCodebook(question: string, method: string, log: LedgerSink): Promise<Array<Omit<Code, 'id' | 'color'>>>;
  suggestDefinition(code: Code, kappaLaptop: number | null, kappaCloud: number | null, log: LedgerSink): Promise<DefinitionSuggestion>;
}

export class ReaderUnavailableError extends Error {}
