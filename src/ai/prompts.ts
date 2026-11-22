import type { Code } from '../types';

/**
 * Versioned prompts. Every coding row stores the prompt version that produced it,
 * so results can be traced and compared across prompt changes.
 */
export const PROMPT_VERSIONS = {
  deviceCode: 'device-code-s1@1',
  deviceDeid: 'device-deid@1',
  cloudCode: 'cloud-code-batch@1',
  cloudDraft: 'cloud-draft-codebook@1',
  cloudDefinition: 'cloud-definition@1',
} as const;

function codeLine(c: Code): string {
  const parts = [`- ${c.name}: ${c.definition.trim()}`];
  if (c.whenNotToUse.trim()) parts.push(`(not when: ${c.whenNotToUse.trim()})`);
  return parts.join(' ');
}

/** Strategy S1: one call per segment, multi-label, compact codebook. */
export function devicePrompt(codes: Code[], speakerLabel: string, text: string): string {
  return [
    'You are applying a qualitative codebook to one interview segment.',
    'Apply a code only if the segment clearly matches its definition. Apply none if nothing matches.',
    'Codebook:',
    ...codes.map(codeLine),
    '',
    `Segment (${speakerLabel}):`,
    `"""${text}"""`,
    'Return JSON: {"codes": [code names], "evidence": "exact words copied from the segment"}.',
  ].join('\n');
}

export function deviceSchema(codes: Code[]): object {
  return {
    type: 'object',
    properties: {
      codes: { type: 'array', items: { type: 'string', enum: codes.map((c) => c.name) } },
      evidence: { type: 'string' },
    },
    required: ['codes'],
  };
}

export function deidPrompt(text: string): string {
  return [
    'Find words in this interview segment that could identify a real person or place:',
    'people’s names, nicknames, specific hospitals, schools, workplaces, streets, towns or organisations.',
    'Do not include general words like "doctor", "university" or "the UK".',
    `Segment: """${text}"""`,
    'Return JSON: {"items": [exact words copied from the segment]}. Return an empty list if there are none.',
  ].join('\n');
}

export const deidSchema = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'string' } } },
  required: ['items'],
};

/** The cloud reader gets the full codebook and a batch of approved access-copy segments. */
export function cloudPrompt(codes: Code[], segments: Array<{ id: string; who: string; text: string }>): string {
  const book = codes
    .map((c) =>
      [
        `### ${c.name}`,
        `Definition: ${c.definition}`,
        c.whenToUse && `Use when: ${c.whenToUse}`,
        c.whenNotToUse && `Do not use when: ${c.whenNotToUse}`,
        c.example && `Example: ${c.example}`,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
  const segs = segments.map((s) => `[${s.id}] (${s.who}) ${s.text}`).join('\n');
  return [
    'You are an independent second coder for a qualitative interview study.',
    'Apply the codebook below to each segment. A segment can have several codes or none.',
    'Apply a code only when the segment clearly fits its definition. Words in square brackets are hidden names or places.',
    '',
    '## Codebook',
    book,
    '',
    '## Segments',
    segs,
    '',
    'Return JSON: {"results": [{"id": segment id, "codes": [code names], "evidence": exact words from the segment}]}, one entry per segment.',
  ].join('\n');
}

export function cloudSchema(codes: Code[]): object {
  return {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            codes: { type: 'array', items: { type: 'string', enum: codes.map((c) => c.name) } },
            evidence: { type: 'string' },
          },
          required: ['id', 'codes'],
        },
      },
    },
    required: ['results'],
  };
}

export function draftCodebookPrompt(question: string, method: string): string {
  return [
    'You help a researcher start a qualitative codebook.',
    `Research question: ${question}`,
    `Approach: ${method}`,
    'Propose 8 to 12 codes. For each: a short name (2–4 words), a one-sentence definition, when to use it, when not to use it,',
    'and a short hypothetical example sentence. Do not invent quotes from real participants; examples must be clearly hypothetical.',
    'Return JSON: {"codes": [{"name","definition","whenToUse","whenNotToUse","example"}]}.',
  ].join('\n');
}

export const draftCodebookSchema = {
  type: 'object',
  properties: {
    codes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          definition: { type: 'string' },
          whenToUse: { type: 'string' },
          whenNotToUse: { type: 'string' },
          example: { type: 'string' },
        },
        required: ['name', 'definition', 'whenToUse', 'whenNotToUse', 'example'],
      },
    },
  },
  required: ['codes'],
};

export function definitionPrompt(code: Code, kappaLaptop: number | null, kappaCloud: number | null): string {
  return [
    'A qualitative code is being applied inconsistently by two AI coders compared with the researcher.',
    `Code: ${code.name}`,
    `Definition: ${code.definition}`,
    `Use when: ${code.whenToUse}`,
    `Do not use when: ${code.whenNotToUse}`,
    `Agreement with the researcher: laptop κ=${kappaLaptop ?? 'n/a'}, cloud κ=${kappaCloud ?? 'n/a'}.`,
    'Suggest a clearer definition, use-when and not-when that would reduce ambiguity. Keep the meaning the same.',
    'Return JSON: {"definition","whenToUse","whenNotToUse","why"}.',
  ].join('\n');
}

export const definitionSchema = {
  type: 'object',
  properties: {
    definition: { type: 'string' },
    whenToUse: { type: 'string' },
    whenNotToUse: { type: 'string' },
    why: { type: 'string' },
  },
  required: ['definition', 'whenToUse', 'whenNotToUse', 'why'],
};

/** Map code names returned by a model back to code ids, ignoring anything unknown. */
export function namesToIds(names: unknown, codes: Code[]): string[] {
  if (!Array.isArray(names)) return [];
  const byName = new Map(codes.map((c) => [c.name.toLowerCase(), c.id]));
  const out = new Set<string>();
  for (const n of names) {
    const id = typeof n === 'string' ? byName.get(n.trim().toLowerCase()) : undefined;
    if (id) out.add(id);
  }
  return [...out];
}

/** Keep evidence only when it is an exact substring of the segment (stops invented quotes). */
export function checkEvidence(evidence: unknown, text: string): string | undefined {
  if (typeof evidence !== 'string') return undefined;
  const e = evidence.trim().replace(/^["“]|["”]$/g, '');
  return e && text.includes(e) ? e : undefined;
}

/** Parse model JSON output, tolerating code fences. */
export function parseJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(cleaned) as T;
}
