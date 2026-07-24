import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  openEvaluationsPage,
  resetEvaluationsMockState,
  type EvaluationsScenarioProfile,
} from './evaluations-fixtures';

const SCENARIO_PROFILES: EvaluationsScenarioProfile[] = [
  'full-org',
  'empty-org',
  'partial-coverage',
  'stale-sources',
  'backend-error',
  'missing-permission',
  'multi-station',
  'multi-currency',
  'many-insights',
  'grouped-insights',
  'many-recommendations',
  'forecast-available',
  'forecast-unavailable',
];

test.describe('Auswertungen — scenario E2E (mocked API)', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Flow specs run on desktop-1280 only');
  });

  for (const profile of SCENARIO_PROFILES) {
    test(`scenario: ${profile}`, async ({ page }) => {
      resetEvaluationsMockState(profile);
      await openEvaluationsPage(page, { profile });

      await expect(page.getByTestId('evaluations-page')).toBeVisible();
      await expect(page.getByTestId('evaluations-insights-cockpit')).toBeVisible();

      switch (profile) {
        case 'empty-org':
          await expect(page.getByText('Keine aktiven Geschäftsrisiken')).toBeVisible();
          await expect(page.getByText('No invoices recorded this month yet')).toBeVisible();
          break;
        case 'partial-coverage':
          await expect(page.getByText('Kundendaten konnten nicht geladen werden')).toBeVisible();
          break;
        case 'stale-sources':
          await expect(page.getByText(/veraltet/i)).toBeVisible();
          break;
        case 'backend-error':
          await expect(page.getByText('Finanzdaten konnten nicht geladen werden')).toBeVisible();
          await expect(page.getByText('Insights konnten nicht geladen werden')).toBeVisible();
          break;
        case 'missing-permission':
          await expect(page.getByText('Finanzdaten konnten nicht geladen werden')).toBeVisible();
          break;
        case 'multi-station':
          await expect(page.getByRole('heading', { name: 'Kassel Engpass' })).toBeVisible();
          await expect(page.getByRole('heading', { name: 'Frankfurt Engpass' })).toBeVisible();
          await page.getByText('Financial Intelligence').scrollIntoViewIfNeeded();
          await expect(page.getByText('Top vehicles (MTD)')).toBeVisible();
          break;
        case 'multi-currency':
          await expect(page.getByText('Issued Revenue MTD')).toBeVisible();
          break;
        case 'many-insights':
          await expect(page.getByText('Insight 1')).toBeVisible();
          await expect(page.getByText('Insight 8')).toBeVisible();
          break;
        case 'grouped-insights':
          await expect(page.getByRole('heading', { name: '3 Fahrzeuge ungenutzt' })).toBeVisible();
          break;
        case 'many-recommendations':
          await expect(page.getByText('Empfohlene Maßnahmen')).toBeVisible();
          await expect(page.getByText('Empfehlung 1')).toBeVisible();
          await expect(page.getByText('Empfehlung 6')).toBeVisible();
          break;
        case 'forecast-available':
          await expect(page.getByText('MoM revenue')).toBeVisible();
          await expect(page.locator('text=MoM revenue').locator('..').locator('span').filter({ hasText: /%/ })).toBeVisible();
          break;
        case 'forecast-unavailable':
          await expect(page.getByText('MoM revenue')).toBeVisible();
          await expect(page.locator('text=MoM revenue').locator('..').getByText('—')).toBeVisible();
          break;
        case 'full-org':
        default:
          await expect(page.getByRole('heading', { name: 'Station Kassel unterbesetzt' })).toBeVisible();
          await expect(page.getByText('Harte Bremsung')).toBeVisible();
          await page.getByText('Financial Intelligence').scrollIntoViewIfNeeded();
          await expect(page.getByText('7 invoices')).toBeVisible();
          await expect(page.getByRole('button', { name: /Issued Revenue MTD/i })).toContainText('1.120');
          await expect(page.getByText('Top customers (MTD)')).toBeVisible();
          break;
      }

      await assertNoHorizontalOverflow(page);
    });
  }
});

test.describe('Auswertungen — interactions', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Interaction specs run on desktop-1280 only');
  });

  test('drill-down: revenue KPI opens breakdown dialog with day expansion', async ({ page }) => {
    await openEvaluationsPage(page, { profile: 'full-org' });

    await page.getByRole('button', { name: /Issued Revenue MTD/i }).click();
    const dialog = page.getByTestId('evaluations-breakdown-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Revenue MTD breakdown' })).toBeVisible();

    const dayButton = dialog.getByRole('button').filter({ hasText: /invoice/i }).first();
    await dayButton.click();
    await expect(dialog.getByText('Mietrechnung').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('drill-down: expenses KPI opens expense breakdown', async ({ page }) => {
    await openEvaluationsPage(page, { profile: 'full-org' });
    await page.getByRole('button', { name: /Expenses MTD/i }).click();
    await expect(page.getByRole('heading', { name: 'Expenses MTD breakdown' })).toBeVisible();
    await expect(page.getByText('Werkstatt Nord')).toBeVisible();
  });

  test('comparison period: MoM snapshot shows previous-month delta', async ({ page }) => {
    await openEvaluationsPage(page, { profile: 'forecast-available' });
    await expect(page.getByText('Snapshot')).toBeVisible();
    await expect(page.getByText('MoM revenue')).toBeVisible();
    await expect(page.getByText('MoM expenses')).toBeVisible();
  });

  test('charts and table alternatives render together', async ({ page }) => {
    await openEvaluationsPage(page, { profile: 'full-org' });
    await expect(page.getByText('Daily Revenue & Expenses')).toBeVisible();
    await expect(page.getByText('Top customers (MTD)')).toBeVisible();
    await expect(page.getByText('Top vehicles (MTD)')).toBeVisible();
    await expect(page.getByText('Recent activity')).toBeVisible();
    await expect(page.locator('.recharts-responsive-container')).toBeVisible();
  });

  test('recommendations and misuse section show actionable copy', async ({ page }) => {
    await openEvaluationsPage(page, { profile: 'many-recommendations' });
    await expect(page.getByText('Empfohlene Maßnahmen')).toBeVisible();
    await expect(page.getByText(/Maßnahme \d+:/).first()).toBeVisible();
    await expect(page.getByText('Nutzungsauffälligkeiten')).toBeVisible();
  });

  test('grouped insight renders in business risks panel', async ({ page }) => {
    await openEvaluationsPage(page, { profile: 'grouped-insights' });
    await expect(page.getByRole('heading', { name: '3 Fahrzeuge ungenutzt' })).toBeVisible();
    await expect(page.getByText('Gruppiertes Unterauslastungs-Signal')).toBeVisible();
  });
});
