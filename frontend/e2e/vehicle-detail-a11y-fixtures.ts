/**
 * Playwright helpers for Vehicle Detail Page accessibility (Prompt 28/36).
 */
import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import {
  VEHICLE_DETAIL_TAB_ID,
  VEHICLE_DETAIL_TAB_PANEL_ID,
} from '../src/rental/lib/vehicle-detail-a11y';
import {
  assertNoHorizontalOverflow,
  applyTextZoom200,
  assertTouchTargetMinSize,
  openVehicleDetailOverview,
  vehicleDetailTab,
} from './vehicle-detail-mobile-fixtures';

export {
  assertNoHorizontalOverflow,
  applyTextZoom200,
  assertTouchTargetMinSize,
  openVehicleDetailOverview,
  vehicleDetailTab,
};

export async function openVehicleDetailOverviewA11y(page: Page, plate = 'AVL-1') {
  await openVehicleDetailOverview(page, plate);
  await expect(page.getByTestId('vehicle-detail-header')).toBeVisible();
}

export async function expectVehicleDetailTabPanel(page: Page, tabKey: keyof typeof VEHICLE_DETAIL_TAB_PANEL_ID) {
  const panel = page.locator(`#${VEHICLE_DETAIL_TAB_PANEL_ID[tabKey]}`);
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('role', 'tabpanel');
  await expect(panel).toHaveAttribute('aria-labelledby', VEHICLE_DETAIL_TAB_ID[tabKey]);
  return panel;
}
