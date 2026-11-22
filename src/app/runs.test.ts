import { describe, expect, it } from 'vitest';
import { eta, formatElapsed, isWarmingUp } from './runs';

const run = (over: object) =>
  ({ pid: 'p', kind: 'laptop', progress: { done: 10, total: 110, errors: 0 }, startedAt: 0, base: 0, controller: new AbortController(), ...over }) as Parameters<typeof eta>[0];

describe('run time estimate', () => {
  it('stays empty until two paragraphs after the first are timed', () => {
    expect(eta(run({ durations: [] }))).toBe('');
    expect(eta(run({ durations: [5000] }))).toBe('');
  });
  it('uses recent paragraph times, not the slow first one', () => {
    // 100 paragraphs left at a median of 5 s each = about 8 min.
    expect(eta(run({ durations: [4000, 5000, 6000] }))).toBe('about 8 min left');
  });
  it('switches to hours for long runs', () => {
    expect(eta(run({ progress: { done: 0, total: 2000, errors: 0 }, durations: [5000, 5000] }))).toBe('about 3 hours left');
  });
  it('knows when the model is still loading', () => {
    expect(isWarmingUp(run({ base: 10 }))).toBe(true);
    expect(isWarmingUp(run({ base: 9 }))).toBe(false);
  });
  it('formats elapsed time', () => {
    expect(formatElapsed(83_400)).toBe('1:23');
  });
});
