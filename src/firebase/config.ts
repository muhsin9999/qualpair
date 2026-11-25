import { ensureInitialized, fetchAndActivate, getRemoteConfig, getValue, isSupported, type RemoteConfig } from 'firebase/remote-config';
import { getFirebaseApp } from './init';

/**
 * Settings that can change without shipping a new version, through Firebase Remote Config.
 * Nothing here is secret or about participants: only the cloud model name and starting values for new studies.
 * The built-in defaults are used offline, in tests, and whenever a value fails the checks below.
 */
export const DEFAULTS = {
  cloud_model: 'gemini-3.5-flash-lite',
  default_pass_mark: 0.6,
  default_sample_share: 0.15,
} as const;

const PASS_MARKS = [0.4, 0.6, 0.7, 0.8];

let values = { cloudModel: DEFAULTS.cloud_model as string, passMark: DEFAULTS.default_pass_mark as number, sampleShare: DEFAULTS.default_sample_share as number };
let source: 'built-in' | 'remote' = 'built-in';

/** Cloud model name, e.g. gemini-3.5-flash-lite. */
export const cloudModel = () => values.cloudModel;
/** Pass mark (Cohen's κ) suggested for new studies. Researchers can still change it before any reader runs. */
export const defaultPassMark = () => values.passMark;
/** Share of paragraphs the researcher codes by hand in a new study. */
export const defaultSampleShare = () => values.sampleShare;
/** Whether the values came from Remote Config or the built-in defaults. */
export const configSource = () => source;

function read(rc: RemoteConfig) {
  const model = getValue(rc, 'cloud_model').asString().trim();
  const pass = getValue(rc, 'default_pass_mark').asNumber();
  const share = getValue(rc, 'default_sample_share').asNumber();
  values = {
    cloudModel: /^gemini-[a-z0-9.-]+$/.test(model) ? model : DEFAULTS.cloud_model,
    passMark: PASS_MARKS.includes(pass) ? pass : DEFAULTS.default_pass_mark,
    sampleShare: share >= 0.1 && share <= 0.25 ? share : DEFAULTS.default_sample_share,
  };
  source = getValue(rc, 'cloud_model').getSource() === 'remote' ? 'remote' : 'built-in';
}

let started = false;
/** Load the last saved values at once, then fetch new ones in the background. Never throws. */
export async function startRemoteConfig() {
  if (started) return;
  started = true;
  try {
    if (!(await isSupported())) return;
    const rc = getRemoteConfig(getFirebaseApp());
    rc.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 60_000 : 60 * 60_000;
    rc.settings.fetchTimeoutMillis = 8_000;
    rc.defaultConfig = { ...DEFAULTS };
    await ensureInitialized(rc);
    read(rc);
    if (navigator.onLine) {
      await fetchAndActivate(rc);
      read(rc);
    }
  } catch {
    // Offline or blocked: keep the saved or built-in values.
  }
}
