import { describe, expect, it } from 'vitest';
import { codeFitting, groups, isTooLarge, type FitState } from './fit';
import { PROMPT_VERSIONS } from './prompts';
import { cloudErrorMessage } from './cloud';
import type { Code } from '../types';

const code = (i: number): Code => ({
  id: `c${i}`, name: `Code ${i}`, color: i % 8, example: '',
  definition: `Talk about topic ${i} in some detail. ${'More detail. '.repeat(20)}`,
  whenToUse: '', whenNotToUse: `Not when only topic ${i + 1} is meant. ${'Extra. '.repeat(10)}`,
});
const codes = Array.from({ length: 8 }, (_, i) => code(i));
const text = 'I went to the pharmacy and asked about topic 3, and they told me about topic 6.';

/** A fake Gemini Nano that rejects prompts over `limit` characters and applies every code named in the prompt whose topic number appears in the text. */
function fakeNano(limit: number, calls: string[]) {
  return async (a: { prompt: string; codes: Code[] }, version: string) => {
    calls.push(version);
    if (a.prompt.length > limit) throw Object.assign(new Error('The input is too large.'), { name: 'QuotaExceededError' });
    const hit = a.codes.filter((c) => text.includes(`topic ${c.id.slice(1)}`)).map((c) => c.name);
    return JSON.stringify({ codes: hit, evidence: 'asked about topic 3' });
  };
}

describe('fitting the laptop reader prompt to the model limit', () => {
  it('recognises the Chrome error', () => {
    expect(isTooLarge(new DOMException('The input is too large.', 'QuotaExceededError'))).toBe(true);
    expect(isTooLarge(new Error('network down'))).toBe(false);
  });

  it('splits codes into ordered groups', () => {
    expect(groups(codes, 3).map((g) => g.length)).toEqual([3, 3, 2]);
    expect(groups(codes, 3).flat()).toEqual(codes);
  });

  it('uses the full prompt when it fits', async () => {
    const calls: string[] = [];
    const st: FitState = { level: 0 };
    const r = await codeFitting(codes, 'P01', text, st, fakeNano(100_000, calls));
    expect(r.codeIds).toEqual(['c3', 'c6']);
    expect(r.promptVersion).toBe(PROMPT_VERSIONS.deviceCode);
    expect(calls).toHaveLength(1);
  });

  it('steps down to short definitions, then to split codebooks, and remembers the step', async () => {
    const calls: string[] = [];
    const st: FitState = { level: 0 };
    const r = await codeFitting(codes, 'P01', text, st, fakeNano(600, calls));
    expect(r.codeIds).toEqual(['c3', 'c6']);
    expect(r.evidence).toBe('asked about topic 3');
    expect(r.promptVersion).toBe(PROMPT_VERSIONS.deviceCodeSplit);
    expect(st.level).toBeGreaterThanOrEqual(2);
    // The next paragraph starts at the remembered step: no failed calls.
    const before = calls.length;
    await codeFitting(codes, 'P01', text, st, fakeNano(600, calls));
    expect(calls.length - before).toBe(st.level);
  });

  it('gives a clear error when nothing fits', async () => {
    await expect(codeFitting(codes, 'P01', text, { level: 0 }, fakeNano(10, []))).rejects.toThrow(/too long for the laptop reader/);
  });

  it('passes other errors straight through', async () => {
    const boom = async () => { throw new Error('model crashed'); };
    await expect(codeFitting(codes, 'P01', text, { level: 0 }, boom)).rejects.toThrow('model crashed');
  });
});

describe('cloud reader errors in plain language', () => {
  it('explains App Check failures without a raw URL', () => {
    const m = cloudErrorMessage(new Error('FirebaseError: AI: HTTP 401 https://firebasevertexai.googleapis.com/v1beta/... Firebase App Check token is invalid.'));
    expect(m).toMatch(/App Check/);
    expect(m).not.toMatch(/https?:/);
  });
  it('explains rate limits', () => {
    expect(cloudErrorMessage(new Error('429 RESOURCE_EXHAUSTED'))).toMatch(/busy/);
  });
  it('drops URLs from unknown errors', () => {
    expect(cloudErrorMessage(new Error('weird failure at https://example.com/x'))).not.toMatch(/https?:/);
  });
});
