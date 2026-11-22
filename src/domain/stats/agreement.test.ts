import { describe, expect, it } from 'vitest';
import { agreement, agreementFromTable, kappaBand, seededSample } from './agreement';

describe('agreement', () => {
  it('matches the textbook kappa example (Cohen 1960 style 2x2)', () => {
    // 50 units: both yes 20, A yes/B no 5, A no/B yes 10, both no 15.
    // po = 0.70, pA = 0.5, pB = 0.6, pe = 0.5, kappa = 0.4
    const r = agreementFromTable({ a: 20, b: 5, c: 10, d: 15 });
    expect(r.n).toBe(50);
    expect(r.po).toBeCloseTo(0.7, 10);
    expect(r.kappa).toBeCloseTo(0.4, 10);
    expect(r.pabak).toBeCloseTo(0.4, 10);
  });

  it('computes Gwet AC1 for the same table', () => {
    // pi = 0.55, peAC1 = 2*0.55*0.45 = 0.495, AC1 = (0.7-0.495)/(0.505) = 0.40594...
    const r = agreementFromTable({ a: 20, b: 5, c: 10, d: 15 });
    expect(r.ac1).toBeCloseTo(0.205 / 0.505, 10);
  });

  it('gives kappa 1 for perfect agreement with variance', () => {
    const r = agreement([true, false, true, false], [true, false, true, false]);
    expect(r.kappa).toBe(1);
  });

  it('returns null kappa when a code is never used by either coder', () => {
    const r = agreement([false, false, false], [false, false, false]);
    expect(r.po).toBe(1);
    expect(r.kappa).toBeNull();
    expect(kappaBand(r.kappa)).toBe('undefined');
  });

  it('can be negative when coders systematically disagree', () => {
    const r = agreement([true, false, true, false], [false, true, false, true]);
    expect(r.kappa).toBeCloseTo(-1, 10);
  });

  it('rejects mismatched inputs', () => {
    expect(() => agreement([true], [true, false])).toThrow();
  });

  it('labels Landis & Koch bands', () => {
    expect(kappaBand(0.15)).toBe('slight');
    expect(kappaBand(0.55)).toBe('moderate');
    expect(kappaBand(0.72)).toBe('substantial');
    expect(kappaBand(0.85)).toBe('almost perfect');
  });
});

describe('seededSample', () => {
  it('is reproducible and has no duplicates', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const a = seededSample(items, 15, 42);
    const b = seededSample(items, 15, 42);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(15);
    expect(seededSample(items, 15, 43)).not.toEqual(a);
  });
});
