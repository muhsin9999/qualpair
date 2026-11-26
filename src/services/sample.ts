import { db } from '../db/db';
import { createProject, importTranscript, newCode, saveCodebook } from './core';

export const SAMPLE_SOURCE =
  'Zhang, J. (2026). Interview data: Attitudes towards and experiences of healthcare seeking, self-management of common infections, and antibiotic use among Chinese and Indian international students in the UK [Data set]. Zenodo. https://doi.org/10.5281/zenodo.23371232 (CC BY 4.0)';

const SAMPLE_CODES: Array<[string, string, string, string, string]> = [
  ['Severity gap', 'The participant and UK clinicians judge how serious an illness is differently.', 'They feel a doctor, nurse or 111 dismissed a problem they saw as serious, or the reverse.', 'They only describe their own symptoms without any comparison with professional judgement.', 'Hypothetical: “They said it was nothing, but I could not sleep for a week.”'],
  ['Waiting & access', 'Delays, booking rules or opening hours that stop the participant getting care when they need it.', 'Waiting times, appointment systems, registration delays or opening hours are a reason they did not get care.', 'The participant chooses to wait on their own (use Enduring it).', 'Hypothetical: “There were no appointments for three weeks.”'],
  ['Self-medication', 'Treating themselves without a clinician, with shop-bought medicine or medicine brought from home.', 'Buying, bringing or using medicine without a prescription or advice.', 'Taking medicine a UK clinician prescribed.', 'Hypothetical: “I just took the tablets my mum packed for me.”'],
  ['Enduring it', 'Choosing to wait, rest or put up with symptoms instead of seeking care.', 'They describe deciding to tolerate an illness or wait for it to pass.', 'They wanted care but could not get it (use Waiting & access).', 'Hypothetical: “I thought it would go away if I rested.”'],
  ['Comparing home system', 'Comparing UK healthcare with healthcare in their home country.', 'They contrast how care, doctors, pharmacies or costs work at home and in the UK.', 'They mention home only as where they come from, with no comparison.', 'Hypothetical: “At home you just walk into a hospital.”'],
  ['Language & communication', 'Difficulty understanding or being understood by health staff.', 'Language, accent, medical terms or communication style get in the way of care.', 'General confusion about the system (use Navigating the system).', 'Hypothetical: “I did not know the English word for my symptom.”'],
  ['Navigating the system', 'Knowing, or not knowing, how the UK health system works and where to go.', 'Registering with a GP, using 111, A&E, walk-in centres, pharmacies, or where they got information.', 'The barrier is waiting time once they know where to go (use Waiting & access).', 'Hypothetical: “Nobody told me I had to register with a GP.”'],
  ['Antibiotic beliefs', 'Knowledge, beliefs or use of antibiotics.', 'They talk about when antibiotics are needed, getting them, resistance, or bringing them from home.', 'Other medicines that are not antibiotics (use Self-medication).', 'Hypothetical: “Back home I would take antibiotics for any cold.”'],
];

/** Create the sample study from six real, public, CC BY 4.0 interviews. */
export async function loadSampleProject(): Promise<string> {
  const res = await fetch('/sample/interviews.json');
  if (!res.ok) throw new Error('Could not load the sample interviews.');
  const items = (await res.json()) as Array<{ title: string; text: string }>;
  const p = await createProject({
    name: 'UK healthcare study (sample)',
    researchQuestion: 'How do international students in the UK decide when and where to seek healthcare?',
    isSample: true,
  });
  for (const [i, it] of items.entries()) {
    await importTranscript(p.id, `Interview ${String(i + 1).padStart(2, '0')}`, it.text, { participantLabel: `P${String(i + 1).padStart(2, '0')}` });
  }
  await saveCodebook(
    p.id,
    SAMPLE_CODES.map(([name, definition, whenToUse, whenNotToUse, example], i) => newCode(name, i, { definition, whenToUse, whenNotToUse, example })),
  );
  return p.id;
}

/** The finished example: the same six interviews, already coded by the QualPair team and both real readers. */
export const FINISHED_ID = '3814b55b-ecac-4630-b455-26fb1cdcc590';

/**
 * Load the finished example study (a real run from 22 Nov 2026: sample coded by the QualPair team,
 * laptop reader = Gemini Nano in Chrome, cloud reader = gemini-3.5-flash-lite). Opens it again if already loaded.
 */
export async function loadFinishedStudy(): Promise<string> {
  if (await db.projects.get(FINISHED_ID)) return FINISHED_ID;
  const res = await fetch('/sample/finished.json');
  if (!res.ok) throw new Error('Could not load the finished example.');
  const file = (await res.json()) as { data: Record<string, unknown[]> };
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      const rows = file.data[t.name];
      if (rows?.length) await t.bulkPut(rows as never[]);
    }
    await db.projects.update(FINISHED_ID, { updatedAt: Date.now() });
  });
  return FINISHED_ID;
}
