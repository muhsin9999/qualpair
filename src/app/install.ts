import { useSyncExternalStore } from 'react';

/** Chrome's install prompt event (not yet in TypeScript's DOM types). */
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Call once at start-up: Chrome may offer installation before React has mounted. */
export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Whether Chrome can install QualPair as an app right now, and a function that asks it to. */
export function useInstall() {
  const ready = useSyncExternalStore(subscribe, () => deferred !== null);
  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    emit();
  }
  return { canInstall: ready, install };
}
