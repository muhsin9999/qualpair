import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';

/** Firebase web config. These values are public identifiers, not secrets. */
export const firebaseConfig = {
  apiKey: 'AIzaSyDnF7apaUm3F8Qwhd5I-z0uasHSaysCZJE',
  authDomain: 'pilot-375c7.firebaseapp.com',
  projectId: 'pilot-375c7',
  storageBucket: 'pilot-375c7.firebasestorage.app',
  messagingSenderId: '948147135931',
  appId: '1:948147135931:web:19e334ae4abd28af3b509e',
  measurementId: 'G-GRTFE8X7MX',
};

const RECAPTCHA_SITE_KEY = '6Lde_CsuAAAAAMJRWrXjlP-YkhdB5FQimcBLRwwc';

let app: FirebaseApp | null = null;
let ai: AI | null = null;

declare global {
  // eslint-disable-next-line no-var
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean | undefined;
}

/** The Firebase app, created on first use (no network until a product asks for it). */
export function getFirebaseApp(): FirebaseApp {
  if (!app) app = initializeApp(firebaseConfig);
  return app;
}

/** Lazily initialise App Check and AI Logic (Gemini Developer API backend) on the shared app. */
export function getFirebaseAI(): AI {
  if (ai) return ai;
  // The debug token is for local development only and must never reach a production build.
  const debugToken = import.meta.env.DEV ? (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined) : undefined;
  if (debugToken && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }
  const a = getFirebaseApp();
  initializeAppCheck(a, {
    provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
  ai = getAI(a, { backend: new GoogleAIBackend() });
  return ai;
}
