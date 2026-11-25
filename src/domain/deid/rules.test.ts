import { describe, expect, it } from 'vitest';
import { DEFAULT_DEID, NotApprovedError, applyRedactions, approveForCloud, findRedactions, mergeSuggestions } from './rules';

const settings = { ...DEFAULT_DEID, alwaysHide: [{ term: 'Bisi', placeholder: 'friend 1' }, { term: 'Dr Okafor', placeholder: 'doctor 1' }] };

describe('findRedactions', () => {
  it('hides names from your list, places, phones and emails', () => {
    const text = "My friend Bisi said try the walk-in centre in Leeds. Call 07700 900123 or mail a.b@uni.ac.uk. Dr Okafor's advice helped.";
    const r = findRedactions(text, settings);
    expect(r.map((x) => x.placeholder)).toEqual(['friend 1', 'city', 'phone number', 'email', 'doctor 1']);
    expect(applyRedactions(text, r)).toBe(
      'My friend [friend 1] said try the walk-in centre in [city]. Call [phone number] or mail [email]. [doctor 1] advice helped.',
    );
  });

  it('matches whole words only and is case-insensitive', () => {
    const r = findRedactions('bisi and Bisiola went to york and Yorkshire.', settings);
    expect(r.map((x) => x.original)).toEqual(['bisi', 'york', 'Yorkshire']);
  });

  it('respects the never-hide list', () => {
    const r = findRedactions('I studied in Leeds.', { ...settings, neverHide: ['Leeds'] });
    expect(r).toHaveLength(0);
  });

  it('finds dates', () => {
    const r = findRedactions('It was on 12/03/2024 and again on 3rd March 2025.', settings);
    expect(r.filter((x) => x.kind === 'date')).toHaveLength(2);
  });

  it('finds short local phone numbers and spoken dates', () => {
    const text = 'Ring 555-0148 before the 8th of November, or on March 14, 2025. We met in 2019-2020 for 15 minutes.';
    const r = findRedactions(text, settings);
    expect(r.filter((x) => x.kind === 'phone').map((x) => x.original)).toContain('555-0148');
    expect(r.filter((x) => x.kind === 'date').map((x) => x.original)).toEqual(['8th of November', 'March 14, 2025']);
    expect(r.some((x) => x.original === '15')).toBe(false);
  });
});

describe('mergeSuggestions and approval', () => {
  it('adds laptop suggestions as pending and blocks approval until decided', () => {
    const text = 'I registered at St James’s with Bisi.';
    const base = findRedactions(text, settings);
    const merged = mergeSuggestions(text, base, ['St James’s', 'Bisi']);
    expect(merged.filter((r) => r.status === 'pending').map((r) => r.original)).toEqual(['St James’s']);
    const copy = applyRedactions(text, merged);
    expect(() => approveForCloud(copy, merged, settings.alwaysHide)).toThrow(NotApprovedError);
    const decided = merged.map((r) => (r.status === 'pending' ? { ...r, status: 'hidden' as const } : r));
    expect(approveForCloud(applyRedactions(text, decided), decided, settings.alwaysHide)).toBe('I registered at [name or place] with [friend 1].');
  });

  it('never approves text that still contains an always-hide name', () => {
    const text = 'Bisi helped me.';
    const kept = findRedactions(text, settings).map((r) => ({ ...r, status: 'kept' as const }));
    expect(() => approveForCloud(applyRedactions(text, kept), kept, settings.alwaysHide)).toThrow(/Bisi/);
  });
});
