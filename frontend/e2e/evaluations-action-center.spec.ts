import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  openEvaluationsPage,
  saveEvaluationsScreenshot,
} from './evaluations-fixtures';

test.describe('Evaluations action center', () => {
  test('lists recommendations, opens detail drawer, and transitions status', async ({ page }, testInfo) => {
    await openEvaluationsPage(page);

    const nav = page.getByTestId('evaluations-section-nav');
    await nav.getByRole('link', { name: /Maßnahmen|Actions/i }).click();
    await page.locator('#auswertungen-massnahmen').scrollIntoViewIfNeeded();

    const actionCenter = page.getByTestId('evaluations-action-center');
    await expect(actionCenter).toBeVisible({ timeout: 15000 });
    await expect(actionCenter.getByText('Bremsen prüfen lassen')).toBeVisible();
    await expect(actionCenter.getByText('Leerstand Berlin reduzieren')).toBeVisible();

    await actionCenter.getByRole('button', { name: /Bremsen prüfen lassen/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Telemetrie zeigt beschleunigten Belagverschleiß')).toBeVisible();

    const reviewButton = page.getByRole('button', { name: /Als geprüft markieren|Mark as reviewed/i });
    await expect(reviewButton).toBeVisible();
    await reviewButton.click();

    await expect(page.getByRole('dialog').getByText(/Geprüft|Reviewed/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('evaluations-recommendation-integrations')).toBeVisible();
    await expect(page.getByText(/Verknüpfungen|Links & actions/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Aufgabe erstellen|Create task/i })).toBeVisible();
    await assertNoHorizontalOverflow(page);

    if (testInfo.project.name === 'desktop-1280') {
      await saveEvaluationsScreenshot(page, 'evaluations-action-center-desktop', testInfo, {
        copyToDocs: 'evaluations-action-center.png',
      });
    }
  });

  test('filters recommendations by status without layout overflow', async ({ page }) => {
    await openEvaluationsPage(page);

    await page.getByTestId('evaluations-section-nav').getByRole('link', { name: /Maßnahmen|Actions/i }).click();
    const actionCenter = page.getByTestId('evaluations-action-center');
    await expect(actionCenter).toBeVisible({ timeout: 15000 });

    await actionCenter.getByLabel(/Status/i).selectOption('REVIEWED');
    await expect(actionCenter.getByText('Leerstand Berlin reduzieren')).toBeVisible();
    await expect(actionCenter.getByText('Bremsen prüfen lassen')).not.toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('shows impact measurement panel for implemented recommendations', async ({ page }) => {
    await openEvaluationsPage(page);

    await page.getByTestId('evaluations-section-nav').getByRole('link', { name: /Maßnahmen|Actions/i }).click();
    const actionCenter = page.getByTestId('evaluations-action-center');
    await expect(actionCenter).toBeVisible({ timeout: 15000 });

    await actionCenter.getByRole('button', { name: /Auslastung Q3 steigern/i }).click();
    await expect(page.getByTestId('evaluations-recommendation-impact')).toBeVisible();
    await expect(page.getByText(/Wirkungsmessung|Impact measurement/i)).toBeVisible();
    await expect(page.getByText(/Korrelation|correlation/i)).toBeVisible();

    await page.getByRole('button', { name: /Wirkungsmessung erfassen|Record impact measurement/i }).click();
    await page.getByRole('button', { name: /Messung speichern|Save measurement/i }).click();

    await expect(page.getByText(/Erfolg|Success/i)).toBeVisible({ timeout: 10000 });
    await assertNoHorizontalOverflow(page);
  });
});
