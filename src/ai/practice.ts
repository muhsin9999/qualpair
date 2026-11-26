import type { ApprovedAccessSegment, Code } from '../types';
import type { CloudReader, CodeResult, DeviceReader, DeviceStatus, LedgerSink } from './readers';

/**
 * Practice readers: simple keyword rules, no AI. Used for automated tests and for
 * trying the flow in a browser without Gemini Nano. The UI always labels them as practice.
 */

const STOP = new Set(['the', 'and', 'for', 'that', 'with', 'they', 'their', 'when', 'from', 'this', 'what', 'about', 'have', 'into', 'does', 'only', 'care', 'participant']);

function keywords(c: Code): string[] {
  const words = `${c.name} ${c.definition} ${c.whenToUse}`.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  return [...new Set(words.filter((w) => !STOP.has(w)))].map((w) => w.slice(0, 6));
}

function match(codes: Code[], text: string, bias: number): CodeResult {
  const t = text.toLowerCase();
  const ids: string[] = [];
  let evidence: string | undefined;
  for (const c of codes) {
    const hits = keywords(c).filter((k) => t.includes(k));
    if (hits.length >= 1 + bias) {
      ids.push(c.id);
      if (!evidence) {
        const i = t.indexOf(hits[0]!);
        evidence = text.slice(Math.max(0, i - 10), Math.min(text.length, i + 30)).trim() || undefined;
      }
    }
  }
  return { codeIds: ids, evidence: evidence && text.includes(evidence) ? evidence : undefined };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

const MONTHS_DAYS = 'January February March April May June July August September October November December Monday Tuesday Wednesday Thursday Friday Saturday Sunday';
/** Capitalised words that are not names: sentence openers, months, days and common abbreviations. */
const NOT_NAMES = new Set(`I I'm I’m The A An And But So In At On For After Before Also Maybe Now Just Like Yes No Yeah Well OK Okay Oh Then This That It My We They He She You Because If When What Why How ${MONTHS_DAYS} UK NHS GP A&E English`.split(' '));
const TITLE = /^(?:Dr|Mr|Mrs|Ms|Miss|Prof|St)\.?$/;

/**
 * Practice name finder (no AI): runs of capitalised words, kept together so "Dr. Hannah Abbott" or
 * "Oakridge Community Clinic" stay one item. A single capitalised word at the start of a sentence is skipped.
 */
export function practiceNames(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:(?:Dr|Mr|Mrs|Ms|Miss|Prof|St)\.? )?[A-Z][a-z’'-]+(?: (?:[A-Z][a-z’'-]+|of|de|van|von))*(?: [A-Z][a-z’'-]+)?/g;
  for (const m of text.matchAll(re)) {
    let words = m[0].split(' ');
    let start = m.index ?? 0;
    while (words.length && NOT_NAMES.has(words[0]!)) {
      start += words[0]!.length + 1;
      words = words.slice(1);
    }
    while (words.length && (NOT_NAMES.has(words[words.length - 1]!) || /^(of|de|van|von)$/.test(words[words.length - 1]!))) words = words.slice(0, -1);
    if (!words.length) continue;
    const titled = TITLE.test(words[0]!);
    if (titled && words.length === 1) continue;
    const atSentenceStart = start === 0 || /[.!?…:"“]\s*$|\n\s*$/.test(text.slice(0, start));
    if (atSentenceStart && words.length < 2 && !titled) continue;
    out.add(words.join(' '));
  }
  return [...out].filter((w) => text.includes(w));
}

export class PracticeDeviceReader implements DeviceReader {
  readonly kind = 'device' as const;
  readonly modelName = 'Practice laptop reader (keyword rules, no AI)';
  readonly isPractice = true;
  async status(): Promise<DeviceStatus> {
    return 'available';
  }
  async warmUp(): Promise<void> {}
  async codeSegment(codes: Code[], _speaker: string, text: string, log: LedgerSink): Promise<CodeResult> {
    await tick();
    log({ task: 'code-segment', where: 'on_device', model: this.modelName, promptVersion: 'practice', segmentCount: 1, bytesSent: 0, ok: true });
    return match(codes, text, 0);
  }
  async suggestDeid(text: string, log: LedgerSink): Promise<string[]> {
    await tick();
    log({ task: 'suggest-deid', where: 'on_device', model: this.modelName, promptVersion: 'practice', segmentCount: 1, bytesSent: 0, ok: true });
    return practiceNames(text);
  }
}

export class PracticeCloudReader implements CloudReader {
  readonly kind = 'cloud' as const;
  readonly modelName = 'Practice cloud reader (keyword rules, no AI)';
  readonly isPractice = true;
  async codeBatch(codes: Code[], segments: ApprovedAccessSegment[], log: LedgerSink) {
    await tick();
    const prompt = segments.map((s) => s.text).join('\n');
    log({ task: 'second-read', where: 'in_cloud', model: this.modelName, promptVersion: 'practice', segmentCount: segments.length, bytesSent: 0, payloadPreview: `(practice — nothing sent)\n${prompt.slice(0, 2000)}`, ok: true });
    return new Map(segments.map((s) => [s.segmentId, match(codes, s.text, 1)]));
  }
  async draftCodebook() {
    await tick();
    return [
      { name: 'Waiting and access', definition: 'Delays or booking rules that stop the participant getting care when they need it.', whenToUse: 'Waiting times, appointment systems or opening hours are a reason for not getting care.', whenNotToUse: 'Cost is the main barrier.', example: 'Hypothetical: “There were no appointments for three weeks.”' },
      { name: 'Self-medication', definition: 'Treating themselves without a clinician.', whenToUse: 'Buying or using medicine without advice.', whenNotToUse: 'Taking medicine a doctor prescribed.', example: 'Hypothetical: “I just took what I brought from home.”' },
    ];
  }
  async suggestDefinition(code: Code) {
    await tick();
    return { definition: code.definition, whenToUse: code.whenToUse, whenNotToUse: code.whenNotToUse, why: 'Practice reader: no suggestion.' };
  }
}
