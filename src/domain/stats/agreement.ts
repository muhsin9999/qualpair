/**
 * Agreement statistics for two coders making yes/no decisions per unit.
 * Pure functions, no dependencies, unit-tested against worked examples.
 */

export interface AgreementTable {
  /** both yes */
  a: number;
  /** coder 1 yes, coder 2 no */
  b: number;
  /** coder 1 no, coder 2 yes */
  c: number;
  /** both no */
  d: number;
}

export interface AgreementResult {
  n: number;
  /** Observed agreement, 0–1. */
  po: number;
  /** Cohen's kappa, or null when undefined (no variance: chance agreement is 1). */
  kappa: number | null;
  /** Gwet's AC1, robust when a code is rare. */
  ac1: number | null;
  /** Prevalence- and bias-adjusted kappa = 2·po − 1. */
  pabak: number | null;
  table: AgreementTable;
}

export function tabulate(x: readonly boolean[], y: readonly boolean[]): AgreementTable {
  if (x.length !== y.length) throw new Error('Coders must rate the same units');
  const t: AgreementTable = { a: 0, b: 0, c: 0, d: 0 };
  for (let i = 0; i < x.length; i++) {
    if (x[i] && y[i]) t.a++;
    else if (x[i]) t.b++;
    else if (y[i]) t.c++;
    else t.d++;
  }
  return t;
}

export function agreementFromTable(t: AgreementTable): AgreementResult {
  const n = t.a + t.b + t.c + t.d;
  if (n === 0) return { n, po: 0, kappa: null, ac1: null, pabak: null, table: t };
  const po = (t.a + t.d) / n;
  const p1 = (t.a + t.b) / n; // coder 1 "yes" rate
  const p2 = (t.a + t.c) / n; // coder 2 "yes" rate
  const pe = p1 * p2 + (1 - p1) * (1 - p2);
  const kappa = pe >= 1 ? null : (po - pe) / (1 - pe);
  const pi = (p1 + p2) / 2;
  const peAc1 = 2 * pi * (1 - pi);
  const ac1 = peAc1 >= 1 ? null : (po - peAc1) / (1 - peAc1);
  return { n, po, kappa, ac1, pabak: 2 * po - 1, table: t };
}

export function agreement(x: readonly boolean[], y: readonly boolean[]): AgreementResult {
  return agreementFromTable(tabulate(x, y));
}

/** Landis & Koch (1977) bands, the labels most researchers recognise. */
export function kappaBand(k: number | null): string {
  if (k === null) return 'undefined';
  // Band the value as it is shown (two decimals), so "0.40" is never labelled "moderate".
  k = Math.round(k * 100) / 100;
  if (k < 0) return 'poor';
  if (k <= 0.2) return 'slight';
  if (k <= 0.4) return 'fair';
  if (k <= 0.6) return 'moderate';
  if (k <= 0.8) return 'substantial';
  return 'almost perfect';
}

export function formatKappa(k: number | null): string {
  return k === null ? '—' : k.toFixed(2);
}

/** Small seeded PRNG (mulberry32) so samples are reproducible from their seed. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick `count` items without replacement, deterministically from `seed`. */
export function seededSample<T>(items: readonly T[], count: number, seed: number): T[] {
  const rand = seededRandom(seed);
  const pool = items.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
