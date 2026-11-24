import { expect, test } from '@playwright/test';

/** After one online visit, the app opens and the on-device steps work with the network off. */
test('works offline after the first visit', async ({ page, context }) => {
  await page.goto('/studies?practice');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.getByRole('button', { name: /Try the sample study/ }).click();
  await expect(page.getByRole('heading', { name: 'UK healthcare study (sample)' })).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'UK healthcare study (sample)' })).toBeVisible();
  await page.getByRole('link', { name: 'Access copies' }).click();
  await expect(page.getByText('Always hide')).toBeVisible();
  await page.getByRole('link', { name: 'Laptop reader' }).click();
  await page.getByRole('button', { name: /Start|Resume/ }).click();
  await expect(page.getByText(/of 263 paragraphs/)).toBeVisible();
  await context.setOffline(false);
});
