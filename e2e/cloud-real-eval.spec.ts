import { expect, test } from '@playwright/test';
import fs from 'node:fs';

/** Runs the cloud reader on the Le Foll evaluation set and saves the results. REAL_CLOUD=1 only. */
test('cloud reader evaluation on Le Foll (2025)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('qualcheck.practiceReaders'));
  await page.goto('/eval');
  await page.getByRole('spinbutton').fill(process.env.EVAL_N ?? '200');
  await page.getByRole('button', { name: 'Run cloud reader' }).click();
  await expect(page.getByText(/macro κ/)).toBeVisible({ timeout: 540_000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download results' }).click();
  const file = await download;
  fs.mkdirSync('results', { recursive: true });
  await file.saveAs(`results/eval-cloud-${new Date().toISOString().slice(0, 10)}.json`);
  console.log(await page.getByText(/macro κ/).innerText());
});
