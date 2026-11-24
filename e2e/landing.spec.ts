import { expect, test } from '@playwright/test';

test('first page: explains the product, checks the computer, opens the sample study', async ({ page }) => {
  await page.goto('/?practice');
  await expect(page.getByRole('heading', { name: 'AI coding for interviews you can’t upload.' })).toBeVisible();
  // The demo ends with each reader's codes shown and the disagreement marked.
  await expect(page.getByText('you decide')).toHaveCSS('opacity', '1', { timeout: 8_000 });
  await page.getByRole('button', { name: /Check my computer/ }).click();
  // Headless Chromium has no on-device model, so the check must say so and offer the cloud reader.
  await expect(page.locator('.ld-check').getByRole('button')).toHaveText(/Try it with the cloud reader|Try it on 6 real interviews/);
  await expect(page.locator('.ld-check h2')).not.toHaveText('Will the laptop reader work on your computer?');
  await page.getByRole('button', { name: /Try it on 6 real interviews/ }).first().click();
  await expect(page.getByRole('heading', { name: 'UK healthcare study (sample)' })).toBeVisible({ timeout: 30_000 });
  // A second visit opens the same sample study instead of making another copy.
  await page.goto('/');
  await page.getByRole('button', { name: /Try it on 6 real interviews/ }).first().click();
  await expect(page.getByRole('heading', { name: 'UK healthcare study (sample)' })).toBeVisible({ timeout: 30_000 });
  await page.goto('/studies');
  await expect(page.getByRole('link', { name: /UK healthcare study \(sample\)/ })).toHaveCount(1);
});
