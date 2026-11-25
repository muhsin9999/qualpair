import type { ApprovedText, Redaction, RedactionKind } from '../../types';

/**
 * De-identification rules. Offsets in this module are UTF-16 indexes within one
 * segment's text (they never leave the device and are only used to render and redact).
 */

export interface HideTerm {
  term: string;
  /** Placeholder shown in the access copy, e.g. "friend 1". */
  placeholder: string;
}

export interface DeidSettings {
  alwaysHide: HideTerm[];
  neverHide: string[];
  rules: { places: boolean; phones: boolean; emails: boolean; dates: boolean };
}

export const DEFAULT_DEID: DeidSettings = {
  alwaysHide: [],
  neverHide: [],
  rules: { places: true, phones: true, emails: true, dates: true },
};

/** Small built-in list of well-known places. Not exhaustive: the user reviews every copy. */
export const KNOWN_PLACES = [
  'London', 'Manchester', 'Birmingham', 'Leeds', 'Liverpool', 'Sheffield', 'Bristol', 'Newcastle', 'Nottingham',
  'Leicester', 'Coventry', 'Bradford', 'Cardiff', 'Swansea', 'Edinburgh', 'Glasgow', 'Aberdeen', 'Dundee', 'Belfast',
  'Oxford', 'Cambridge', 'Southampton', 'Portsmouth', 'Brighton', 'Reading', 'York', 'Exeter', 'Bath', 'Norwich',
  'Plymouth', 'Durham', 'Lancaster', 'Loughborough', 'Canterbury', 'Kent', 'Surrey', 'Essex', 'Yorkshire',
  'Lagos', 'Abuja', 'Kano', 'Ibadan', 'Kaduna', 'Port Harcourt', 'Enugu', 'Accra', 'Nairobi', 'Kampala', 'Kigali',
  'Johannesburg', 'Cape Town', 'Cairo', 'Addis Ababa', 'Dakar', 'Harare', 'Lusaka', 'Dar es Salaam',
  'Beijing', 'Shanghai', 'Guangzhou', 'Shenzhen', 'Wuhan', 'Chengdu', 'Hong Kong', 'Delhi', 'Mumbai', 'Bangalore',
  'Chennai', 'Karachi', 'Lahore', 'Dhaka', 'Kathmandu', 'Colombo', 'Jakarta', 'Manila', 'Bangkok', 'Hanoi',
  'Kuala Lumpur', 'Singapore', 'Tokyo', 'Seoul', 'Dubai', 'Riyadh', 'Tehran', 'Istanbul', 'Paris', 'Berlin',
  'Madrid', 'Rome', 'Lisbon', 'Dublin', 'Amsterdam', 'Brussels', 'Warsaw', 'New York', 'Toronto', 'Sydney',
];

interface Match {
  start: number;
  end: number;
  original: string;
  placeholder: string;
  kind: RedactionKind;
  source: Redaction['source'];
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findTerm(text: string, term: string): Array<[number, number]> {
  const t = term.trim();
  if (!t) return [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(t)}(?:['’]s)?(?![\\p{L}\\p{N}])`, 'giu');
  const out: Array<[number, number]> = [];
  for (const m of text.matchAll(re)) out.push([m.index!, m.index! + m[0].length]);
  return out;
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
/** International and long numbers, plus short local numbers written 555-0148 or 555 0148. */
const PHONE = /(?<!\w)(?:\+?\d[\d ()-]{7,}\d|\d{3}[- ]\d{4})(?![\w-])/g;
const MONTH = '(?:January|February|March|April|May|June|July|August|September|October|November|December)';
/** 03/11/2024, 14 March (2024), 8th of November, March 14(th)(, 2024). */
const DATE = new RegExp(`\\b(?:\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\d{1,2}(?:st|nd|rd|th)?(?: of)? ${MONTH}(?:,? \\d{4})?|${MONTH} \\d{1,2}(?:st|nd|rd|th)?(?:,? \\d{4})?)\\b`, 'gi');

/** Find everything the rules would hide in one segment. Suggestions are merged in separately. */
export function findRedactions(text: string, settings: DeidSettings, placeLabels: Map<string, string> = new Map()): Redaction[] {
  const never = new Set(settings.neverHide.map((s) => s.toLowerCase()));
  const matches: Match[] = [];
  for (const h of settings.alwaysHide) {
    for (const [s, e] of findTerm(text, h.term)) {
      matches.push({ start: s, end: e, original: text.slice(s, e), placeholder: h.placeholder, kind: 'name', source: 'your-list' });
    }
  }
  if (settings.rules.emails) for (const m of text.matchAll(EMAIL)) push(m, 'email', 'email');
  if (settings.rules.phones) for (const m of text.matchAll(PHONE)) push(m, 'phone', 'phone number');
  if (settings.rules.dates) for (const m of text.matchAll(DATE)) push(m, 'date', 'date');
  if (settings.rules.places) {
    for (const place of KNOWN_PLACES) {
      for (const [s, e] of findTerm(text, place)) {
        const label = placeLabels.get(place.toLowerCase()) ?? 'city';
        matches.push({ start: s, end: e, original: text.slice(s, e), placeholder: label, kind: 'place', source: 'rule' });
      }
    }
  }

  function push(m: RegExpMatchArray, kind: RedactionKind, placeholder: string) {
    matches.push({ start: m.index!, end: m.index! + m[0].length, original: m[0], placeholder, kind, source: 'rule' });
  }

  const kept = matches.filter((m) => !never.has(m.original.toLowerCase()));
  return dedupe(kept).map((m) => ({ ...m, status: 'hidden' as const }));
}

/** Remove overlaps, keeping the earliest-starting and then the longest match. Your list wins ties. */
function dedupe(ms: Match[]): Match[] {
  const rank = { 'your-list': 0, rule: 1, 'laptop-reader': 2 } as const;
  const sorted = ms.slice().sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || rank[a.source] - rank[b.source]);
  const out: Match[] = [];
  for (const m of sorted) {
    const last = out[out.length - 1];
    if (last && m.start < last.end) continue;
    out.push(m);
  }
  return out;
}

/** Add laptop-reader suggestions as pending items, never overlapping existing redactions. */
export function mergeSuggestions(text: string, existing: Redaction[], suggestions: string[]): Redaction[] {
  const out = existing.slice();
  for (const sug of suggestions) {
    for (const [s, e] of findTerm(text, sug)) {
      if (out.some((r) => s < r.end && e > r.start)) continue;
      out.push({ start: s, end: e, original: text.slice(s, e), placeholder: 'name or place', kind: 'suggested', source: 'laptop-reader', status: 'pending' });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Build the text the cloud reader would see. Pending suggestions are shown as hidden, to be safe. */
export function applyRedactions(text: string, redactions: Redaction[]): string {
  let out = '';
  let pos = 0;
  for (const r of redactions.slice().sort((a, b) => a.start - b.start)) {
    if (r.status === 'kept') continue;
    out += text.slice(pos, r.start) + `[${r.placeholder}]`;
    pos = r.end;
  }
  return out + text.slice(pos);
}

export class NotApprovedError extends Error {}

/**
 * The only way to produce text that may be sent to the cloud.
 * Refuses if the copy has undecided suggestions, or if any "always hide" term survived.
 */
export function approveForCloud(redactedText: string, redactions: Redaction[], alwaysHide: HideTerm[]): ApprovedText {
  if (redactions.some((r) => r.status === 'pending')) throw new NotApprovedError('Decide every suggestion before approving.');
  for (const h of alwaysHide) {
    if (findTerm(redactedText, h.term).length) throw new NotApprovedError(`"${h.term}" is still visible in the access copy.`);
  }
  return redactedText as ApprovedText;
}
