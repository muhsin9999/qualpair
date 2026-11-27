import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { db, newId } from '../db/db';
import { codableSegments, createProject, currentCodebook, importTranscript, newCode, saveCodebook } from './core';
import { codingIndex, finalCodes } from './results';
import type { Code, Coder } from '../types';

/**
 * REFI-QDA project exchange (.qdpx): a zip with project.qde (XML, urn:QDA-XML:project:1.0)
 * and the plain text of each interview in sources/. NVivo, ATLAS.ti, MAXQDA and QualCoder read it.
 * Positions are Unicode code points into the source text, which is how QualPair stores paragraphs.
 */

const NS = 'urn:QDA-XML:project:1.0';
const HEX = ['#C0553F', '#C98A1E', '#4E8F6A', '#8A5A9E', '#3E8A97', '#B5577B', '#7D8A3A', '#8C6A4A'];

export const QDPX_USERS: Record<Coder | 'final', string> = {
  human: 'Researcher (you)',
  device: 'Laptop reader (Gemini Nano)',
  cloud: 'Cloud reader (Gemini)',
  final: 'Final coding (after your review)',
};
type Who = keyof typeof QDPX_USERS;
const WHO: Who[] = ['human', 'device', 'cloud', 'final'];

export interface QdpxInput {
  name: string;
  createdAt: number;
  codes: Code[];
  sources: Array<{
    id: string;
    name: string;
    participant: string;
    text: string;
    paragraphs: Array<{ start: number; end: number; label: string; coded: Partial<Record<Who, string[]>>; memos: string[] }>;
  }>;
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function codeDescription(c: Code) {
  return [c.definition, c.whenToUse && `Use when: ${c.whenToUse}`, c.whenNotToUse && `Do not use when: ${c.whenNotToUse}`, c.example && `Example: ${c.example}`]
    .filter(Boolean)
    .join('\n');
}

/** project.qde plus the files it points to. `guid` is injectable so tests are repeatable. */
export function buildQdpxFiles(input: QdpxInput, guid: () => string = newId): Record<string, Uint8Array> {
  const users = Object.fromEntries(WHO.map((w) => [w, guid()])) as Record<Who, string>;
  const when = new Date(input.createdAt).toISOString().replace(/\.\d+Z$/, 'Z');
  const files: Record<string, Uint8Array> = {};
  const notes: string[] = [];
  const cases: string[] = [];
  const sources: string[] = [];

  for (const src of input.sources) {
    const file = `${src.id}.txt`;
    files[`sources/${file}`] = strToU8(src.text);
    cases.push(`    <Case guid="${guid()}" name="${esc(src.participant)}">\n      <SourceRef targetGUID="${src.id}"/>\n    </Case>`);
    const sels: string[] = [];
    for (const p of src.paragraphs) {
      const codings = WHO.flatMap((w) => (p.coded[w] ?? []).map((codeId) =>
        `        <Coding guid="${guid()}" creatingUser="${users[w]}">\n          <CodeRef targetGUID="${codeId}"/>\n        </Coding>`));
      const noteRefs = p.memos.map((m) => {
        const id = guid();
        notes.push(`    <Note guid="${id}" name="${esc(`Decision memo · ${p.label}`)}" creatingUser="${users.human}">\n      <PlainTextContent>${esc(m)}</PlainTextContent>\n    </Note>`);
        return `        <NoteRef targetGUID="${id}"/>`;
      });
      if (!codings.length && !noteRefs.length) continue;
      sels.push(`      <PlainTextSelection guid="${guid()}" name="${esc(p.label)}" startPosition="${p.start}" endPosition="${p.end}">\n${[...codings, ...noteRefs].join('\n')}\n      </PlainTextSelection>`);
    }
    sources.push(`    <TextSource guid="${src.id}" name="${esc(src.name)}" plainTextPath="internal://${file}" creationDateTime="${when}">${sels.length ? `\n${sels.join('\n')}\n    ` : ''}</TextSource>`);
  }

  const codes = input.codes
    .map((c) => `      <Code guid="${c.id}" name="${esc(c.name)}" isCodable="true" color="${HEX[c.color % 8]}">\n        <Description>${esc(codeDescription(c))}</Description>\n      </Code>`)
    .join('\n');
  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<Project xmlns="${NS}" name="${esc(input.name)}" origin="QualPair" creationDateTime="${when}">`,
    '  <Users>',
    ...WHO.map((w) => `    <User guid="${users[w]}" name="${esc(QDPX_USERS[w])}"/>`),
    '  </Users>',
    '  <CodeBook>',
    '    <Codes>',
    codes,
    '    </Codes>',
    '  </CodeBook>',
    '  <Cases>',
    ...cases,
    '  </Cases>',
    '  <Sources>',
    ...sources,
    '  </Sources>',
    ...(notes.length ? ['  <Notes>', ...notes, '  </Notes>'] : []),
    '  <Description>Exported from QualPair. Users: the researcher’s sample coding, each AI reader’s coding, and the final coding after the researcher’s review. Each selection is one interview paragraph.</Description>',
    '</Project>',
    '',
  ].join('\n');
  files['project.qde'] = strToU8(xml);
  return files;
}

export function buildQdpx(input: QdpxInput, guid?: () => string): Uint8Array {
  return zipSync(buildQdpxFiles(input, guid), { level: 6 });
}

/** Gather one study from the browser's database. */
export async function qdpxInput(projectId: string): Promise<QdpxInput> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error('Study not found.');
  const book = await currentCodebook(projectId);
  const transcripts = await db.transcripts.where('projectId').equals(projectId).sortBy('importedAt');
  const participants = new Map((await db.participants.where('projectId').equals(projectId).toArray()).map((p) => [p.id, p.label]));
  const segs = await codableSegments(projectId);
  const { index } = await codingIndex(projectId);
  const { applied } = await finalCodes(projectId);
  const memos = new Map<string, string[]>();
  for (const d of await db.decisions.where('projectId').equals(projectId).toArray()) {
    if (!d.memo.trim()) continue;
    const code = book?.codes.find((c) => c.id === d.codeId)?.name ?? 'code';
    memos.set(d.segmentId, [...(memos.get(d.segmentId) ?? []), `${code}: ${d.memo.trim()}`]);
  }
  const yes = (m?: Map<string, boolean>) => (m ? [...m].filter(([, v]) => v).map(([k]) => k) : []);
  return {
    name: project.name,
    createdAt: project.createdAt,
    codes: book?.codes ?? [],
    sources: transcripts.map((t) => ({
      id: t.id,
      name: t.title,
      participant: participants.get(t.participantId) ?? t.title,
      text: t.text,
      paragraphs: segs
        .filter((s) => s.transcriptId === t.id)
        .map((s) => {
          const e = index.get(s.id);
          return {
            start: s.start,
            end: s.end,
            label: `${t.title} · paragraph ${s.index + 1}`,
            coded: { human: yes(e?.human), device: yes(e?.device), cloud: yes(e?.cloud), final: [...(applied.get(s.id) ?? [])] },
            memos: memos.get(s.id) ?? [],
          };
        }),
    })),
  };
}

// ---------- Import ----------

export interface ImportedProject {
  name: string;
  codes: Array<{ name: string; definition: string }>;
  sources: Array<{ name: string; text: string }>;
  /** Sources that had no plain text inside the file (e.g. PDFs, audio, or text kept outside the .qdpx). */
  skipped: string[];
  /** Number of coded selections in the file (not brought in; see importQdpx). */
  codings: number;
}

function children(el: Element, name: string) {
  return [...el.children].filter((c) => c.localName === name);
}
function child(el: Element, name: string) {
  return children(el, name)[0];
}

/** Codes from a <CodeBook> (in a .qdc or a .qdpx). Nested codes are flattened in order. */
export function codesFromXml(root: Element): Array<{ name: string; definition: string }> {
  const out: Array<{ name: string; definition: string }> = [];
  const walk = (el: Element) => {
    for (const c of children(el, 'Code')) {
      const name = c.getAttribute('name')?.trim();
      if (name && c.getAttribute('isCodable') !== 'false') out.push({ name, definition: child(c, 'Description')?.textContent?.trim() ?? '' });
      walk(c);
    }
  };
  const book = root.localName === 'CodeBook' ? root : [...root.getElementsByTagNameNS('*', 'CodeBook')][0];
  const codes = book && child(book, 'Codes');
  if (codes) walk(codes);
  return out;
}

/** Split a REFI description back into QualPair's fields ("Use when: …" lines, as QualPair and many tools write them). */
export function codeFields(description: string): Pick<Code, 'definition' | 'whenToUse' | 'whenNotToUse' | 'example'> {
  const out = { definition: [] as string[], whenToUse: [] as string[], whenNotToUse: [] as string[], example: [] as string[] };
  let cur: keyof typeof out = 'definition';
  for (const line of description.split(/\r?\n/)) {
    const m = line.match(/^\s*(use when|when to use|inclusion criteria|do not use when|don['’]t use when|when not to use|exclusion criteria|example)\s*:\s*(.*)$/i);
    if (m) {
      const k = m[1]!.toLowerCase();
      cur = k === 'example' ? 'example' : /not|exclusion/.test(k) ? 'whenNotToUse' : 'whenToUse';
      if (m[2]) out[cur].push(m[2]);
    } else if (line.trim()) out[cur].push(line.trim());
  }
  return { definition: out.definition.join('\n'), whenToUse: out.whenToUse.join('\n'), whenNotToUse: out.whenNotToUse.join('\n'), example: out.example.join('\n') };
}

function parseXml(text: string): Element {
  const doc = new DOMParser().parseFromString(text.replace(/^﻿/, ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('This file isn’t valid REFI-QDA XML.');
  return doc.documentElement;
}

/** Codebook from a .qdc file. */
export function parseQdc(text: string) {
  const codes = codesFromXml(parseXml(text));
  if (!codes.length) throw new Error('No codes found in this codebook file.');
  return codes;
}

/** Read a .qdpx: codebook and the plain text of each interview. */
export function parseQdpx(bytes: Uint8Array): ImportedProject {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('This isn’t a .qdpx project file (it should be a zip).');
  }
  const qdeName = Object.keys(files).find((f) => /(^|\/)[^/]+\.qde$/i.test(f));
  if (!qdeName) throw new Error('No project.qde inside this .qdpx file.');
  const root = parseXml(strFromU8(files[qdeName]!));
  const lower = new Map(Object.keys(files).map((k) => [k.toLowerCase(), k]));
  const sourcesEl = child(root, 'Sources');
  const sources: ImportedProject['sources'] = [];
  const skipped: string[] = [];
  let codings = 0;
  for (const s of sourcesEl ? children(sourcesEl, 'TextSource') : []) {
    const name = s.getAttribute('name')?.trim() || `Interview ${sources.length + 1}`;
    codings += [...s.getElementsByTagNameNS('*', 'Coding')].length;
    let text = child(s, 'PlainTextContent')?.textContent ?? '';
    const path = s.getAttribute('plainTextPath') ?? '';
    if (!text && path.startsWith('internal://')) {
      const key = lower.get(`sources/${path.slice('internal://'.length)}`.toLowerCase());
      if (key) text = strFromU8(files[key]!);
    }
    if (text.trim()) sources.push({ name, text });
    else skipped.push(name);
  }
  for (const tag of ['PDFSource', 'PictureSource', 'AudioSource', 'VideoSource']) {
    for (const s of sourcesEl ? children(sourcesEl, tag) : []) skipped.push(s.getAttribute('name') ?? tag);
  }
  return { name: root.getAttribute('name')?.trim() || 'Imported project', codes: codesFromXml(root), sources, skipped, codings };
}

/** Make a new study from a .qdpx file. Returns the study id and what was (and wasn't) brought in. */
export async function importQdpx(bytes: Uint8Array) {
  const p = parseQdpx(bytes);
  if (!p.sources.length) throw new Error('No interview text found in this project. QualPair imports text sources only.');
  const taken = new Set((await db.projects.toArray()).map((x) => x.name));
  const name = taken.has(p.name) ? `${p.name} (imported)` : p.name;
  const project = await createProject({ name });
  if (p.codes.length) await saveCodebook(project.id, p.codes.map((c, i) => newCode(c.name, i % 8, codeFields(c.definition))));
  for (const s of p.sources) await importTranscript(project.id, s.name, s.text);
  return { projectId: project.id, name, interviews: p.sources.length, codes: p.codes.length, skipped: p.skipped, codings: p.codings };
}
