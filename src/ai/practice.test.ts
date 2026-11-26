import { describe, expect, it } from 'vitest';
import { practiceNames } from './practice';

describe('practice name finder (no AI)', () => {
  it('keeps titles and multi-word names together and skips months and sentence openers', () => {
    const text = 'Samira Okafor told me to see Dr. Hannah Abbott at Oakridge Community Clinic on Elm Street. In February I moved to Bridgeton. So I went back to Oakridge.';
    const found = practiceNames(text);
    expect(found).toEqual(expect.arrayContaining(['Samira Okafor', 'Dr. Hannah Abbott', 'Oakridge Community Clinic', 'Elm Street', 'Bridgeton', 'Oakridge']));
    expect(found).not.toContain('February');
    expect(found).not.toContain('In');
    expect(found).not.toContain('So');
  });
});
