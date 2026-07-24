import { expect, test } from '@playwright/test';

import {
  applyTextZoom200,
  assertNoHorizontalOverflow,
  captureVehicleDetailScreenshot,
  clickVehicleDetailTab,
  openVehicleDetailOverview,
  injectLongHeaderMeta,
  setLandscapeViewport,
  vehicleDetailTab,
  VEHICLE_DETAIL_MOBILE_PROJECTS,
  VEHICLE_DETAIL_MOBILE_SCREENSHOT_PROJECTS,
  VEHICLE_DETAIL_TAB_KEYS_EXPORT,
  VEHICLE_DETAIL_TAB_LABELS_EXPORT,
} from './vehicle-detail-mobile-fixtures';

test.describe('Vehicle Detail Page — mobile readiness', () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !VEHICLE_DETAIL_MOBILE_PROJECTS.includes(
        testInfo.project.name as (typeof VEHICLE_DETAIL_MOBILE_PROJECTS)[number],
      ),
      'mobile readiness suite runs on mobile/tablet/landscape projects only',
    );
  });

  test('overview: no horizontal overflow, header and tabs visible', async ({ page }, testInfo) => {
    await openVehicleDetailOverview(page);
    await assertNoHorizontalOverflow(page);

    await expect(page.getByTestId('vehicle-detail-header')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Vehicle detail tabs' })).toBeVisible();

    if (
      VEHICLE_DETAIL_MOBILE_SCREENSHOT_PROJECTS.includes(
        testInfo.project.name as (typeof VEHICLE_DETAIL_MOBILE_SCREENSHOT_PROJECTS)[number],
      )
    ) {
      await captureVehicleDetailScreenshot(page, testInfo.project.name, 'overview');
    }
  });

  test('all tabs: reachable without page-level horizontal overflow', async ({ page }, testInfo) => {
    for (const tab of VEHICLE_DETAIL_TAB_KEYS_EXPORT) {
      await openVehicleDetailOverview(page);
      const label = VEHICLE_DETAIL_TAB_LABELS_EXPORT[tab];
      await clickVehicleDetailTab(page, label);
      await assertNoHorizontalOverflow(page);
    }

    if (testInfo.project.name === 'mobile-375') {
      await openVehicleDetailOverview(page);
      await clickVehicleDetailTab(page, 'Bookings');
      await captureVehicleDetailScreenshot(page, testInfo.project.name, 'bookings');
    }
  });

  test('long license plate and station truncate without page overflow', async ({ page }) => {
    await openVehicleDetailOverview(page);
    await injectLongHeaderMeta(page);
    await assertNoHorizontalOverflow(page);
    await expect(page.getByTestId('vehicle-detail-license')).toHaveClass(/truncate/);
    await expect(page.getByTestId('vehicle-detail-station')).toHaveClass(/truncate/);
  });

  test('touch targets: back button and tab triggers meet 44px minimum on narrow widths', async ({
    page,
  }) => {
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width >= 640, 'touch target check on sub-sm viewports only');

    await openVehicleDetailOverview(page);

    const backButton = page
      .getByTestId('vehicle-detail-header')
      .locator('button.sm\\:hidden')
      .first();
    const backBox = await backButton.boundingBox();
    expect(backBox?.height ?? 0).toBeGreaterThanOrEqual(42);
    expect(backBox?.width ?? 0).toBeGreaterThanOrEqual(42);

    const overviewTab = vehicleDetailTab(page, 'Overview');
    await overviewTab.scrollIntoViewIfNeeded();
    const tabBox = await overviewTab.boundingBox();
    expect(tabBox?.height ?? 0).toBeGreaterThanOrEqual(42);
  });

  test('trips filters: horizontal scroll row does not widen the page', async ({ page }, testInfo) => {
    await openVehicleDetailOverview(page);
    await vehicleDetailTab(page, 'Trips').click();
    await assertNoHorizontalOverflow(page);

    if (testInfo.project.name === 'mobile-320') {
      await captureVehicleDetailScreenshot(page, testInfo.project.name, 'trips-filters');
    }
  });

  test('200% text zoom: overview remains within viewport width', async ({ page }) => {
    await openVehicleDetailOverview(page);
    await applyTextZoom200(page);
    await assertNoHorizontalOverflow(page);
    await expect(page.getByTestId('vehicle-detail-view')).toBeVisible();
  });

  test('landscape: overview fits without horizontal overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'landscape-375', 'landscape-only case');
    await setLandscapeViewport(page);
    await openVehicleDetailOverview(page);
    await assertNoHorizontalOverflow(page);
    await captureVehicleDetailScreenshot(page, 'landscape-375', 'overview-landscape');
  });
});
