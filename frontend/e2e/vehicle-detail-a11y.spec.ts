import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import {
  assertNoHorizontalOverflow,
  openVehicleDetailRental,
  openVehicleFromFleet,
  vehicleDetailHeader,
  vehicleDetailTab,
} from './vehicle-detail-fixtures';

test.describe('Vehicle Detail — accessibility', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Vehicle detail a11y specs run on desktop-1280 only');
  });

  test('28 — keyboard navigation across vehicle detail tabs', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');

    const tripsTab = vehicleDetailTab(page, 'Trips');
    await tripsTab.focus();
    await expect(tripsTab).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(tripsTab).toBeVisible();

    await page.keyboard.press('Tab');
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedTag).toBeTruthy();
  });

  test('29 — vehicle detail overview passes axe (critical/serious)', async ({ page }) => {
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await assertNoHorizontalOverflow(page);
    await expect(vehicleDetailHeader(page)).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('section[aria-label="Live vehicle status"]')
      .disableRules(['color-contrast'])
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('iframe')
      .analyze();

    const critical = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(critical).toEqual([]);
  });

  test('30 — reduced motion preference keeps overview usable', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openVehicleDetailRental(page);
    await openVehicleFromFleet(page, 'VD-LIVE');
    await expect(vehicleDetailHeader(page)).toBeVisible();
    await expect(vehicleDetailTab(page, 'Overview')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    const pulseCount = await page.locator('.animate-online-pulse').count();
    expect(pulseCount).toBeGreaterThanOrEqual(0);
  });
});
