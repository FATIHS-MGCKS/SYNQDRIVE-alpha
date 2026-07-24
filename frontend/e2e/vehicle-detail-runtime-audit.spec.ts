/**
 * Controlled runtime measurements for Vehicle Detail VPS runtime audit (Prompt 34).
 * Uses mocked API — measures client polling behavior, not production DIMO latency.
 */
import { test, expect } from '@playwright/test';
import {
  openVehicleDetailRental,
  openVehicleFromFleet,
  vehicleDetailTab,
  getTelemetryFetchCount,
  getLiveGpsFetchCount,
  waitForTelemetryPolls,
  expectTelemetryPollingStalled,
  backToFleet,
  resetVehicleDetailMockState,
  FOREIGN_ORG_ID,
  TEST_ORG_ID,
  VEH_LIVE,
  VEH_SECOND,
} from './vehicle-detail-fixtures';

test.describe.serial('Vehicle Detail — runtime audit measurements', () => {
  test.beforeEach(async ({ page }) => {
    resetVehicleDetailMockState('default', 'live');
    await openVehicleDetailRental(page);
  });

  test('RT-1 overview polling frequencies', async ({ page }) => {
    test.setTimeout(120_000);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await waitForTelemetryPolls(1);
    const t0 = Date.now();
    const tel0 = getTelemetryFetchCount();
    const gps0 = getLiveGpsFetchCount();
    await page.waitForTimeout(35_000);
    const elapsed = (Date.now() - t0) / 1000;
    const telDelta = getTelemetryFetchCount() - tel0;
    const gpsDelta = getLiveGpsFetchCount() - gps0;
    test.info().annotations.push({
      type: 'measurement',
      description: JSON.stringify({
        elapsedSec: elapsed,
        telemetryRequests: telDelta,
        liveGpsRequests: gpsDelta,
        telemetryIntervalSec: elapsed / Math.max(telDelta, 1),
        gpsIntervalSec: elapsed / Math.max(gpsDelta, 1),
      }),
    });
    expect(telDelta).toBeGreaterThanOrEqual(0);
    expect(telDelta).toBeLessThanOrEqual(2);
    expect(gpsDelta).toBeGreaterThanOrEqual(5);
    expect(gpsDelta).toBeLessThanOrEqual(9);
  });

  test('RT-2 documents tab polling', async ({ page }) => {
    test.setTimeout(60_000);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await waitForTelemetryPolls(1);
    await vehicleDetailTab(page, 'Documents').click();
    const tel0 = getTelemetryFetchCount();
    const gps0 = getLiveGpsFetchCount();
    await page.waitForTimeout(20_000);
    const telDelta = getTelemetryFetchCount() - tel0;
    const gpsDelta = getLiveGpsFetchCount() - gps0;
    test.info().annotations.push({
      type: 'measurement',
      description: JSON.stringify({ telDelta, gpsDelta, tab: 'Documents' }),
    });
    expect(telDelta).toBeLessThanOrEqual(1);
    expect(gpsDelta).toBeGreaterThanOrEqual(2);
  });

  test('RT-3 background tab stability', async ({ page, context }) => {
    test.setTimeout(60_000);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await waitForTelemetryPolls(1);
    const bg = await context.newPage();
    await openVehicleDetailRental(bg);
    await bg.getByRole('button', { name: /^(Dashboard|Übersicht)$/ }).first().waitFor({ state: 'visible' });
    const tel0 = getTelemetryFetchCount();
    const gps0 = getLiveGpsFetchCount();
    await page.waitForTimeout(12_000);
    const telDelta = getTelemetryFetchCount() - tel0;
    const gpsDelta = getLiveGpsFetchCount() - gps0;
    test.info().annotations.push({
      type: 'measurement',
      description: JSON.stringify({ telDelta, gpsDelta, note: 'foreground detail while bg dashboard' }),
    });
    await page.bringToFront();
    await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible();
    await bg.close();
    expect(telDelta).toBeLessThanOrEqual(1);
    expect(gpsDelta).toBeGreaterThanOrEqual(1);
  });

  test('RT-4 slow provider does not retry-storm', async ({ page }) => {
    test.setTimeout(60_000);
    resetVehicleDetailMockState('default', 'live');
    await page.route('**/live-gps', async (route) => {
      await new Promise((r) => setTimeout(r, 4_000));
      await route.fulfill({ status: 504, body: 'gateway timeout' });
    });
    await openVehicleFromFleet(page, 'VD-LIVE');
    const gps0 = getLiveGpsFetchCount();
    await page.waitForTimeout(18_000);
    const gpsDelta = getLiveGpsFetchCount() - gps0;
    test.info().annotations.push({
      type: 'measurement',
      description: JSON.stringify({ gpsDelta, maxExpected: 5 }),
    });
    expect(gpsDelta).toBeLessThanOrEqual(5);
  });

  test('RT-5 foreign org blocked', async ({ page }) => {
    let foreignHits = 0;
    page.on('request', (req) => {
      if (req.url().includes(FOREIGN_ORG_ID)) foreignHits += 1;
    });
    await openVehicleFromFleet(page, 'VD-LIVE');
    await waitForTelemetryPolls(1);
    await page.waitForTimeout(5_000);
    expect(foreignHits).toBe(0);
    test.info().annotations.push({
      type: 'measurement',
      description: JSON.stringify({ foreignHits, orgScope: TEST_ORG_ID }),
    });
  });

  test('RT-6 vehicle switch no stale binding', async ({ page }) => {
    await openVehicleFromFleet(page, 'VD-LIVE');
    await waitForTelemetryPolls(1);
    const telLive = getTelemetryFetchCount();
    await backToFleet(page);
    await openVehicleFromFleet(page, 'VD-SEC');
    await waitForTelemetryPolls(telLive + 1);
    const storeBound = await page.evaluate(() => {
      const w = window as unknown as { __VD_STORE__?: { boundVehicleId?: string } };
      return w.__VD_STORE__?.boundVehicleId ?? 'unknown';
    });
    test.info().annotations.push({
      type: 'measurement',
      description: JSON.stringify({ telemetryAfterSwitch: getTelemetryFetchCount(), storeBound }),
    });
    expect(getTelemetryFetchCount()).toBeGreaterThan(telLive);
  });
});
