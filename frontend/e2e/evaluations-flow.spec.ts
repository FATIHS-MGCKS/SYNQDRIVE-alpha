import { expect, test } from '@playwright/test';

import { assertNoHorizontalOverflow, openEvaluationsPage } from './evaluations-fixtures';

/**
 * E6B canonical Auswertungen core flow (mocked canonical E1–E5 API). Replaces the
 * legacy invoice/dashboard-insights/misuse/forecast/recommendation E2E, which tested
 * the pre-E6 page and E7/E8/E9 content now excluded from the canonical composition.
 * Fixtures render with locale `de`. Full visual/responsive regression is E6D.
 */
test.describe('Auswertungen — E6B canonical core (mocked API)', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Flow specs run on desktop-1280 only');
  });

  test('canonical page loads with header, period control and MTD Finance scope', async ({ page }) => {
    await openEvaluationsPage(page, { profile: 'full-org' });

    await expect(page.getByTestId('evaluations-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Auswertungen' })).toBeVisible();
    // Global analytics period control present (governs analytics only).
    await expect(page.getByTestId('evaluations-period-select')).toBeVisible();
    // Finance section shows its fixed MTD scope regardless of the analytics period.
    const finance = page.getByTestId('evaluations-finance');
    await expect(finance).toBeVisible();
    await expect(finance.getByText('Monat bis heute')).toBeVisible();
    // Canonical E3 issued revenue is rendered (from the always-on finance endpoint).
    await expect(page.getByTestId('evaluations-finance-kpi-fin.mtd_issued_revenue')).toContainText('€');

    // No E7 (recommendations/actions) or E8/E9 (forecast/prediction) surfaces.
    await expect(page.getByText(/Empfohlene Maßnahmen|Maßnahmen-Center|Prognose|Forecast|MoM revenue/i)).toHaveCount(0);

    await assertNoHorizontalOverflow(page);
  });

  test('changing the analytics period does not change the Finance MTD scope', async ({ page }) => {
    await openEvaluationsPage(page, { profile: 'full-org' });
    await page.getByTestId('evaluations-period-select').selectOption('ROLLING_7_DAYS');
    // Finance remains MTD (E3 authority) even when analytics period is "last 7 days".
    await expect(page.getByTestId('evaluations-finance').getByText('Monat bis heute')).toBeVisible();
  });

  test('feature-disabled (generic 404) renders neutral unavailable, not "deaktiviert", and no legacy data', async ({ page }) => {
    await openEvaluationsPage(page, { profile: 'full-org', canonicalFeatureDisabled: true });

    await expect(page.getByTestId('evaluations-page')).toBeVisible();
    // Analytics sections show the neutral NOT_FOUND copy.
    await expect(
      page.getByText('Für diesen Bereich sind keine Auswertungen verfügbar.').first(),
    ).toBeVisible();
    // Never claims the feature is disabled (no reliable discriminator exists).
    await expect(page.getByText(/deaktiviert|disabled/i)).toHaveCount(0);
    // Finance (always-on E3) still renders — no legacy analytics fallback needed.
    await expect(page.getByTestId('evaluations-finance').getByText('Monat bis heute')).toBeVisible();
  });
});
