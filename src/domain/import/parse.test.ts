import { describe, expect, it } from 'vitest';
import { codePointLength, guessInterviewers, parseTranscript, segmentTurns, vttToText } from './parse';

describe('parseTranscript', () => {
  it('splits labelled speaker turns and joins continuation lines', () => {
    const p = parseTranscript('I: How are you?\nP: Fine, thanks.\nI went to the clinic.\nI: Why?\n');
    expect(p.speakers).toEqual(['I', 'P']);
    expect(p.turns.map((t) => t.speaker)).toEqual(['I', 'P', 'I']);
    expect(p.turns[1]!.text).toBe('Fine, thanks.\nI went to the clinic.');
  });

  it('accepts full-word labels', () => {
    const p = parseTranscript('Interviewer: Tell me more.\nParticipant 3: It was hard.\n');
    expect(p.speakers).toEqual(['Interviewer', 'Participant 3']);
  });

  it('falls back to paragraphs when there are no labels', () => {
    const p = parseTranscript('First paragraph.\n\nSecond paragraph\ncontinues here.');
    expect(p.turns).toHaveLength(2);
    expect(p.turns[0]!.speaker).toBe('Speaker');
  });

  it('uses code-point offsets that slice back to the text', () => {
    const src = 'I: Emoji 😀 test?\nP: Yes — café 👍 works.';
    const p = parseTranscript(src);
    const cps = Array.from(p.text);
    for (const t of p.turns) expect(cps.slice(t.start, t.end).join('')).toBe(t.text);
  });
});

describe('guessInterviewers', () => {
  it('recognises interviewer labels', () => {
    expect(guessInterviewers(parseTranscript('I: Hi?\nP: Hello.'))).toEqual(['I']);
  });
  it('falls back to the speaker who asks questions', () => {
    const p = parseTranscript('Anna: How was it?\nBen: Good.\nAnna: Why?\nBen: Because.');
    expect(guessInterviewers(p)).toEqual(['Anna']);
  });
});

describe('segmentTurns', () => {
  it('keeps short turns whole and splits long turns at sentences', () => {
    const long = 'P: ' + Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const p = parseTranscript(`I: Question?\n${long}`);
    const segs = segmentTurns(p.turns, 300);
    expect(segs[0]!.text).toBe('Question?');
    expect(segs.length).toBeGreaterThan(3);
    const cps = Array.from(p.text);
    for (const s of segs) expect(cps.slice(s.start, s.end).join('').replace(/\s*\n\s*/g, ' ')).toBe(s.text);
    expect(segs.every((s) => s.text.length <= 330)).toBe(true);
  });
});

describe('vttToText', () => {
  it('converts voice tags and drops timings', () => {
    const vtt = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\n<v Interviewer>How are you?</v>\n\n2\n00:00:03.000 --> 00:00:05.000\n<v Amina>Fine.</v>\n';
    expect(vttToText(vtt)).toBe('Interviewer: How are you?\nAmina: Fine.');
  });
});

describe('codePointLength', () => {
  it('counts astral characters once', () => {
    expect(codePointLength('a😀b')).toBe(3);
  });
});
