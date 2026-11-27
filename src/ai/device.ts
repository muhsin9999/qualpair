import { getGenerativeModel, InferenceMode } from 'firebase/ai';
import { getFirebaseAI } from '../firebase/init';
import type { Code } from '../types';
import { deidPrompt, deidSchema, parseJson, PROMPT_VERSIONS } from './prompts';
import { codeFitting, isTooLarge, type FitState } from './fit';
import { retryOnTimeout, withTimeout } from './timeout';
import { ReaderUnavailableError, type CodeResult, type DeviceReader, type DeviceStatus, type LedgerSink } from './readers';

const OPTS = {
  expectedInputs: [{ type: 'text' as const, languages: ['en'] }],
  expectedOutputs: [{ type: 'text' as const, languages: ['en'] }],
};

interface LanguageModelStatic {
  availability(o?: object): Promise<string>;
  create(o?: object): Promise<{ prompt(t: string): Promise<string>; destroy(): void }>;
}

/** How long one Gemini Nano call may take before we give up and ask again. A paragraph usually takes 5–30 s. */
export const NANO_TIMEOUT_MS = 120_000;
const STALLED = 'Gemini Nano gave no answer within 2 minutes.';

function chromeLM(): LanguageModelStatic | undefined {
  return (globalThis as unknown as { LanguageModel?: LanguageModelStatic }).LanguageModel;
}

/**
 * Gemini Nano through Firebase AI Logic in ONLY_ON_DEVICE mode.
 * There is no cloud fallback by design: if the model is missing, calls throw.
 */
export class FirebaseDeviceReader implements DeviceReader {
  readonly kind = 'device' as const;
  readonly modelName = 'Gemini Nano (Chrome, on device)';
  readonly isPractice = false;

  async status(): Promise<DeviceStatus> {
    const lm = chromeLM();
    if (!lm) return 'unsupported';
    try {
      const a = await lm.availability(OPTS);
      if (a === 'available' || a === 'downloadable' || a === 'downloading' || a === 'unavailable') return a;
      return 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  async warmUp(onProgress?: (fraction: number) => void): Promise<void> {
    const lm = chromeLM();
    if (!lm) throw new ReaderUnavailableError('This browser has no on-device model. Use desktop Chrome.');
    const session = await lm.create({
      ...OPTS,
      monitor(m: EventTarget) {
        m.addEventListener('downloadprogress', (e) => onProgress?.((e as unknown as { loaded: number }).loaded));
      },
    });
    await session.prompt('Reply with OK.');
    session.destroy();
  }

  private model(responseConstraint: object) {
    return getGenerativeModel(getFirebaseAI(), {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: { createOptions: OPTS, promptOptions: { responseConstraint } },
    });
  }

  /** How far the prompt had to be shortened to fit this browser's model (shared by all paragraphs in this tab). */
  private static fit: FitState = { level: 0 };

  async codeSegment(codes: Code[], speakerLabel: string, text: string, log: LedgerSink): Promise<CodeResult> {
    return codeFitting(codes, speakerLabel, text, FirebaseDeviceReader.fit, async (a, version) => {
      try {
        const res = await retryOnTimeout(
          () => withTimeout(this.model(a.schema).generateContent(a.prompt), NANO_TIMEOUT_MS, STALLED),
          () => log({ task: 'code-segment', where: 'on_device', model: this.modelName, promptVersion: version, segmentCount: 1, bytesSent: 0, ok: false, error: `${STALLED} Asked again.` }),
        );
        if (res.response.inferenceSource && res.response.inferenceSource !== 'on_device') {
          throw new ReaderUnavailableError('The laptop reader did not run on this device.');
        }
        const out = res.response.text();
        log({ task: 'code-segment', where: 'on_device', model: this.modelName, promptVersion: version, segmentCount: 1, bytesSent: 0, ok: true });
        return out;
      } catch (e) {
        const error = isTooLarge(e) ? 'Input too large for this browser’s model; retried with a shorter prompt.' : String(e);
        log({ task: 'code-segment', where: 'on_device', model: this.modelName, promptVersion: version, segmentCount: 1, bytesSent: 0, ok: false, error });
        throw e;
      }
    });
  }

  /** Halve a paragraph at a sentence boundary (or the middle) so each half fits the model. */
  private static halves(text: string): [string, string] {
    const mid = text.length / 2;
    const cuts = [...text.matchAll(/[.!?]\s+/g)].map((m) => (m.index ?? 0) + m[0].length);
    const cut = cuts.length ? cuts.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a)) : Math.floor(mid);
    return [text.slice(0, cut), text.slice(cut)];
  }

  async suggestDeid(text: string, log: LedgerSink, depth = 0): Promise<string[]> {
    try {
      const res = await retryOnTimeout(
        () => withTimeout(this.model(deidSchema).generateContent(deidPrompt(text)), NANO_TIMEOUT_MS, STALLED),
        () => log({ task: 'suggest-deid', where: 'on_device', model: this.modelName, promptVersion: PROMPT_VERSIONS.deviceDeid, segmentCount: 1, bytesSent: 0, ok: false, error: `${STALLED} Asked again.` }),
      );
      const out = parseJson<{ items?: unknown }>(res.response.text());
      log({ task: 'suggest-deid', where: 'on_device', model: this.modelName, promptVersion: PROMPT_VERSIONS.deviceDeid, segmentCount: 1, bytesSent: 0, ok: true });
      return Array.isArray(out.items) ? out.items.filter((x): x is string => typeof x === 'string' && text.includes(x)) : [];
    } catch (e) {
      const tooLarge = isTooLarge(e) && depth < 3 && text.length > 80;
      log({ task: 'suggest-deid', where: 'on_device', model: this.modelName, promptVersion: PROMPT_VERSIONS.deviceDeid, segmentCount: 1, bytesSent: 0, ok: false, error: tooLarge ? 'Input too large for this browser’s model; checked in two halves.' : String(e) });
      if (!tooLarge) throw e;
      const [a, b] = FirebaseDeviceReader.halves(text);
      return [...new Set([...(await this.suggestDeid(a, log, depth + 1)), ...(await this.suggestDeid(b, log, depth + 1))])];
    }
  }
}
