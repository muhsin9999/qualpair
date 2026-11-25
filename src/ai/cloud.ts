import { getGenerativeModel, InferenceMode } from 'firebase/ai';
import { getFirebaseAI } from '../firebase/init';
import { cloudModel } from '../firebase/config';
import type { ApprovedAccessSegment, Code } from '../types';
import {
  checkEvidence,
  cloudPrompt,
  cloudSchema,
  definitionPrompt,
  definitionSchema,
  draftCodebookPrompt,
  draftCodebookSchema,
  namesToIds,
  parseJson,
  PROMPT_VERSIONS,
} from './prompts';
import type { CloudReader, CodeResult, DefinitionSuggestion, LedgerSink } from './readers';


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Gemini through Firebase AI Logic in ONLY_IN_CLOUD mode.
 * `codeBatch` only accepts ApprovedAccessSegment, whose text type can only come from approveForCloud().
 */
export class FirebaseCloudReader implements CloudReader {
  readonly kind = 'cloud' as const;
  /** Set in Firebase Remote Config (`cloud_model`), with a built-in default. */
  get modelName() {
    return cloudModel();
  }
  readonly isPractice = false;

  private model(model: string, schema: object) {
    return getGenerativeModel(getFirebaseAI(), {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model,
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseJsonSchema: schema as Record<string, unknown> },
      },
    });
  }

  private async call<T>(task: Parameters<LedgerSink>[0]['task'], promptVersion: string, prompt: string, schema: object, segmentCount: number, log: LedgerSink): Promise<T> {
    let lastErr: unknown;
    const model = cloudModel();
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await this.model(model, schema).generateContent(prompt);
        log({ task, where: 'in_cloud', model, promptVersion, segmentCount, bytesSent: new Blob([prompt]).size, payloadPreview: prompt, ok: true });
        return parseJson<T>(res.response.text());
      } catch (e) {
        lastErr = e;
        const msg = String(e);
        if (/429|RESOURCE_EXHAUSTED|503|UNAVAILABLE/i.test(msg) && attempt < 3) {
          await sleep(2000 * 2 ** attempt);
          continue;
        }
        log({ task, where: 'in_cloud', model, promptVersion, segmentCount, bytesSent: new Blob([prompt]).size, payloadPreview: prompt, ok: false, error: msg.slice(0, 300) });
        throw e;
      }
    }
    throw lastErr;
  }

  async codeBatch(codes: Code[], segments: ApprovedAccessSegment[], log: LedgerSink): Promise<Map<string, CodeResult>> {
    const shortIds = segments.map((s, i) => ({ id: `S${i + 1}`, who: s.participantLabel, text: s.text as string }));
    const prompt = cloudPrompt(codes, shortIds);
    const out = await this.call<{ results?: Array<{ id?: string; codes?: unknown; evidence?: unknown }> }>(
      'second-read', PROMPT_VERSIONS.cloudCode, prompt, cloudSchema(codes), segments.length, log,
    );
    const map = new Map<string, CodeResult>();
    for (const r of out.results ?? []) {
      const idx = Number(String(r.id ?? '').replace(/\D/g, '')) - 1;
      const seg = segments[idx];
      if (!seg) continue;
      map.set(seg.segmentId, { codeIds: namesToIds(r.codes, codes), evidence: checkEvidence(r.evidence, seg.text) });
    }
    return map;
  }

  async draftCodebook(question: string, method: string, log: LedgerSink) {
    const out = await this.call<{ codes?: Array<Record<string, unknown>> }>(
      'draft-codebook', PROMPT_VERSIONS.cloudDraft, draftCodebookPrompt(question, method), draftCodebookSchema, 0, log,
    );
    return (out.codes ?? []).map((c) => ({
      name: String(c.name ?? '').trim(),
      definition: String(c.definition ?? ''),
      whenToUse: String(c.whenToUse ?? ''),
      whenNotToUse: String(c.whenNotToUse ?? ''),
      example: String(c.example ?? ''),
    })).filter((c) => c.name);
  }

  async suggestDefinition(code: Code, kl: number | null, kc: number | null, log: LedgerSink): Promise<DefinitionSuggestion> {
    return this.call<DefinitionSuggestion>('suggest-definition', PROMPT_VERSIONS.cloudDefinition, definitionPrompt(code, kl, kc), definitionSchema, 0, log);
  }
}
