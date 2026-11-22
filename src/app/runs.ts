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
        const base = cur.base ?? p.done;
        const startedAt = cur.base === undefined ? Date.now() : cur.startedAt;
        return { runs: { ...s.runs, [kind]: { ...cur, base, startedAt, progress: p, last } } };
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

export function eta(r: RunState | undefined): string {
  const doneThisRun = r ? r.progress.done - (r.base ?? 0) : 0;
  if (!r || doneThisRun <= 0) return '';
  const elapsed = Date.now() - r.startedAt;
  const per = elapsed / doneThisRun;
  const left = (r.progress.total - r.progress.done) * per;
  const min = Math.round(left / 60000);
  return min < 1 ? 'under a minute left' : `about ${min} min left`;
}
