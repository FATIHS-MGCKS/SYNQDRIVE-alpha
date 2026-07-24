import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  openVehicleDetailRental,
  openVehicleFromFleet,
  vehicleDetailHeader,
  vehicleDetailTab,
} from './vehicle-detail-fixtures';

const mobileWidths = [
  { name: 'mobile-320', width: 320, height: 568 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-430', width: 430, height: 932 },
] as const;

test.describe('Vehicle Detail — responsive layouts', () => {
  test.beforeEach(({ }, testInfo) => {
    const allowed = new Set(['mobile-320', 'mobile-390', 'mobile-430', 'tablet-768', 'desktop-1280']);
    test.skip(!allowed.has(testInfo.project.name), 'Responsive specs use dedicated viewport projects');
  });

  for (const vp of mobileWidths) {
    test(`25 — ${vp.name}: vehicle detail fits without horizontal overflow`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== vp.name, `Runs on ${vp.name} project only`);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openVehicleDetailRental(page);
      await openVehicleFromFleet(page, 'VD-LIVE');
      await assertNoHorizontalOverflow(page);
      await expect(vehicleDetailHeader(page)).toBeVisible();
      await expect(vehicleDetailTab(page, 'Overview')).toBeVisible();
    });
  }

  test('26 — tablet: tabs and header remain usable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet-768', 'Runs on tablet-768 project only');
    await page.setViewportSize({ width: 768, height: 1024 });
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await assertNoHorizontalOverflow(page);
    await vehicleDetailTab(page, 'Health').click();
    await expect(vehicleDetailTab(page, 'Health')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to Fleet' })).toBeVisible();
  });

  test('27 — landscape mobile: overview map and header stay visible', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await assertNoHorizontalOverflow(page);
    await expect(vehicleDetailHeader(page)).toBeVisible();
    await expect(page.locator('section[aria-label="Live vehicle status"]')).toBeVisible();
  });
});
