import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  openEvaluationsPage,
  getDriverAnalysisRequestCount,
  setDriverScenario,
} from './evaluations-fixtures';

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

    // E6C: Data Quality panel is present and loaded with the page, with full coverage
    // on the served (utilization) section; required vs missing sources stay distinct.
    const quality = page.getByTestId('evaluations-data-quality');
    await expect(quality).toBeVisible();
    await expect(quality.getByTestId('evaluations-quality-coverage-excluded').first()).toContainText('20');
    await expect(quality.getByTestId('evaluations-quality-coverage-missing-sources').first()).toContainText('SCHEDULED_OCCUPANCY_NOT_ACTUAL');
    await expect(quality.getByTestId('evaluations-quality-section-utilization')).toContainText('BOOKINGS'); // required source (distinct)

    await assertNoHorizontalOverflow(page);
  });

  test('E6C: Driver Influence request is lazy and renders canonical coverage', async ({ page }) => {
    setDriverScenario('pseudonymous');
    await openEvaluationsPage(page, { profile: 'full-org' });
    setDriverScenario('pseudonymous'); // re-apply after openEvaluationsPage reset

    await expect(page.getByTestId('evaluations-driver')).toBeVisible();
    expect(getDriverAnalysisRequestCount()).toBe(0); // no request before reveal

    await page.getByTestId('evaluations-driver-toggle').click();
    await expect(page.getByTestId('evaluations-driver-content')).toBeVisible();
    expect(getDriverAnalysisRequestCount()).toBe(1);

    // Driver coverage: availableRecords === factor count (2), excluded records, and the
    // canonical "no missing sources" state (analyzed dimension is not skipped).
    const cov = page.getByTestId('evaluations-driver-coverage');
    await expect(cov.getByTestId('evaluations-driver-coverage-available')).toContainText('2');
    await expect(cov.getByTestId('evaluations-driver-coverage-excluded')).toContainText('3');
    await expect(cov.getByTestId('evaluations-driver-coverage-missing-sources')).toContainText('No missing sources reported');

    // Collapse + reopen must not refetch.
    await page.getByTestId('evaluations-driver-toggle').click();
    await page.getByTestId('evaluations-driver-toggle').click();
    expect(getDriverAnalysisRequestCount()).toBe(1);

    await assertNoHorizontalOverflow(page);
  });

  test('E6C: Driver Influence privacy/transport scenario matrix', async ({ page }) => {
    // full → raw permitted reference verbatim
    setDriverScenario('full');
    await openEvaluationsPage(page, { profile: 'full-org' });
    setDriverScenario('full');
    await page.getByTestId('evaluations-driver-toggle').click();
    await expect(page.getByTestId('evaluations-driver-content')).toContainText('driver::raw::A');

    // pseudonymous → pseudonym verbatim
    setDriverScenario('pseudonymous');
    await openEvaluationsPage(page, { profile: 'full-org' });
    setDriverScenario('pseudonymous');
    await page.getByTestId('evaluations-driver-toggle').click();
    await expect(page.getByTestId('evaluations-driver-piitier-pseudonymous')).toBeVisible();
    await expect(page.getByTestId('evaluations-driver-content')).toContainText('driver::pseudo::A');

    // none / PERSON_LEVEL_ACCESS_DENIED → no reference, reason visible
    setDriverScenario('none');
    await openEvaluationsPage(page, { profile: 'full-org' });
    setDriverScenario('none');
    await page.getByTestId('evaluations-driver-toggle').click();
    await expect(page.getByTestId('evaluations-driver')).toContainText('PERSON_LEVEL_ACCESS_DENIED');
    await expect(page.getByTestId('evaluations-driver')).not.toContainText('driver::');

    // fail-closed → pseudonymous tier badge + reason visible, no reference
    setDriverScenario('failClosed');
    await openEvaluationsPage(page, { profile: 'full-org' });
    setDriverScenario('failClosed');
    await page.getByTestId('evaluations-driver-toggle').click();
    await expect(page.getByTestId('evaluations-driver-piitier-pseudonymous')).toBeVisible();
    await expect(page.getByTestId('evaluations-driver')).toContainText('PSEUDONYMIZATION_UNAVAILABLE');
    await expect(page.getByTestId('evaluations-driver')).not.toContainText('driver::');

    // generic 404 → neutral unavailable, never "disabled"
    setDriverScenario('notFound');
    await openEvaluationsPage(page, { profile: 'full-org' });
    setDriverScenario('notFound');
    await page.getByTestId('evaluations-driver-toggle').click();
    await expect(page.getByTestId('evaluations-driver')).toContainText('Für diesen Bereich sind keine Auswertungen verfügbar.');
    await expect(page.getByTestId('evaluations-driver')).not.toContainText(/deaktiviert|disabled/i);

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
