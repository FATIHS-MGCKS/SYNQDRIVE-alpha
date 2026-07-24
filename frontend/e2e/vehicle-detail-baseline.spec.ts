import { expect, test } from '@playwright/test';

import {
  VEHICLE_DETAIL_TAB_KEYS_EXPORT,
  VEHICLE_DETAIL_TAB_LABELS_EXPORT,
  assertNoHorizontalOverflow,
  assertNoVisibleUuids,
  expectVehicleDetailTabs,
  fleetRowByPlate,
  fleetTabButton,
  openVehicleDetailBaselineFleetPage,
  openVehicleDetailBaselineRental,
  openVehicleDetailFromFleet,
  vehicleDetailTab,
} from './vehicle-detail-baseline-fixtures';

test.describe('Vehicle Detail Page — baseline E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test('open-detail: fleet → Open → overview shell with 8 tabs', async ({ page }) => {
    await openVehicleDetailBaselineFleetPage(page);
    await openVehicleDetailFromFleet(page, 'AVL-1');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('VW');
    await expect(page.getByText('AVL-1', { exact: true }).first()).toBeVisible();
    await expectVehicleDetailTabs(page);
    await assertNoVisibleUuids(page);
  });

  test('tab-switch: all vehicle detail tabs are reachable', async ({ page }) => {
    await openVehicleDetailBaselineFleetPage(page);
    await openVehicleDetailFromFleet(page, 'AVL-1');

    for (const tab of VEHICLE_DETAIL_TAB_KEYS_EXPORT) {
      const label = VEHICLE_DETAIL_TAB_LABELS_EXPORT[tab];
      await vehicleDetailTab(page, label).click();
      await expect(vehicleDetailTab(page, label)).toBeVisible();
    }
  });

  test('vehicle-switch: open AVL-1, back to fleet, open ACT-1', async ({ page }) => {
    await openVehicleDetailBaselineFleetPage(page);
    await openVehicleDetailFromFleet(page, 'AVL-1');
    await expect(page.getByText('AVL-1', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Back to Fleet' }).first().click();
    await expect(page.getByText('Fleet Command')).toBeVisible({ timeout: 15_000 });

    await fleetTabButton(page, /Active Rented/).click();
    await openVehicleDetailFromFleet(page, 'ACT-1');
    await expect(page.getByText('ACT-1', { exact: true }).first()).toBeVisible();
  });

  test('status-display: unknown operational status shows neutral copy', async ({ page }) => {
    await openVehicleDetailBaselineFleetPage(page);
    await fleetTabButton(page, /Unknown/).click();
    await expect(fleetRowByPlate(page, 'UNK-1')).toBeVisible();
    await openVehicleDetailFromFleet(page, 'UNK-1');
    await expect(page.getByText('Status nicht verfügbar').first()).toBeVisible();
  });

  test('read-only-role: detail shell renders for viewer permissions', async ({ page }) => {
    await openVehicleDetailBaselineFleetPage(page, { readOnly: true });
    await openVehicleDetailFromFleet(page, 'AVL-1');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectVehicleDetailTabs(page);
    await assertNoVisibleUuids(page);
  });
});

test.describe('Vehicle Detail Page — responsive baseline', () => {
  test('mobile-viewport: detail header and tabs fit without horizontal overflow', async ({
    page,
  }, testInfo) => {
    test.skip(
      !['mobile-375', 'mobile-390', 'tablet-768'].includes(testInfo.project.name),
      'responsive baseline runs on mobile/tablet projects only',
    );

    await openVehicleDetailBaselineFleetPage(page);
    await openVehicleDetailFromFleet(page, 'AVL-1');

    await assertNoHorizontalOverflow(page);
    await expect(vehicleDetailTab(page, 'Overview')).toBeVisible();

    if (testInfo.project.name === 'mobile-375') {
      await page.screenshot({
        path: 'playwright-report/vehicle-detail-baseline-mobile-375.png',
        fullPage: true,
      });
    }
  });
});
