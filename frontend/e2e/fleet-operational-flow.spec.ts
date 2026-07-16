import { expect, test } from '@playwright/test';

import {
  assertNoVisibleUuids,
  fleetRowByPlate,
  fleetTabButton,
  getFleetMapFetchCount,
  openFleetOperationalFleetPage,
  openFleetOperationalRental,
  simulatePickupForReservedVehicle,
  simulateReturnForActiveVehicle,
} from './fleet-operational-fixtures';

test.describe('Vehicle Operational State V2 — fleet & dashboard flows', () => {
  test.describe.configure({ mode: 'serial' });

  test('1 — fleet list: tabs, counts, and status rows', async ({ page }) => {
    test.setTimeout(120_000);
    await openFleetOperationalFleetPage(page);

    await expect(page.getByText('Fleet Command')).toBeVisible();
    await expect(fleetRowByPlate(page, 'AVL-1')).toBeVisible();
    await expect(fleetRowByPlate(page, 'FUT-1')).toBeVisible();
    await expect(fleetRowByPlate(page, 'RSV-1')).toHaveCount(0);

    await fleetTabButton(page, /Reserved/).click();
    await expect(fleetRowByPlate(page, 'RSV-1')).toBeVisible();
    await expect(fleetRowByPlate(page, 'AVL-1')).toHaveCount(0);

    await fleetTabButton(page, /Active Rented/).click();
    await expect(fleetRowByPlate(page, 'ACT-1')).toBeVisible();

    await fleetTabButton(page, /Unknown/).click();
    await expect(fleetRowByPlate(page, 'UNK-1')).toBeVisible();
    await expect(page.getByText('Status nicht verfügbar').first()).toBeVisible();

    await fleetTabButton(page, /Available/).click();
  });

  test('2 — fleet map: legend, filter, unknown neutral', async ({ page }) => {
    await openFleetOperationalFleetPage(page);

    await expect(page.getByText('Fleet Map')).toBeVisible();
    await page.getByRole('button', { name: /Legend/i }).click();
    await expect(page.getByText('Available', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Reserved', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Active Rented', { exact: true }).first()).toBeVisible();

    await fleetTabButton(page, /Unknown/).click();
    await fleetRowByPlate(page, 'UNK-1').click();
    await expect(page.getByText('Status nicht verfügbar').first()).toBeVisible();
  });

  test('3 — vehicle detail: operational status without UUIDs', async ({ page }) => {
    await openFleetOperationalFleetPage(page);
    await fleetTabButton(page, /Unknown/).click();

    const fleetPanel = page
      .locator('.surface-premium.rounded-2xl')
      .filter({ hasText: 'Fleet Command' });
    await expect(fleetPanel.getByText('UNK-1', { exact: true })).toBeVisible();
    await expect(fleetPanel.getByText('Status nicht verfügbar').first()).toBeVisible();
    await assertNoVisibleUuids(page);
  });

  test('4 — dashboard: KPI counts and drawer parity', async ({ page }) => {
    await openFleetOperationalRental(page);
    await expect(page.getByText('Bereit zur Vermietung')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('Heutige Operationen')).toBeVisible();

    await page.getByRole('button', { name: /Bereit zur Vermietung/i }).click();
    await expect(page.getByText('AVL-1')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('UNK-1')).toHaveCount(0);

    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /aktive Vermietungen/i }).click();
    await expect(page.getByText('ACT-1')).toBeVisible({ timeout: 15_000 });
  });

  test('5 — cache: pickup updates fleet surfaces without reload', async ({ page }) => {
    await openFleetOperationalFleetPage(page);
    const beforeFetches = getFleetMapFetchCount();

    await fleetTabButton(page, /Reserved/).click();
    await expect(fleetRowByPlate(page, 'RSV-1')).toBeVisible();

    simulatePickupForReservedVehicle();
    await page.getByRole('button', { name: /Refresh now/i }).click();

    await fleetTabButton(page, /Active Rented/).click();
    await expect(fleetRowByPlate(page, 'RSV-1')).toBeVisible({ timeout: 15_000 });
    await fleetTabButton(page, /Reserved/).click();
    await expect(fleetRowByPlate(page, 'RSV-1')).toHaveCount(0);

    expect(getFleetMapFetchCount()).toBeGreaterThan(beforeFetches);
  });

  test('6 — cache: return updates active vehicle to available', async ({ page }) => {
    await openFleetOperationalFleetPage(page);

    await fleetTabButton(page, /Active Rented/).click();
    await expect(fleetRowByPlate(page, 'ACT-1')).toBeVisible();

    simulateReturnForActiveVehicle();
    await page.getByRole('button', { name: /Refresh now/i }).click();

    await fleetTabButton(page, /Available/).click();
    await expect(fleetRowByPlate(page, 'ACT-1')).toBeVisible({ timeout: 15_000 });
    await fleetTabButton(page, /Active Rented/).click();
    await expect(fleetRowByPlate(page, 'ACT-1')).toHaveCount(0);
  });

  test('7 — future booking filter keeps Available tab semantics', async ({ page }) => {
    await openFleetOperationalFleetPage(page);
    await page.getByLabel('With future booking').check();
    await fleetTabButton(page, /Available/).click();
    await expect(fleetRowByPlate(page, 'FUT-1')).toBeVisible();
    await expect(fleetRowByPlate(page, 'AVL-1')).toHaveCount(0);
  });
});
