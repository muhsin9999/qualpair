import type { Code } from '../types';
import { checkEvidence, devicePrompt, devicePromptShort, deviceSchema, namesToIds, parseJson, PROMPT_VERSIONS } from './prompts';
import { ReaderUnavailableError, type CodeResult } from './readers';

/** Paragraphs longer than this (characters) don't change the remembered step. */
const LONG = 600;

/**
 * Gemini Nano's input limit differs between Chrome builds and computers. Some accept the whole codebook
 * with each paragraph, others reject it ("The input is too large"). These helpers step down until a
 * prompt fits, and remember the step that worked so later paragraphs start there.
 *
 * Level 0: full definitions and exclusions, one call.
 * Level 1: one-sentence definitions, one call.
 * Level n ≥ 2: one-sentence definitions, codebook split into n groups (n calls, results merged).
 */
export interface FitState {
  level: number;
}

export interface Attempt {
  prompt: string;
  schema: object;
  codes: Code[];
}

export function isTooLarge(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name ?? '';
  return name === 'QuotaExceededError' || /too large|QuotaExceeded|exceeds? the (input|context)/i.test(String(e));
}

/** Split codes into n groups of near-equal size, keeping codebook order. */
export function groups(codes: Code[], n: number): Code[][] {
  const out: Code[][] = [];
  const size = Math.ceil(codes.length / n);
  for (let i = 0; i < codes.length; i += size) out.push(codes.slice(i, i + size));
  return out;
}

export function attemptsFor(level: number, codes: Code[], speaker: string, text: string): { attempts: Attempt[]; version: string } {
  if (level === 0) return { attempts: [{ prompt: devicePrompt(codes, speaker, text), schema: deviceSchema(codes), codes }], version: PROMPT_VERSIONS.deviceCode };
  if (level === 1) return { attempts: [{ prompt: devicePromptShort(codes, speaker, text), schema: deviceSchema(codes), codes }], version: PROMPT_VERSIONS.deviceCodeShort };
  return {
    attempts: groups(codes, level).map((g) => ({ prompt: devicePromptShort(g, speaker, text), schema: deviceSchema(g), codes: g })),
    version: PROMPT_VERSIONS.deviceCodeSplit,
  };
}

/** Code one paragraph, stepping down while the model says the input is too large. */
export async function codeFitting(
  codes: Code[],
  speaker: string,
  text: string,
  state: FitState,
  run: (a: Attempt, version: string) => Promise<string>,
): Promise<CodeResult & { promptVersion: string }> {
  let level = state.level;
  for (;;) {
    const { attempts, version } = attemptsFor(level, codes, speaker, text);
    try {
      const ids = new Set<string>();
      let evidence: string | undefined;
      for (const a of attempts) {
        const out = parseJson<{ codes?: unknown; evidence?: unknown }>(await run(a, version));
        for (const id of namesToIds(out.codes, a.codes)) ids.add(id);
        evidence ??= checkEvidence(out.evidence, text);
      }
      // Remember the step for later paragraphs, unless only this unusually long one needed it.
      if (level > state.level && text.length <= LONG) state.level = level;
      return { codeIds: codes.filter((c) => ids.has(c.id)).map((c) => c.id), evidence, promptVersion: version };
    } catch (e) {
      if (!isTooLarge(e)) throw e;
      level++;
      if (level > Math.max(2, codes.length)) {
        throw new ReaderUnavailableError('This paragraph is too long for the laptop reader in this browser, even with one code at a time.');
      }
    }
  }
}
