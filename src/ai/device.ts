import { getGenerativeModel, InferenceMode } from 'firebase/ai';
import { getFirebaseAI } from '../firebase/init';
import type { Code } from '../types';
import { checkEvidence, deidPrompt, deidSchema, devicePrompt, deviceSchema, namesToIds, parseJson, PROMPT_VERSIONS } from './prompts';
import { ReaderUnavailableError, type CodeResult, type DeviceReader, type DeviceStatus, type LedgerSink } from './readers';

const OPTS = {
  expectedInputs: [{ type: 'text' as const, languages: ['en'] }],
  expectedOutputs: [{ type: 'text' as const, languages: ['en'] }],
};

interface LanguageModelStatic {
  availability(o?: object): Promise<string>;
  create(o?: object): Promise<{ prompt(t: string): Promise<string>; destroy(): void }>;
}

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

  async codeSegment(codes: Code[], speakerLabel: string, text: string, log: LedgerSink): Promise<CodeResult> {
    const prompt = devicePrompt(codes, speakerLabel, text);
    try {
      const res = await this.model(deviceSchema(codes)).generateContent(prompt);
      if (res.response.inferenceSource && res.response.inferenceSource !== 'on_device') {
        throw new ReaderUnavailableError('The laptop reader did not run on this device.');
      }
      const out = parseJson<{ codes?: unknown; evidence?: unknown }>(res.response.text());
      log({ task: 'code-segment', where: 'on_device', model: this.modelName, promptVersion: PROMPT_VERSIONS.deviceCode, segmentCount: 1, bytesSent: 0, ok: true });
      return { codeIds: namesToIds(out.codes, codes), evidence: checkEvidence(out.evidence, text) };
    } catch (e) {
      log({ task: 'code-segment', where: 'on_device', model: this.modelName, promptVersion: PROMPT_VERSIONS.deviceCode, segmentCount: 1, bytesSent: 0, ok: false, error: String(e) });
      throw e;
    }
  }

  async suggestDeid(text: string, log: LedgerSink): Promise<string[]> {
    try {
      const res = await this.model(deidSchema).generateContent(deidPrompt(text));
      const out = parseJson<{ items?: unknown }>(res.response.text());
      log({ task: 'suggest-deid', where: 'on_device', model: this.modelName, promptVersion: PROMPT_VERSIONS.deviceDeid, segmentCount: 1, bytesSent: 0, ok: true });
      return Array.isArray(out.items) ? out.items.filter((x): x is string => typeof x === 'string' && text.includes(x)) : [];
    } catch (e) {
      log({ task: 'suggest-deid', where: 'on_device', model: this.modelName, promptVersion: PROMPT_VERSIONS.deviceDeid, segmentCount: 1, bytesSent: 0, ok: false, error: String(e) });
      throw e;
    }
  }
}
