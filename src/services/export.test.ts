import { describe, expect, it } from 'vitest';
import { qdcXml, toCsv } from './export';
import { newCode } from './core';

describe('exports', () => {
  it('writes a REFI-QDA codebook with escaped text', () => {
    const xml = qdcXml('Study <1>', [newCode('Waiting & access', 1, { definition: 'Delays "booking"' })]);
    expect(xml).toContain('<CodeBook xmlns="urn:QDA-XML:codebook:1.0"');
    expect(xml).toContain('name="Waiting &amp; access"');
    expect(xml).toContain('Delays &quot;booking&quot;');
    expect(xml).toContain('color="#C98A1E"');
  });
  it('quotes CSV cells that need it', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', 'line\nbreak']])).toBe('a,"b,c","say ""hi""","line\nbreak"\n');
  });
});
