import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  assertNoVisibleUuids,
  fleetRowByPlate,
  fleetTabButton,
  openFleetOperationalFleetPage,
  openFleetOperationalRental,
} from './fleet-operational-fixtures';

const ARTIFACT_VIEWPORTS = ['mobile-375', 'tablet-768', 'desktop-1280'] as const;

test.describe('Vehicle Operational State V2 — responsive & themes', () => {
  test('fleet command: layout, dark mode, no UUIDs', async ({ page }, testInfo) => {
    await openFleetOperationalFleetPage(page, { theme: 'light' });

    await expect(page.getByText('Fleet Command')).toBeVisible();
    await expect(fleetTabButton(page, /Available/)).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertNoVisibleUuids(page);

    if (ARTIFACT_VIEWPORTS.includes(testInfo.project.name as (typeof ARTIFACT_VIEWPORTS)[number])) {
      await page.screenshot({
        path: `playwright-report/fleet-op-list-${testInfo.project.name}.png`,
        fullPage: true,
      });
    }

    await page.getByRole('button', { name: 'Design: Hell' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await fleetTabButton(page, /Unknown/).click();
    await expect(fleetRowByPlate(page, 'UNK-1')).toBeVisible();
  });

  test('long German booking supplement remains readable', async ({ page }) => {
    await openFleetOperationalFleetPage(page);
    await page.getByLabel('With future booking').check();
    await fleetTabButton(page, /Available/).click();

    const futRow = fleetRowByPlate(page, 'FUT-1');
    await expect(futRow).toBeVisible();
    const box = await futRow.boundingBox();
    const viewport = page.viewportSize();
    expect(box?.width ?? 0).toBeLessThanOrEqual((viewport?.width ?? 1280) + 1);
    await expect(page.getByText(/Nächste Buchung/i)).toBeVisible();
  });

  test('dashboard KPI strip fits narrow viewports', async ({ page }) => {
    await openFleetOperationalRental(page);
    await expect(page.getByText('Bereit zur Vermietung')).toBeVisible({ timeout: 25_000 });
    await assertNoHorizontalOverflow(page);
    await assertNoVisibleUuids(page);
  });

  test('unknown status uses neutral copy on all breakpoints', async ({ page }) => {
    await openFleetOperationalFleetPage(page);
    await fleetTabButton(page, /Unknown/).click();
    await expect(page.getByText('Status nicht verfügbar').first()).toBeVisible();
    await expect(page.getByText('Unbekannt', { exact: true })).toHaveCount(0);
  });
});
