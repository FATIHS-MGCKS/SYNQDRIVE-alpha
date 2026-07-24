import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import {
  VEHICLE_DETAIL_TAB_ID,
  VEHICLE_DETAIL_TAB_PANEL_ID,
} from '../src/rental/lib/vehicle-detail-a11y';
import {
  applyTextZoom200,
  assertNoHorizontalOverflow,
  assertTouchTargetMinSize,
  expectVehicleDetailTabPanel,
  openVehicleDetailOverviewA11y,
  vehicleDetailTab,
} from './vehicle-detail-a11y-fixtures';

test.describe('Vehicle Detail — accessibility', () => {
  test('tablist exposes tab/tabpanel wiring with aria-controls', async ({ page }) => {
    await openVehicleDetailOverviewA11y(page);
    const tablist = page.getByTestId('vehicle-detail-view').getByRole('tablist');
    await expect(tablist).toBeVisible();

    const overviewTab = vehicleDetailTab(page, 'Overview');
    await expect(overviewTab).toHaveAttribute('aria-controls', VEHICLE_DETAIL_TAB_PANEL_ID.overview);
    await expect(overviewTab).toHaveAttribute('aria-selected', 'true');

    await expectVehicleDetailTabPanel(page, 'overview');
  });

  test('keyboard: arrow keys move focus between vehicle detail tabs', async ({ page }) => {
    await openVehicleDetailOverviewA11y(page);
    const overviewTab = vehicleDetailTab(page, 'Overview');
    await overviewTab.focus();
    await page.keyboard.press('ArrowRight');
    const focusedId = await page.evaluate(() => document.activeElement?.id);
    expect(focusedId).toBeTruthy();
    expect(focusedId).not.toBe(VEHICLE_DETAIL_TAB_ID.overview);
  });

  test('keyboard: Home and End move focus to first and last tabs', async ({ page }) => {
    await openVehicleDetailOverviewA11y(page);
    const tripsTab = vehicleDetailTab(page, 'Trips');
    await tripsTab.focus();
    await page.keyboard.press('Home');
    await expect(vehicleDetailTab(page, 'Overview')).toBeFocused();
    await page.keyboard.press('End');
    await expect(vehicleDetailTab(page, 'Requirements')).toBeFocused();
  });

  test('status dropdown closes on Escape and returns focus to trigger', async ({ page }) => {
    await openVehicleDetailOverviewA11y(page);
    const trigger = page.getByTestId('vehicle-detail-status-trigger');
    await trigger.click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('vehicle detail overview passes axe scan (critical/serious violations)', async ({ page }) => {
    await openVehicleDetailOverviewA11y(page);
    await assertNoHorizontalOverflow(page);

    const results = await new AxeBuilder({ page })
      .include('#vehicle-detail-panel-overview')
      .include('[data-testid="vehicle-detail-header"]')
      .disableRules(['color-contrast'])
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('iframe')
      .analyze();

    const critical = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );
    expect(critical).toEqual([]);
  });

  test('reduced motion: header animation class includes motion-reduce fallback', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openVehicleDetailOverviewA11y(page);
    const header = page.getByTestId('vehicle-detail-header');
    await expect(header).toHaveClass(/motion-reduce:animate-none/);
  });

  test('responsive: no horizontal overflow at 320px with 200% text zoom', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openVehicleDetailOverviewA11y(page);
    await applyTextZoom200(page);
    await assertNoHorizontalOverflow(page);
    await expect(page.getByTestId('vehicle-detail-view')).toBeVisible();
  });

  test('mobile touch targets: back button and tab triggers meet 44px minimum', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openVehicleDetailOverviewA11y(page);
    await assertTouchTargetMinSize(page.locator('button.sm\\:hidden').first());
    await assertTouchTargetMinSize(vehicleDetailTab(page, 'Overview'));
  });

  test('trips tab panel is exposed when switching tabs', async ({ page }) => {
    await openVehicleDetailOverviewA11y(page);
    await vehicleDetailTab(page, 'Trips').click();
    await expect(vehicleDetailTab(page, 'Trips')).toHaveAttribute('aria-selected', 'true');
    await expectVehicleDetailTabPanel(page, 'trips');
    await expect(page.getByTestId('vehicle-trips-date-filter')).toBeVisible();
  });
});
