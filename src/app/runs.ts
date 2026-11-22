import { create } from 'zustand';
import { getCloudReader, getDeviceReader } from '../ai/registry';
import { runCloudReader } from '../services/access';
import { runLaptopReader, type RunProgress } from '../services/coding';
import { db } from '../db/db';
import { codableSegments } from '../services/core';

export type RunKind = 'laptop' | 'cloud';

interface RunState {
  pid: string;
  kind: RunKind;
  progress: RunProgress;
  startedAt: number;
  /** Segments already done before this run started. */
  base?: number;
  error?: string;
  last?: { text: string; codeIds: string[] };
  /** When the paragraph being read now was started (or the run, before the first one). */
  lastAt?: number;
  /** Seconds per paragraph for recent paragraphs, not counting the first one (it includes loading the model). */
  durations?: number[];
  controller: AbortController;
}

interface RunsStore {
  runs: Partial<Record<RunKind, RunState>>;
  start(pid: string, kind: RunKind): Promise<void>;
  stop(kind: RunKind): void;
}

/**
 * Reader runs live outside any page, so they keep going while the user moves around the app.
 * Each segment's result is saved as it finishes, so stopping or closing the tab loses nothing.
 */
export const useRuns = create<RunsStore>((set, get) => ({
  runs: {},
  async start(pid, kind) {
    if (get().runs[kind] && !get().runs[kind]!.error && get().runs[kind]!.progress.done < get().runs[kind]!.progress.total) return;
    const controller = new AbortController();
    const state: RunState = { pid, kind, progress: { done: 0, total: 0, errors: 0 }, startedAt: Date.now(), controller };
    set((s) => ({ runs: { ...s.runs, [kind]: state } }));
    const texts = new Map((await codableSegments(pid)).map((s) => [s.id, s.text]));
    const update = (p: RunProgress) =>
      set((s) => {
        const cur = s.runs[kind];
        if (!cur || cur.controller !== controller) return s;
        const last = p.current ? { text: texts.get(p.current.segmentId) ?? '', codeIds: p.current.codeIds } : cur.last;
        const now = Date.now();
        if (cur.base === undefined) {
          return { runs: { ...s.runs, [kind]: { ...cur, base: p.done, startedAt: now, lastAt: now, durations: [], progress: p, last } } };
        }
        const added = p.done - cur.progress.done;
        let durations = cur.durations ?? [];
        let lastAt = cur.lastAt ?? now;
        if (added > 0) {
          // The first paragraph of a run includes loading the model, so it would make the estimate far too long.
          if (cur.progress.done > cur.base) durations = [...durations, (now - lastAt) / added].slice(-8);
          lastAt = now;
        }
        return { runs: { ...s.runs, [kind]: { ...cur, progress: p, last, durations, lastAt } } };
      });
    try {
      if (kind === 'laptop') await runLaptopReader(pid, getDeviceReader(), update, controller.signal);
      else await runCloudReader(pid, getCloudReader(), update, controller.signal);
    } catch (e) {
      set((s) => ({ runs: { ...s.runs, [kind]: { ...s.runs[kind]!, error: e instanceof Error ? e.message : String(e) } } }));
    } finally {
      await db.projects.update(pid, { updatedAt: Date.now() });
      set((s) => {
        const cur = s.runs[kind];
        if (!cur || cur.controller !== controller) return s;
        if (controller.signal.aborted || (!cur.error && cur.progress.done >= cur.progress.total)) {
          const next = { ...s.runs };
          if (controller.signal.aborted) delete next[kind];
          else next[kind] = cur;
          return { runs: next };
        }
        return s;
      });
    }
  },
  stop(kind) {
    get().runs[kind]?.controller.abort();
    set((s) => {
      const next = { ...s.runs };
      delete next[kind];
      return { runs: next };
    });
  },
}));

export function isRunning(r: RunState | undefined) {
  return !!r && !r.error && r.progress.done < r.progress.total && !r.controller.signal.aborted;
}

/** True until the first paragraph of this run is finished (for the laptop reader, that includes loading the model). */
export function isWarmingUp(r: RunState | undefined) {
  return !!r && (r.base === undefined || r.progress.done === r.base);
}

/** Milliseconds spent on the paragraph being read now. */
export function currentElapsed(r: RunState | undefined, now = Date.now()) {
  return r?.lastAt ? Math.max(0, now - r.lastAt) : 0;
}

/** Time left, from the median of recent paragraphs. Empty until there are two timed paragraphs. */
export function eta(r: RunState | undefined): string {
  const d = r?.durations ?? [];
  if (!r || d.length < 2) return '';
  const sorted = d.slice().sort((a, b) => a - b);
  const per = sorted[Math.floor(sorted.length / 2)]!;
  const min = Math.round(((r.progress.total - r.progress.done) * per) / 60000);
  if (min < 1) return 'under a minute left';
  if (min < 90) return `about ${min} min left`;
  return `about ${Math.round(min / 60)} hours left`;
}

export function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
