/**
 * Turns raw transcript text into speaker turns and coding segments.
 * Offsets are Unicode code points (not UTF-16 units) so exports match REFI-QDA.
 */

export interface Turn {
  speaker: string;
  /** Code-point offsets into the normalised text. */
  start: number;
  end: number;
  text: string;
}

export interface ParsedTranscript {
  /** Normalised text (\n line endings). Offsets refer to this string. */
  text: string;
  speakers: string[];
  turns: Turn[];
}

const LABEL = /^[ \t]*((?:[A-Z][A-Za-z.'’-]*)(?:[ ][A-Z0-9][A-Za-z0-9.'’-]*){0,2}|[A-Z]{1,4}\d{0,3})[ \t]*[:：][ \t]*/;
const INTERVIEWER_LABELS = /^(i|int|interviewer|q|r|researcher|moderator|facilitator|mod)$/i;

/** Number of code points in a UTF-16 prefix. */
export function codePointLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) i++;
    n++;
  }
  return n;
}

/** Strip WebVTT cue timing and convert <v Name> voice tags to "Name:" labels. */
export function vttToText(vtt: string): string {
  const lines = vtt.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === 'WEBVTT' || line.startsWith('NOTE') || /-->/.test(line) || /^\d+$/.test(line)) continue;
    const voice = line.match(/^<v(?:\.[^ >]+)?\s+([^>]+)>(.*?)(?:<\/v>)?$/);
    if (voice) out.push(`${voice[1]!.trim()}: ${voice[2]!.trim()}`);
    else out.push(line.replace(/<[^>]+>/g, ''));
  }
  // Merge consecutive lines from the same speaker.
  const merged: string[] = [];
  for (const l of out) {
    const m = l.match(LABEL);
    const prev = merged[merged.length - 1];
    if (m && prev) {
      const pm = prev.match(LABEL);
      if (pm && pm[1] === m[1]) {
        merged[merged.length - 1] = `${prev} ${l.slice(m[0].length)}`;
        continue;
      }
    }
    merged.push(l);
  }
  return merged.join('\n');
}

export function parseTranscript(input: string): ParsedTranscript {
  const text = input.replace(/\r\n?/g, '\n').replace(/ /g, ' ');
  const lines = text.split('\n');
  const labelled = lines.filter((l) => LABEL.test(l)).length;
  const nonEmpty = lines.filter((l) => l.trim()).length;
  const useLabels = labelled >= 2 && labelled / Math.max(1, nonEmpty) >= 0.3;

  const turns: Turn[] = [];
  let utf16 = 0;
  let current: { speaker: string; start16: number; end16: number } | null = null;

  const flush = () => {
    if (!current) return;
    const raw = text.slice(current.start16, current.end16);
    const trimmedStart = current.start16 + (raw.length - raw.trimStart().length);
    const trimmedEnd = current.end16 - (raw.length - raw.trimEnd().length);
    if (trimmedEnd > trimmedStart) {
      turns.push({
        speaker: current.speaker,
        start: codePointLength(text.slice(0, trimmedStart)),
        end: codePointLength(text.slice(0, trimmedEnd)),
        text: text.slice(trimmedStart, trimmedEnd),
      });
    }
    current = null;
  };

  for (const line of lines) {
    const lineStart = utf16;
    const lineEnd = utf16 + line.length;
    utf16 = lineEnd + 1;
    if (!line.trim()) {
      if (!useLabels) flush();
      continue;
    }
    const m = useLabels ? line.match(LABEL) : null;
    if (m) {
      flush();
      current = { speaker: normaliseSpeaker(m[1]!), start16: lineStart + m[0].length, end16: lineEnd };
    } else if (current) {
      current.end16 = lineEnd;
    } else {
      current = { speaker: useLabels ? 'Unknown' : 'Speaker', start16: lineStart, end16: lineEnd };
    }
  }
  flush();

  const speakers: string[] = [];
  for (const t of turns) if (!speakers.includes(t.speaker)) speakers.push(t.speaker);
  return { text, speakers, turns };
}

function normaliseSpeaker(label: string): string {
  return label.trim().replace(/\s+/g, ' ');
}

/**
 * Guess which speakers are the interviewer: a known label (I, Interviewer, Q…),
 * otherwise the speaker whose turns most often end in a question mark.
 * This is a guess the user confirms.
 */
export function guessInterviewers(parsed: ParsedTranscript): string[] {
  const byLabel = parsed.speakers.filter((s) => INTERVIEWER_LABELS.test(s));
  if (byLabel.length) return byLabel;
  if (parsed.speakers.length < 2) return [];
  let best = '';
  let bestRate = -1;
  for (const s of parsed.speakers) {
    const ts = parsed.turns.filter((t) => t.speaker === s);
    const rate = ts.filter((t) => /\?\s*$/.test(t.text)).length / Math.max(1, ts.length);
    if (rate > bestRate) {
      bestRate = rate;
      best = s;
    }
  }
  return bestRate > 0.3 ? [best] : [];
}

export interface SegmentDraft {
  index: number;
  speaker: string;
  start: number;
  end: number;
  text: string;
}

/**
 * One segment per speaker turn. Turns longer than `maxChars` are split at sentence
 * boundaries so the laptop reader stays well inside its context window.
 */
export function segmentTurns(turns: Turn[], maxChars = 900): SegmentDraft[] {
  const out: SegmentDraft[] = [];
  for (const t of turns) {
    const pieces = splitLong(t.text, maxChars);
    let cp = t.start;
    for (const p of pieces) {
      const len = codePointLength(p);
      const lead = len - codePointLength(p.trimStart());
      const trail = len - codePointLength(p.trimEnd());
      const clean = p.trim().replace(/\s*\n\s*/g, ' ');
      if (clean) out.push({ index: out.length, speaker: t.speaker, start: cp + lead, end: cp + len - trail, text: clean });
      cp += len;
    }
  }
  return out;
}

function splitLong(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const sentences = text.match(/[^.!?]+(?:[.!?]+["”’)]*\s*|$)/g) ?? [text];
  const pieces: string[] = [];
  let buf = '';
  for (const s of sentences) {
    if (buf && buf.length + s.length > maxChars) {
      pieces.push(buf);
      buf = '';
    }
    buf += s;
  }
  if (buf) pieces.push(buf);
  return pieces;
}
