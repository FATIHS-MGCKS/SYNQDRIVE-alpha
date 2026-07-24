import { expect, test } from '@playwright/test';

import {
  VEHICLE_DETAIL_TAB_LABELS_EXPORT,
  fleetTabButton,
  openVehicleDetailBaselineFleetPage,
  openVehicleDetailDeepLink,
  openVehicleDetailFromFleet,
  vehicleDetailTab,
} from './vehicle-detail-baseline-fixtures';
import { VEH_AVAILABLE, VEH_ACTIVE } from './fleet-operational-fixtures';

test.describe('Vehicle Detail Page — URL sync', () => {
  test.describe.configure({ mode: 'serial', timeout: 60_000 });

  test('fleet open writes vehicleId to URL', async ({ page }) => {
    await openVehicleDetailBaselineFleetPage(page);
    await openVehicleDetailFromFleet(page, 'AVL-1');

    expect(page.url()).toContain(`vehicleId=${encodeURIComponent(VEH_AVAILABLE)}`);
    await expect(page.getByRole('button', { name: 'Back to Fleet' }).first()).toBeVisible();
  });

  test('reload preserves vehicle and tab from URL', async ({ page }) => {
    await openVehicleDetailBaselineFleetPage(page);
    await openVehicleDetailFromFleet(page, 'AVL-1');
    await vehicleDetailTab(page, VEHICLE_DETAIL_TAB_LABELS_EXPORT.trips).click();
    await expect(page.url()).toContain('vdTab=trips');

    await page.reload({ waitUntil: 'load' });
    await page
      .waitForResponse(
        (response) => response.url().includes('/fleet-map') && response.ok(),
        { timeout: 30_000 },
      )
      .catch(() => undefined);

    await expect(page.getByText('AVL-1', { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(vehicleDetailTab(page, VEHICLE_DETAIL_TAB_LABELS_EXPORT.trips)).toBeVisible({
      timeout: 20_000,
    });
    expect(page.url()).toContain(`vehicleId=${encodeURIComponent(VEH_AVAILABLE)}`);
    expect(page.url()).toContain('vdTab=trips');
  });

  test('cold deep-link opens vehicle and requested tab', async ({ page }) => {
    await openVehicleDetailDeepLink(page, VEH_AVAILABLE, 'trips');

    await expect(page.getByRole('button', { name: 'Back to Fleet' }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('AVL-1', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    expect(page.url()).toContain(`vehicleId=${encodeURIComponent(VEH_AVAILABLE)}`);
    expect(page.url()).toContain('vdTab=trips');
    await expect(vehicleDetailTab(page, VEHICLE_DETAIL_TAB_LABELS_EXPORT.trips)).toBeVisible({
      timeout: 20_000,
    });
  });

  test('browser back restores previous tab', async ({ page }) => {
    await openVehicleDetailBaselineFleetPage(page);
    await openVehicleDetailFromFleet(page, 'AVL-1');

    await vehicleDetailTab(page, VEHICLE_DETAIL_TAB_LABELS_EXPORT.trips).click();
    await expect(page.url()).toContain('vdTab=trips');

    await vehicleDetailTab(page, VEHICLE_DETAIL_TAB_LABELS_EXPORT.damages).click();
    await expect(page.url()).toContain('vdTab=damages');

    await page.goBack();
    await expect(page.url()).toContain('vdTab=trips');
    await expect(vehicleDetailTab(page, VEHICLE_DETAIL_TAB_LABELS_EXPORT.trips)).toBeVisible();

    await page.goBack();
    expect(page.url()).not.toContain('vdTab=');
  });

  test('invalid vehicleId shows fleet without opening first vehicle', async ({ page }) => {
    await openVehicleDetailDeepLink(page, 'missing-vehicle-id', 'overview');

    await expect(page.getByText('Fleet Command')).toBeVisible({ timeout: 20_000 });
    expect(page.url()).not.toContain('vehicleId=missing-vehicle-id');
    await expect(page.getByRole('button', { name: 'Back to Fleet' })).toHaveCount(0);
  });

  test('closing detail clears vehicle params from URL', async ({ page }) => {
    await openVehicleDetailBaselineFleetPage(page);
    await openVehicleDetailFromFleet(page, 'AVL-1');
    expect(page.url()).toContain(`vehicleId=${encodeURIComponent(VEH_AVAILABLE)}`);

    await page.getByRole('button', { name: 'Back to Fleet' }).first().click();
    await expect(page.getByText('Fleet Command')).toBeVisible({ timeout: 15_000 });
    expect(page.url()).not.toContain('vehicleId=');
  });

  test('vehicle switch updates URL vehicleId', async ({ page }) => {
    await openVehicleDetailBaselineFleetPage(page);
    await openVehicleDetailFromFleet(page, 'AVL-1');
    expect(page.url()).toContain(VEH_AVAILABLE);

    await page.getByRole('button', { name: 'Back to Fleet' }).first().click();
    await expect(page.getByText('Fleet Command')).toBeVisible({ timeout: 15_000 });

    await fleetTabButton(page, /Active Rented/).click();
    await openVehicleDetailFromFleet(page, 'ACT-1');
    await expect(page.getByText('ACT-1', { exact: true }).first()).toBeVisible();
    expect(page.url()).toContain(VEH_ACTIVE);
    expect(page.url()).not.toContain(VEH_AVAILABLE);
  });
});
