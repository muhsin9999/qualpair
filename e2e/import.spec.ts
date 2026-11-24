import { expect, test } from '@playwright/test';
import path from 'node:path';

/** Real .docx import (Zhang 2026, CC BY 4.0) and pasted text with speaker labels. */
test('imports a .docx transcript and pasted text', async ({ page }) => {
  await page.goto('/studies?practice');
  page.once('dialog', (d) => d.accept('Import test'));
  await page.getByRole('button', { name: 'New study' }).click();
  await expect(page.getByRole('heading', { name: 'Interviews' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles(path.join(import.meta.dirname, 'fixtures', 'zhang-7.docx'));
  await expect(page.getByText('Imported 1 interview.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('cell', { name: 'zhang-7' })).toBeVisible();
  await page.getByRole('button', { name: 'Paste text' }).click();
  await page.getByRole('textbox').fill('Interviewer: How did you find the GP?\nAmina: It took three weeks to get an appointment.\nInterviewer: And then?\nAmina: I went to the pharmacy instead.');
  await page.getByRole('button', { name: 'Add interview' }).click();
  await expect(page.getByRole('cell', { name: 'Interview 2' })).toBeVisible();
  await page.getByRole('cell', { name: 'Interview 2' }).click();
  await expect(page.getByText('Who is the interviewer?')).toBeVisible();
  await expect(page.getByText('Interviewer', { exact: true }).first()).toBeVisible();
});
