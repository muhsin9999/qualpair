import { expect, test } from '@playwright/test';

/**
 * Calls the real cloud reader (Gemini through Firebase AI Logic) on the sample study's
 * approved access copies. Run with REAL_CLOUD=1 against the dev server (App Check debug token).
 */
test('real cloud reader codes approved access copies', async ({ page }) => {
  page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 300)); });
  await page.goto('/studies');
  await page.evaluate(() => localStorage.removeItem('qualcheck.practiceReaders'));
  await page.reload();
  await page.getByRole('button', { name: /Open the sample/ }).click();
  await expect(page.getByRole('heading', { name: 'UK healthcare study (sample)' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: 'Access copies' }).click();
  await expect(page.getByText('Always hide')).toBeVisible();
  for (let i = 0; i < Number(process.env.APPROVE ?? 2); i++) {
    await page.getByRole('button', { name: /^Approve Interview/ }).click();
    await page.waitForTimeout(400);
  }
  await page.getByRole('link', { name: 'Cloud reader' }).click();
  await page.getByRole('button', { name: new RegExp(`Send ${process.env.APPROVE ?? 2} access cop`) }).click();
  await expect(page.getByRole('button', { name: 'All approved copies coded' })).toBeVisible({ timeout: 480_000 });
  await page.getByRole('link', { name: 'AI activity' }).click();
  await expect(page.getByText('calls to the cloud')).toBeVisible();
  const failed = await page.getByText('· failed').count();
  console.log('failed cloud calls:', failed);
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/cloud-real-activity.png` });
});
