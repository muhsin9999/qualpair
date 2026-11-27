import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/**
 * REFI-QDA round trip on the finished example study: export the whole project as .qdpx,
 * check what's inside, then open it again as a new study. Set QDPX_SAVE=path to keep the project.qde.
 */
test('REFI-QDA: export a coded study as .qdpx, then open it as a new study', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'See a finished study' }).first().click();
  await expect(page.getByRole('heading', { name: 'Agreement' })).toBeVisible({ timeout: 30_000 });
  await page.locator('#study-nav').getByRole('link', { name: /^Report/ }).click();
  await page.getByRole('button', { name: 'More' }).click();
  const dl = page.waitForEvent('download');
  await page.getByText('Whole project for NVivo / ATLAS.ti / MAXQDA').click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe('UK healthcare study (finished example).qdpx');
  const path = info.outputPath('study.qdpx');
  await file.saveAs(path);

  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const sources = Object.keys(files).filter((f) => f.startsWith('sources/'));
  expect(sources).toHaveLength(6);
  const xml = strFromU8(files['project.qde']!);
  if (process.env.QDPX_SAVE) writeFileSync(process.env.QDPX_SAVE, xml);
  for (const u of ['Researcher (you)', 'Laptop reader (Gemini Nano)', 'Cloud reader (Gemini)', 'Final coding (after your review)']) expect(xml).toContain(`name="${u}"`);
  expect((xml.match(/<PlainTextSelection /g) ?? []).length).toBeGreaterThan(200);

  // Every selection must point at text inside its source (positions in code points).
  const doc = await page.evaluate((x) => {
    const d = new DOMParser().parseFromString(x, 'application/xml');
    return [...d.getElementsByTagName('TextSource')].map((s) => ({
      file: s.getAttribute('plainTextPath')!.replace('internal://', 'sources/'),
      sels: [...s.getElementsByTagName('PlainTextSelection')].map((e) => [Number(e.getAttribute('startPosition')), Number(e.getAttribute('endPosition'))]),
    }));
  }, xml);
  for (const s of doc) {
    const chars = [...strFromU8(files[s.file]!)];
    for (const [a, b] of s.sels) {
      expect(a).toBeLessThan(b!);
      expect(b).toBeLessThanOrEqual(chars.length);
      expect(chars.slice(a, b).join('').trim().length).toBeGreaterThan(0);
    }
  }

  // Open it again: a new study with the same interviews and codebook.
  await page.goto('/studies');
  await page.locator('input[type=file][accept=".qdpx"]').setInputFiles(path);
  await expect(page.getByRole('heading', { name: 'Imported “UK healthcare study (finished example) (imported)”' })).toBeVisible();
  await expect(page.getByText(/6 interviews and 8 codes brought in/)).toBeVisible();
  await page.getByRole('button', { name: 'Open study' }).click();
  await expect(page.getByRole('heading', { name: 'Interviews' })).toBeVisible();
  await expect(page.getByText('6 interviews in this study')).toBeVisible();
  await page.locator('#study-nav').getByRole('link', { name: /^Codebook/ }).click();
  await expect(page.getByText('Version 1')).toBeVisible();

  // A file that isn't a project gives a plain message.
  await page.goto('/studies');
  const bad = info.outputPath('bad.qdpx');
  writeFileSync(bad, zipSync({ 'readme.txt': strToU8('hello') }));
  await page.locator('input[type=file][accept=".qdpx"]').setInputFiles(bad);
  await expect(page.getByText('No project.qde inside this .qdpx file.')).toBeVisible();
});
