import { useLiveQuery } from 'dexie-react-hooks';
import { useParams } from 'react-router-dom';
import { db } from '../db/db';
import { currentCodebook } from '../services/core';
import type { Code } from '../types';

export function usePid(): string {
  return useParams().pid ?? '';
}

export function useProject(pid: string) {
  return useLiveQuery(() => db.projects.get(pid), [pid]);
}

export function useCodebook(pid: string) {
  return useLiveQuery(() => currentCodebook(pid), [pid]);
}

export function useTranscripts(pid: string) {
  return useLiveQuery(() => db.transcripts.where('projectId').equals(pid).sortBy('importedAt'), [pid]);
}

export function useParticipants(pid: string) {
  return useLiveQuery(() => db.participants.where('projectId').equals(pid).toArray(), [pid]);
}

export const codeColor = (c: Pick<Code, 'color'> | undefined) => `var(--c${(c?.color ?? 0) % 8})`;

/** Paragraph number shown to people (1-based). */
export const paraNo = (index: number) => index + 1;

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
