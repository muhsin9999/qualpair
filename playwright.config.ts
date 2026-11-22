import { defineConfig } from '@playwright/test';

/**
 * Default: the production build with practice readers (no AI).
 * REAL_CLOUD=1: the dev server, so the App Check debug token works and the real cloud reader runs.
 */
const real = !!process.env.REAL_CLOUD;
const hosted = process.env.HOSTED_URL;
const port = real ? 5173 : 4173;

export default defineConfig({
  testDir: './e2e',
  timeout: 600_000,
  testIgnore: real ? undefined : /cloud-real/,
  use: { baseURL: hosted ?? `http://127.0.0.1:${port}`, viewport: { width: 1440, height: 900 }, acceptDownloads: true },
  webServer: hosted ? undefined : {
    command: real ? `npx vite --host 127.0.0.1 --port ${port} --strictPort` : `npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
