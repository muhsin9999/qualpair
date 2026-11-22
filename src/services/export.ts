import type { Code } from '../types';

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, text: string, type = 'text/plain') {
  downloadBlob(filename, new Blob([text], { type: `${type};charset=utf-8` }));
}

function xmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const HEX = ['#C0553F', '#C98A1E', '#4E8F6A', '#8A5A9E', '#3E8A97', '#B5577B', '#7D8A3A', '#8C6A4A'];

/** REFI-QDA codebook (.qdc), importable into NVivo, ATLAS.ti, MAXQDA and QualCoder. */
export function qdcXml(projectName: string, codes: Code[]): string {
  const body = codes
    .map((c) => {
      const desc = [c.definition, c.whenToUse && `Use when: ${c.whenToUse}`, c.whenNotToUse && `Do not use when: ${c.whenNotToUse}`, c.example && `Example: ${c.example}`]
        .filter(Boolean)
        .join('\n');
      return `    <Code guid="${c.id}" name="${xmlEscape(c.name)}" isCodable="true" color="${HEX[c.color % 8]}">\n      <Description>${xmlEscape(desc)}</Description>\n    </Code>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<CodeBook xmlns="urn:QDA-XML:codebook:1.0" origin="QualCheck">\n  <!-- ${xmlEscape(projectName)} -->\n  <Codes>\n${body}\n  </Codes>\n</CodeBook>\n`;
}

export function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}
