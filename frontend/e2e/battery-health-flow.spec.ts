import { expect, test } from '@playwright/test';

import {
  batteryHealthDetailRoot,
  getBatterySummaryFetchCount,
  openBatteryHealthRental,
  openBatteryHealthTab,
} from './battery-health-fixtures';

test.describe('Battery Health V2 — health tab flows', () => {
  test.describe.configure({ mode: 'serial', timeout: 60_000 });

  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Battery flow specs run on desktop-1280 only');
  });

  test('1 — LV summary shows 12V health without SOH label', async ({ page }) => {
    await openBatteryHealthRental(page, { profile: 'ice-lv-stable' });
    await openBatteryHealthTab(page);

    await expect(page.getByText('12V-Batterie').first()).toBeVisible();
    await expect(page.getByText('Geschätzter 12V-Batteriezustand').first()).toBeVisible();
    await expect(page.getByText('12.48 V').first()).toBeVisible();
    await expect(page.getByText('12.62 V').first()).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).not.toMatch(/\blv[^\n]*soh\b/);
  });

  test('2 — stale observation shows aged live context on battery tab', async ({ page }) => {
    await openBatteryHealthRental(page, { profile: 'ice-lv-stale' });
    await openBatteryHealthTab(page, 'ice-lv-stale');

    await expect(page.getByText(/vor\s+\d+\s+Std\./).first()).toBeVisible();
  });

  test('3 — start-proxy profile shows Proxy chip on battery tab', async ({ page }) => {
    await openBatteryHealthRental(page, { profile: 'ice-lv-proxy' });
    await openBatteryHealthTab(page, 'ice-lv-proxy');

    await expect(page.getByText('Proxy-Messung').first()).toBeVisible();
  });

  test('4 — EV battery tab keeps 12V label without LV SOH wording', async ({ page }) => {
    await openBatteryHealthRental(page, { profile: 'ev-hv-provider' });
    await openBatteryHealthTab(page, 'ev-hv-provider');

    await expect(page.getByText('12V-Batterie').first()).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).not.toMatch(/\b12v[^\n]*soh\b/);
  });

  test('5 — API error surfaces retry and refetch on health tab', async ({ page }) => {
    await openBatteryHealthRental(page, { profile: 'summary-error' });
    const summaryResponse = page.waitForResponse(
      (res) => res.url().includes('/battery-health-summary') && res.status() === 503,
    );
    await openBatteryHealthTab(page, 'ice-lv-stable', { expectContent: false });
    await summaryResponse;

    const detailPanel = batteryHealthDetailRoot(page);
    const alert = detailPanel.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(alert.getByRole('button', { name: 'Erneut laden' })).toBeVisible();

    const before = getBatterySummaryFetchCount();
    await alert.getByRole('button', { name: 'Erneut laden' }).click();
    await expect.poll(() => getBatterySummaryFetchCount()).toBeGreaterThan(before);
  });
});
