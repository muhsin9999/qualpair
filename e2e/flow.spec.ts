import { expect, test } from '@playwright/test';

const SHOTS = process.env.SHOTS_DIR;
async function shot(page: import('@playwright/test').Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/**
 * Full study flow with the practice readers (keyword rules, no AI), so it runs in any browser.
 * The real readers are covered by manual checks in Chrome with Gemini Nano.
 */
test('sample study: import → sample → both readers → access copies → agreement → review → report', async ({ page }) => {
  await page.goto('/studies?practice');
  await page.getByRole('button', { name: /Open the sample/ }).click();
  await expect(page.getByRole('heading', { name: 'UK healthcare study (sample)' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Practice readers · no AI')).toBeVisible();
  await shot(page, '01-overview-empty');

  await page.getByRole('link', { name: 'Interviews' }).click();
  await expect(page.getByRole('cell', { name: 'Interview 01' })).toBeVisible();
  await page.getByRole('cell', { name: 'Interview 01' }).click();
  await expect(page.getByText('Who is the interviewer?')).toBeVisible();
  await shot(page, '02-interviews');

  await page.getByRole('link', { name: 'Codebook' }).click();
  await expect(page.getByLabel('Code name')).toHaveValue('Severity gap');
  await shot(page, '03-codebook');

  await page.getByRole('link', { name: 'Your sample' }).click();
  await page.getByRole('button', { name: 'Draw my sample' }).click();
  await expect(page.getByText(/Which codes apply to paragraph/)).toBeVisible();
  await shot(page, '04-sample');
  for (let i = 0; i < 200; i++) {
    if (await page.getByText('Sample done.').isVisible()) break;
    const text = (await page.locator('.para.cur .tx').innerText()).toLowerCase();
    if (/wait|appointment|week/.test(text)) await page.keyboard.press('2');
    if (/medicine|tablet|paracetamol/.test(text)) await page.keyboard.press('3');
    if (/india|china|home country|back home/.test(text)) await page.keyboard.press('5');
    if (/antibiotic/.test(text)) await page.keyboard.press('8');
    const before = await page.getByText(/Which codes apply to paragraph/).innerText();
    await page.keyboard.press('Enter');
    // Wait for the next paragraph (or the end) before pressing again.
    await expect(async () => {
      const done = await page.getByText('Sample done.').isVisible();
      const now = done ? '' : await page.getByText(/Which codes apply to paragraph/).innerText();
      expect(done || now !== before).toBe(true);
    }).toPass({ timeout: 5_000 });
  }
  await expect(page.getByText('Sample done.')).toBeVisible();

  await page.getByRole('link', { name: 'Laptop reader' }).click();
  await page.getByRole('button', { name: /Start|Resume/ }).click();
  await expect(page.getByText('All paragraphs coded')).toBeVisible({ timeout: 120_000 });
  await shot(page, '05-laptop');

  await page.getByRole('link', { name: 'Access copies' }).click();
  await expect(page.getByText('Always hide')).toBeVisible();
  await shot(page, '06-access');
  for (let i = 0; i < 6; i++) {
    const approve = page.getByRole('button', { name: /^Approve Interview/ });
    await approve.click();
    await page.waitForTimeout(300);
  }
  await expect(page.getByText('6 of 6 approved')).toBeVisible();

  await page.getByRole('link', { name: 'Cloud reader' }).click();
  await shot(page, '07-cloud-before');
  await page.getByRole('button', { name: /Send 6 access copies/ }).click();
  await expect(page.getByRole('button', { name: 'All approved copies coded' })).toBeVisible({ timeout: 120_000 });

  await page.getByRole('link', { name: 'Agreement', exact: true }).click();
  await expect(page.getByText('codes reach the pass mark')).toBeVisible();
  await shot(page, '08-agreement');
  await page.locator('tbody tr').first().click();
  await expect(page.getByText('one code, paragraph by paragraph')).toBeVisible();
  await shot(page, '08b-code-detail');

  await page.getByRole('link', { name: 'Disagreements' }).click();
  await expect(page.getByText('decisions left')).toBeVisible();
  await shot(page, '09-review');
  await page.keyboard.press('a');
  await page.keyboard.press('r');

  await page.getByRole('link', { name: 'Report' }).click();
  await expect(page.getByText('Number of Participants Who Discussed Each Theme').first()).toBeVisible();
  await shot(page, '10-report');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Word' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/report\.docx$/);

  await page.getByRole('link', { name: 'AI activity' }).click();
  await expect(page.getByText('calls on this computer')).toBeVisible();
  await shot(page, '11-activity');

  await page.getByRole('link', { name: 'Overview' }).click();
  await shot(page, '12-overview-done');
  await page.goto('/studies');
  await expect(page.locator('.st-card .st-steps').first()).toBeVisible({ timeout: 15_000 });
  await shot(page, '00-projects');
});
