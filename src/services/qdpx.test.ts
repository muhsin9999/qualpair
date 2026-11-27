import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { writeFileSync } from 'node:fs';
import { buildQdpx, codeFields, parseQdc, parseQdpx, type QdpxInput } from './qdpx';
import { qdcXml } from './export';
import type { Code } from '../types';

let n = 0;
const guid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const code = (id: string, name: string, color: number): Code => ({ id, name, definition: `${name} means <this> & that`, whenToUse: 'when it fits', whenNotToUse: '', example: '', color });

// Code points, not UTF-16 units: the emoji counts as one character, as REFI-QDA expects.
const text = 'I: How was it?\nP: Waiting was long 😩 at the clinic.\nI: And after?\nP: The GP in Bristol was kind.';
const cp = (s: string) => [...s].length;
const para = (needle: string) => {
  const i = text.indexOf(needle);
  return { start: cp(text.slice(0, i)), end: cp(text.slice(0, i)) + cp(needle) };
};

const input: QdpxInput = {
  name: 'Clinic study "A"',
  createdAt: Date.UTC(2026, 10, 27, 12, 0, 0),
  codes: [code('11111111-1111-4111-8111-111111111111', 'Waiting & access', 0), code('22222222-2222-4222-8222-222222222222', 'Trust', 3)],
  sources: [{
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Interview 01',
    participant: 'P01',
    text,
    paragraphs: [
      { ...para('Waiting was long 😩 at the clinic.'), label: 'Interview 01 · paragraph 1', coded: { human: ['11111111-1111-4111-8111-111111111111'], device: ['11111111-1111-4111-8111-111111111111'], cloud: [], final: ['11111111-1111-4111-8111-111111111111'] }, memos: ['Both agree <yes>'] },
      { ...para('The GP in Bristol was kind.'), label: 'Interview 01 · paragraph 2', coded: { cloud: ['22222222-2222-4222-8222-222222222222'] }, memos: [] },
    ],
  }],
};

describe('REFI-QDA project export (.qdpx)', () => {
  const files = unzipSync(buildQdpx(input, guid));
  const xml = strFromU8(files['project.qde']!);
  if (process.env.QDPX_OUT) writeFileSync(process.env.QDPX_OUT, xml);

  it('contains the project file and each interview as plain text', () => {
    expect(Object.keys(files).sort()).toEqual(['project.qde', 'sources/33333333-3333-4333-8333-333333333333.txt']);
    expect(strFromU8(files['sources/33333333-3333-4333-8333-333333333333.txt']!)).toBe(text);
  });

  it('names one user per coder, so other tools can compare them', () => {
    for (const u of ['Researcher (you)', 'Laptop reader (Gemini Nano)', 'Cloud reader (Gemini)', 'Final coding (after your review)']) expect(xml).toContain(`name="${u}"`);
  });

  it('selections point at the exact paragraph text (code points)', () => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const sels = [...doc.getElementsByTagName('PlainTextSelection')];
    expect(sels).toHaveLength(2);
    const chars = [...text];
    const slice = (el: Element) => chars.slice(Number(el.getAttribute('startPosition')), Number(el.getAttribute('endPosition'))).join('');
    expect(slice(sels[0]!)).toBe('Waiting was long 😩 at the clinic.');
    expect(slice(sels[1]!)).toBe('The GP in Bristol was kind.');
    expect(sels[0]!.getElementsByTagName('Coding')).toHaveLength(3);
    expect(sels[0]!.getElementsByTagName('NoteRef')).toHaveLength(1);
  });

  it('escapes text so the XML stays valid', () => {
    expect(xml).toContain('name="Clinic study &quot;A&quot;"');
    expect(xml).toContain('Both agree &lt;yes&gt;');
    expect(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror')).toHaveLength(0);
  });
});

describe('REFI-QDA import', () => {
  it('reads back interviews and codebook from a .qdpx', () => {
    const p = parseQdpx(buildQdpx(input, guid));
    expect(p.name).toBe('Clinic study "A"');
    expect(p.sources).toEqual([{ name: 'Interview 01', text }]);
    expect(p.codes.map((c) => c.name)).toEqual(['Waiting & access', 'Trust']);
    expect(p.codes[0]!.definition).toContain('means <this> & that');
    expect(p.codings).toBe(4);
  });

  it('reads text kept inside the XML, skips non-text sources, and flattens nested codes', () => {
    const qde = `<?xml version="1.0" encoding="utf-8"?>
<Project xmlns="urn:QDA-XML:project:1.0" name="From NVivo">
  <CodeBook><Codes><Code guid="a" name="Parent" isCodable="true"><Code guid="b" name="Child" isCodable="true"><Description>kid</Description></Code></Code><Code guid="c" name="Folder" isCodable="false"/></Codes></CodeBook>
  <Sources>
    <TextSource guid="s1" name="Nurse 1"><PlainTextContent>P: Night shifts are hard.</PlainTextContent></TextSource>
    <TextSource guid="s2" name="Lost" plainTextPath="relative://elsewhere.txt"/>
    <PDFSource guid="s3" name="Consent form.pdf" path="internal://x.pdf"/>
  </Sources>
</Project>`;
    const bytes = buildZip({ 'project.qde': qde });
    const p = parseQdpx(bytes);
    expect(p.sources).toEqual([{ name: 'Nurse 1', text: 'P: Night shifts are hard.' }]);
    expect(p.skipped).toEqual(['Lost', 'Consent form.pdf']);
    expect(p.codes).toEqual([{ name: 'Parent', definition: '' }, { name: 'Child', definition: 'kid' }]);
  });

  it('rejects files that are not projects', () => {
    expect(() => parseQdpx(new TextEncoder().encode('hello'))).toThrow(/zip/);
    expect(() => parseQdpx(buildZip({ 'readme.txt': 'x' }))).toThrow(/project.qde/);
  });

  it('reads a .qdc codebook, including QualPair’s own export', () => {
    const codes = parseQdc(qdcXml('Study', input.codes));
    expect(codes.map((c) => c.name)).toEqual(['Waiting & access', 'Trust']);
    expect(codes[1]!.definition).toContain('Use when: when it fits');
  });
});

function buildZip(files: Record<string, string>) {
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}

describe('code descriptions', () => {
  it('splits "Use when / Do not use when / Example" lines back into fields', () => {
    expect(codeFields('Waiting for care.\nUse when: delays\nDo not use when: cost only\nExample: "Weeks for a GP"')).toEqual({
      definition: 'Waiting for care.', whenToUse: 'delays', whenNotToUse: 'cost only', example: '"Weeks for a GP"',
    });
    expect(codeFields('Just a definition')).toEqual({ definition: 'Just a definition', whenToUse: '', whenNotToUse: '', example: '' });
  });
});
