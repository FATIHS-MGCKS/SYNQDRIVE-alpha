import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  getDriverAnalysisRequestCount,
  openEvaluationsPage,
  setDriverScenario,
  setRecommendationsScenario,
} from './evaluations-fixtures';

/**
 * E7D canonical Recommendations / Actions browser acceptance (mocked E7 endpoint).
 */
test.describe('Auswertungen — E7D Recommendations (mocked API)', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test('Recommendations section appears after Executive Summary in server order', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'desktop-1280 only');
    await openEvaluationsPage(page, { profile: 'full-org', recommendationsScenario: 'available' });

    const executive = page.getByTestId('evaluations-executive');
    const recommendations = page.getByTestId('evaluations-recommendations');
    const sw = page.getByTestId('evaluations-sw');
    await expect(executive).toBeVisible();
    await expect(recommendations).toBeVisible();
    await expect(sw).toBeVisible();

    const order = await page
      .locator('[data-testid="evaluations-executive"], [data-testid="evaluations-recommendations"], [data-testid="evaluations-sw"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
    expect(order).toEqual(['evaluations-executive', 'evaluations-recommendations', 'evaluations-sw']);

    const cards = page.locator('article[data-testid^="evaluations-recommendation-"]');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAttribute('data-testid', 'evaluations-recommendation-rec-e2e-finance-z-order-first');
    await expect(cards.nth(1)).toHaveAttribute('data-testid', 'evaluations-recommendation-rec-e2e-driver-order-second');
  });

  test('PARTIAL collection badge stays PARTIAL with INSUFFICIENT_EVIDENCE empty state', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'desktop-1280 only');
    await openEvaluationsPage(page, { profile: 'full-org', recommendationsScenario: 'partial-insufficient' });

    const section = page.getByTestId('evaluations-recommendations');
    await expect(section.getByTestId('evaluations-status-PARTIAL')).toBeVisible();
    await expect(section.getByTestId('evaluations-recommendations-empty-INSUFFICIENT_EVIDENCE')).toBeVisible();
    await expect(section.getByTestId('evaluations-status-AVAILABLE')).toHaveCount(0);
  });

  test('NO_ACTION_NEEDED shown only when server sends it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'desktop-1280 only');
    await openEvaluationsPage(page, { profile: 'full-org', recommendationsScenario: 'no-action-needed' });

    const section = page.getByTestId('evaluations-recommendations');
    // AVAILABLE collection status renders no badge (healthy default).
    await expect(section.getByTestId('evaluations-status-AVAILABLE')).toHaveCount(0);
    await expect(section.getByTestId('evaluations-recommendations-empty-NO_ACTION_NEEDED')).toBeVisible();
    await expect(section.getByText(/Nicht genügend Evidenz/i)).toHaveCount(0);
  });

  test('Finance recommendation provenance shows MTD and Finance action scrolls', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'desktop-1280 only');
    await openEvaluationsPage(page, { profile: 'full-org', recommendationsScenario: 'available' });

    const financeCard = page.getByTestId('evaluations-recommendation-rec-e2e-finance-z-order-first');
    await financeCard.locator('summary').click();
    await expect(financeCard.getByTestId('evaluations-rec-source-period-finance')).toContainText('Monat bis heute');

    await financeCard.getByRole('button', { name: /Finanzen anzeigen/i }).click();
    await expect(page.locator('#evaluations-section-finance')).toBeInViewport();
  });

  test('Driver recommendation action scrolls only — no auto reveal/fetch until explicit reveal', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'desktop-1280 only');
    setDriverScenario('pseudonymous');
    await openEvaluationsPage(page, { profile: 'full-org', recommendationsScenario: 'available' });
    setDriverScenario('pseudonymous');

    expect(getDriverAnalysisRequestCount()).toBe(0);
    const driverCard = page.getByTestId('evaluations-recommendation-rec-e2e-driver-order-second');
    await driverCard.getByRole('button', { name: /Fahrereinfluss anzeigen/i }).click();
    await expect(page.locator('#evaluations-section-driver')).toBeInViewport();
    expect(getDriverAnalysisRequestCount()).toBe(0);
    await expect(page.getByTestId('evaluations-driver-content')).toHaveCount(0);

    await page.getByTestId('evaluations-driver-toggle').click();
    await expect(page.getByTestId('evaluations-driver-content')).toBeVisible();
    expect(getDriverAnalysisRequestCount()).toBeGreaterThanOrEqual(1);
  });

  test('mobile layout keeps Recommendations readable at 320px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-320', 'mobile-320 only');
    await page.setViewportSize({ width: 320, height: 800 });
    await openEvaluationsPage(page, { profile: 'full-org', recommendationsScenario: 'available' });
    await expect(page.getByTestId('evaluations-recommendations')).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await expect(page.getByTestId('evaluations-recommendation-rec-e2e-finance-z-order-first')).toBeVisible();
  });
});
