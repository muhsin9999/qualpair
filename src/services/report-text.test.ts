import { describe, expect, it } from 'vitest';
import { agreementNote, dataFlowText, limitationsText, methodText, summarySentences, type ReportData } from './report';
import { coreqRows } from '../features/report/coreq';

/** A one-interview study where only the cloud reader ran, and the researcher coded after it. */
function cloudOnly(over: Partial<ReportData['readers']> = {}): ReportData {
  return {
    project: { id: 'p', name: 'Clinic study' },
    settings: {},
    codes: [{ id: 'c1', name: 'Access', definition: 'Getting care.', whenToUse: '', whenNotToUse: '', example: '', color: 0 }],
    participants: [{ id: 'x', label: 'P01', attributes: {}, paragraphs: 12 }],
    themes: [],
    agreement: [{ code: { id: 'c1', name: 'Access' }, cloud: { kappa: 0.5, po: 0.9 }, laptop: undefined, nLaptop: 0, nCloud: 1 }],
    threshold: 0.6,
    sampleSize: 1,
    humanDone: 1,
    totalParagraphs: 12,
    undecided: 0,
    decisions: 0,
    matrix: new Map(),
    ledger: { device: 0, cloud: 1, cloudKB: 1.2, models: ['gemini-3.5-flash-lite'], cloudModels: ['gemini-3.5-flash-lite'] },
    practice: false,
    readers: { laptop: 0, cloud: 12, laptopPractice: false, cloudPractice: false, humanFirst: false, sampleBeforeAI: false, ...over },
  } as unknown as ReportData;
}

describe('report text describes only what happened', () => {
  it('cloud reader only: no claims about a laptop reader or two readers', () => {
    const d = cloudOnly();
    const m = methodText(d);
    expect(m).not.toMatch(/Two AI readers|Gemini Nano/);
    expect(m).toMatch(/No laptop reader was used/);
    expect(m).toMatch(/1 interview were|1 interview\b/);
    expect(m).not.toMatch(/first coded/);
    expect(m).toMatch(/before agreement was computed/);
    expect(summarySentences(d).join(' ')).toMatch(/researcher and the cloud reader was moderate \(median κ = 0\.50 for the cloud reader, across 1 code\)/);
    expect(coreqRows(d)[0]!.answer).toBe('Two: the researcher, a cloud AI reader (see Method).');
    expect(agreementNote(d)).toMatch(/the laptop reader has not coded the sample/);
    expect(dataFlowText(d)).toMatch(/\(1 call, 1\.2 KB in total\)/);
    expect(dataFlowText(d)).not.toMatch(/on-device AI call/);
  });

  it('practice warnings come from the coding, not from other practice calls', () => {
    expect(limitationsText(cloudOnly())).not.toMatch(/Practice readers/);
    const d = { ...cloudOnly({ cloudPractice: true }), practice: true };
    expect(limitationsText(d)).toMatch(/Practice readers \(keyword rules, no AI\) did the cloud coding/);
    expect(methodText(d)).toMatch(/practice reader using keyword rules/);
  });

  it('says "first coded" and "before any AI coding" only when that is true', () => {
    const m = methodText(cloudOnly({ humanFirst: true, sampleBeforeAI: true }));
    expect(m).toMatch(/first coded/);
    expect(m).toMatch(/before any AI coding/);
  });
});
