import { expect, test } from '@playwright/test';

import {
  FOREIGN_ORG_ID,
  backToFleet,
  confirmCleaningNeedsCleaning,
  expectMapboxFallbackOrMap,
  expectNoPositionOverview,
  expectTelemetryPollingStalled,
  getTelemetryFetchCount,
  openAllVehicleDetailTabs,
  openCleaningDropdown,
  openVehicleBySearch,
  openVehicleDetailRental,
  openVehicleFromFleet,
  vehicleDetailApiRequest,
  vehicleDetailHeader,
  vehicleDetailOverview,
  vehicleDetailTab,
  visibleLiveBadge,
  waitForTelemetryPolls,
} from './vehicle-detail-fixtures';

test.describe('Vehicle Detail — flows (mocked API)', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Vehicle detail flow specs run on desktop-1280 only');
  });

  test('1 — open vehicle detail from Fleet', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await expect(page.getByText('VD-LIVE', { exact: true }).first()).toBeVisible();
    await expect(vehicleDetailTab(page, 'Overview')).toBeVisible();
  });

  test('2 — open vehicle detail via top-bar search (direct entry)', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleBySearch(page, 'VD-LIVE');
    await expect(vehicleDetailHeader(page)).toBeVisible();
    await expect(page.getByText('VD-LIVE', { exact: true }).first()).toBeVisible();
  });

  test('3 — reload keeps vehicle detail context', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('button', { name: /^(Dashboard|Übersicht)$/ }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await openVehicleBySearch(page, 'VD-LIVE');
    await expect(vehicleDetailHeader(page)).toBeVisible();
  });

  test('4 — back to fleet and re-open detail', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await backToFleet(page);
    await openVehicleBySearch(page, 'VD-LIVE');
    await expect(vehicleDetailHeader(page)).toBeVisible();
  });

  test('5 — switch between vehicles', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await expect(page.getByText('VD-LIVE', { exact: true }).first()).toBeVisible();
    await backToFleet(page);
    await openVehicleFromFleet(page, 'VD-SEC');
    await expect(page.getByText('VD-SEC', { exact: true }).first()).toBeVisible();
  });

  test('6 — all vehicle detail tabs render', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await openAllVehicleDetailTabs(page);
    await vehicleDetailTab(page, 'Overview').click();
    await expect(vehicleDetailOverview(page)).toBeVisible();
  });

  test('7 — cleaning status mutation succeeds', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await openCleaningDropdown(page);
    await page.getByRole('button', { name: 'Needs Cleaning', exact: true }).click();
    await confirmCleaningNeedsCleaning(page);
    await expect(page.getByRole('button', { name: 'Needs Cleaning', exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('8 — cleaning status mutation surfaces API error', async ({ page }) => {
    await openVehicleDetailRental(page, { profile: 'status-patch-fail' });
    await openVehicleFromFleet(page, 'VD-LIVE');
    await openCleaningDropdown(page);
    await page.getByRole('button', { name: 'Needs Cleaning', exact: true }).click();
    await confirmCleaningNeedsCleaning(page);
    await expect(
      page.getByText(/Reinigungsstatus konnte nicht gespeichert werden|Missing permission: fleet\.write/i).first(),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test('9 — cleaning status can be set back to Clean', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await openCleaningDropdown(page);
    await page.getByRole('button', { name: 'Needs Cleaning', exact: true }).click();
    await confirmCleaningNeedsCleaning(page);
    await page.getByRole('button', { name: 'Needs Cleaning', exact: true }).first().click();
    const cleanOption = page.locator('.sq-overlay').getByRole('button', { name: 'Clean', exact: true });
    await expect(cleanOption).toBeVisible({ timeout: 10_000 });
    await cleanOption.click({ force: true });
    await expect(page.getByRole('button', { name: 'Clean', exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('10 — read-only role blocks cleaning PATCH', async ({ page }) => {
    await openVehicleDetailRental(page, { profile: 'read-only' });
    await openVehicleFromFleet(page, 'VD-LIVE');
    await openCleaningDropdown(page);
    await page.getByRole('button', { name: 'Needs Cleaning', exact: true }).click();
    await confirmCleaningNeedsCleaning(page);
    await expect(
      page.getByText(/Reinigungsstatus konnte nicht gespeichert werden|Missing permission: fleet\.write/i).first(),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test('11 — foreign organization API access is blocked', async ({ page }) => {
    await openVehicleDetailRental(page, { profile: 'foreign-org' });
    const response = await vehicleDetailApiRequest(
      page,
      `/api/v1/organizations/${FOREIGN_ORG_ID}/vehicles/veh-foreign/telemetry`,
    );
    expect(response.status).toBe(403);
  });

  test('12 — live position badge on overview map', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await waitForTelemetryPolls(1);
    await expect(visibleLiveBadge(page)).toBeVisible({ timeout: 20_000 });
    await expectMapboxFallbackOrMap(page);
  });

  test('13 — standby telemetry freshness in header badge', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-STBY');
    await waitForTelemetryPolls(1);
    await expect(page.getByText('Standby', { exact: true }).locator('visible=true').first()).toBeVisible({ timeout: 20_000 });
  });

  test('14 — soft-offline (signal delayed) badge', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-DLY');
    await waitForTelemetryPolls(1);
    await expect(page.getByText(/Delayed|Verzögert/i).locator('visible=true').first()).toBeVisible({ timeout: 20_000 });
  });

  test('15 — offline telemetry badge', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-OFF');
    await waitForTelemetryPolls(1);
    await expect(page.getByText('Offline', { exact: true }).locator('visible=true').first()).toBeVisible({ timeout: 20_000 });
  });

  test('16 — last known position on map', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LAST');
    await waitForTelemetryPolls(1);
    await expectMapboxFallbackOrMap(page);
    await expect(
      page
        .getByText(/Last known position shown|Last known/i)
        .locator('visible=true')
        .first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('17 — no position empty state', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-NPOS');
    await waitForTelemetryPolls(1);
    await expectNoPositionOverview(page);
  });

  test('18 — missing telemetry values render placeholders', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-NULL');
    await waitForTelemetryPolls(1);
    await expect(page.getByRole('img', { name: /Tires:\s*[—-]/ }).first()).toBeVisible({ timeout: 20_000 });

    await openVehicleDetailRental(page, { profile: 'telemetry-error' });
    await openVehicleFromFleet(page, 'VD-LIVE');
    await waitForTelemetryPolls(1);
    await expect(
      page.getByText(/Telemetry temporarily unavailable|Signal issue/i).first(),
    ).toBeVisible({
      timeout: 20_000,
    });
  });

  test('19 — true zero telemetry values render as zero', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-ZERO');
    await waitForTelemetryPolls(1);
    const overview = vehicleDetailOverview(page);
    await expect(overview.getByText('0', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(overview.getByText('0', { exact: true }).nth(1)).toBeVisible();
  });

  test('20 — device connection loading, error, and empty states', async ({ page }) => {
    await openVehicleDetailRental(page, { profile: 'device-loading' });
    await openVehicleFromFleet(page, 'VD-DEV');
    await expect(page.locator('.animate-pulse.h-28').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Konnektivität')).toBeVisible({ timeout: 15_000 });

    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-DERR');
    await waitForTelemetryPolls(1);
    await expect(page.getByText('Konnektivität')).toHaveCount(0);

    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-DEMP');
    await waitForTelemetryPolls(1);
    await expect(page.getByText('Konnektivität')).toHaveCount(0);
  });

  test('21 — Mapbox provider error keeps safe loading fallback', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await waitForTelemetryPolls(1);
    const tokenMissing = await page.getByText('Mapbox token not configured').isVisible().catch(() => false);
    if (tokenMissing) {
      await expect(page.getByText('Mapbox token not configured').first()).toBeVisible();
      return;
    }

    await page.route('**/api.mapbox.com/**', (route) => route.abort('failed'));
    await page.reload({ waitUntil: 'load' });
    await openVehicleBySearch(page, 'VD-LIVE');
    await waitForTelemetryPolls(1);
    await expect(page.getByText('Loading map...').first()).toBeVisible({ timeout: 20_000 });
  });

  test('22 — missing Mapbox token or map fallback in test environment', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await waitForTelemetryPolls(1);
    await expectMapboxFallbackOrMap(page);
  });

  test('23 — telemetry polling stops outside vehicle detail', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await waitForTelemetryPolls(1);
    const countBeforeLeave = getTelemetryFetchCount();
    await backToFleet(page);
    await expectTelemetryPollingStalled(countBeforeLeave, 8_000);
  });

  test('24 — background tab: detail remains stable (best effort)', async ({ page, context }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await waitForTelemetryPolls(1);
    const background = await context.newPage();
    await openVehicleDetailRental(background);
    await background.getByRole('button', { name: /^(Dashboard|Übersicht)$/ }).first().waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    await page.waitForTimeout(4_000);
    await page.bringToFront();
    await expect(vehicleDetailHeader(page)).toBeVisible();
    await background.close();
  });
});
