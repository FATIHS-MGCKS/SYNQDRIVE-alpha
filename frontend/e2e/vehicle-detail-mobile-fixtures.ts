/**
 * Playwright helpers for Vehicle Detail Page mobile readiness (Prompt 27/36).
 */
import { expect, type Locator, type Page } from '@playwright/test';

import {
  VEHICLE_DETAIL_TAB_KEYS_EXPORT,
  VEHICLE_DETAIL_TAB_LABELS_EXPORT,
  assertNoHorizontalOverflow,
  clickVehicleDetailTab,
  openVehicleDetailBaselineFleetPage,
  openVehicleDetailFromFleet,
  vehicleDetailTab,
} from './vehicle-detail-baseline-fixtures';

export {
  assertNoHorizontalOverflow,
  clickVehicleDetailTab,
  openVehicleDetailBaselineFleetPage,
  openVehicleDetailFromFleet,
  vehicleDetailTab,
  VEHICLE_DETAIL_TAB_KEYS_EXPORT,
  VEHICLE_DETAIL_TAB_LABELS_EXPORT,
};

export const VEHICLE_DETAIL_MOBILE_SCREENSHOT_PROJECTS = [
  'mobile-320',
  'mobile-360',
  'mobile-375',
  'mobile-390',
  'mobile-430',
  'tablet-768',
] as const;

export const VEHICLE_DETAIL_MOBILE_PROJECTS = [
  ...VEHICLE_DETAIL_MOBILE_SCREENSHOT_PROJECTS,
  'landscape-375',
] as const;

const LONG_PLATE = 'M-AB-1234-E2E-LONG-PLATE';
const LONG_STATION = 'Kassel Hauptbahnhof Pkw-Stellplatz Nord-West Langname';

export async function openVehicleDetailOverview(page: Page, plate = 'AVL-1') {
  await openVehicleDetailBaselineFleetPage(page);
  await openVehicleDetailFromFleet(page, plate);
  await expect(page.getByTestId('vehicle-detail-view')).toBeVisible();
  await expect(vehicleDetailTab(page, 'Overview')).toBeVisible();
}

export async function injectLongHeaderMeta(page: Page) {
  await page.getByTestId('vehicle-detail-license').evaluate((el, plate) => {
    el.textContent = plate;
  }, LONG_PLATE);
  await page.getByTestId('vehicle-detail-station').evaluate((el, station) => {
    el.textContent = station;
  }, LONG_STATION);
}

export async function assertTouchTargetMinSize(
  locator: Locator,
  minSize = 44,
  tolerance = 2,
) {
  const box = await locator.boundingBox();
  expect(box, 'element must be visible for touch target assertion').not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(minSize - tolerance);
  expect(box!.height).toBeGreaterThanOrEqual(minSize - tolerance);
}

export async function applyTextZoom200(page: Page) {
  await page.addStyleTag({
    content: 'html { font-size: 200% !important; }',
  });
}

export async function captureVehicleDetailScreenshot(
  page: Page,
  projectName: string,
  slug: string,
) {
  await page.screenshot({
    path: `playwright-report/vehicle-detail-mobile-${slug}-${projectName}.png`,
    fullPage: true,
  });
}

export async function setLandscapeViewport(page: Page) {
  await page.setViewportSize({ width: 812, height: 375 });
}
