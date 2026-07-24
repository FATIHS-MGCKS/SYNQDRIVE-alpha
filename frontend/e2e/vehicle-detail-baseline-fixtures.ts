/**
 * Playwright fixtures for Vehicle Detail Page E2E (baseline + mobile).
 */
import { expect, type Page } from '@playwright/test';

import { VEHICLE_DETAIL_TAB_KEYS } from '../src/rental/lib/vehicle-overview-navigation';
import {
  assertNoHorizontalOverflow,
  fleetRowByPlate,
  installFleetOperationalMocks,
  mockUser,
  navigateToFleetView,
  openFleetOperationalFleetPage,
  openFleetOperationalRental,
  resetFleetOperationalMockState,
  TEST_ORG_ID,
} from './fleet-operational-fixtures';

export {
  assertNoHorizontalOverflow,
  fleetRowByPlate,
  openFleetOperationalFleetPage,
  openFleetOperationalRental,
  TEST_ORG_ID,
};

export const VEHICLE_DETAIL_TAB_KEYS_EXPORT = VEHICLE_DETAIL_TAB_KEYS;

export const VEHICLE_DETAIL_TAB_LABELS_EXPORT: Record<
  (typeof VEHICLE_DETAIL_TAB_KEYS)[number],
  string
> = {
  overview: 'Overview',
  trips: 'Trips',
  'health-errors': 'Health',
  damages: 'Damages',
  documents: 'Documents',
  'vehicle-bookings': 'Bookings',
  'vehicle-tasks': 'Task List',
  'vehicle-requirements': 'Requirements',
};

export async function installVehicleDetailApiMocks(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.match(/\/vehicles\/[^/]+\/trips\/stats/) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalTrips: 0,
          totalDistanceKm: 0,
          avgDrivingStressScore: null,
          stressLevel: null,
          avgDrivingScore: null,
          avgDrivingStyleScore: null,
          totalAccelerationEvents: 0,
          totalHardAccelerationEvents: 0,
          totalBrakingEvents: 0,
          totalHardBrakingEvents: 0,
          totalAbuseEvents: 0,
          totalSpeedingEvents: 0,
          privateTripCount: 0,
          assignedTripCount: 0,
        }),
      });
    }

    if (url.match(/\/vehicles\/[^/]+\/trips(\?|$)/) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.match(/\/vehicles\/[^/]+\/damages\/stats/) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 0,
          open: 0,
          inRepair: 0,
          repaired: 0,
          archived: 0,
          active: 0,
          blockingRental: 0,
          safetyCritical: 0,
          missingEvidence: 0,
          unplaced: 0,
          estimatedOpenCostCents: 0,
          oldestOpenDamageAt: null,
        }),
      });
    }

    if (url.match(/\/vehicles\/[^/]+\/file-summary/) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          vehicle: {
            id: 'veh-mock',
            licensePlate: 'MOCK-1',
            make: 'VW',
            model: 'Golf',
            year: 2024,
          },
          canonicalStatus: {
            rentalHealthStatus: 'healthy',
            rentalBlocked: false,
            blockingReasons: [],
          },
          documentCategories: [],
          mandatoryDocumentCoverage: { configured: 0, total: 0 },
          pendingReviews: { count: 0, items: [] },
          fixedCosts: { currency: 'EUR', monthlyTotal: null, items: [] },
          variableCostAverages: {
            serviceAverageMonthly: null,
            repairAverageMonthly: null,
            sampleServiceEvents: 0,
            sampleRepairEvents: 0,
            source: 'baseline-mock',
          },
          technicalSpecs: { general: [], lvBattery: [], hvBattery: null, tankEngine: null },
          evidenceCounts: { tuv: 0, service: 0, repair: 0 },
          timeline: [],
        }),
      });
    }

    if (url.match(/\/vehicles\/[^/]+\/health\/summary/) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          vehicleId: 'veh-mock',
          generatedAt: new Date().toISOString(),
          overall: {
            state: 'good',
            label: 'Good',
            headline: 'Healthy',
            description: '',
            rentalBlocked: false,
            blockingReasons: [],
          },
          dataQuality: { level: 'good', label: 'Good', reasons: [] },
          findings: [],
          moduleStates: {},
          sourceStatus: {
            rentalHealth: 'loaded',
            aiHealthCare: 'not_available',
            highMobility: 'no_data',
            dimo: 'no_data',
          },
          degradedDependencies: [],
        }),
      });
    }

    if (url.includes('/health-tab-summary') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          modules: {},
          generatedAt: new Date().toISOString(),
          dataQuality: { level: 'good', label: 'Good', reasons: [] },
          degradedDependencies: [],
          findings: [],
        }),
      });
    }

    if (url.includes('/dashboard-warning-lights') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          vehicleId: 'veh-mock',
          provider: 'NONE',
          connectionStatus: 'unknown',
          supportStatus: 'no_data',
          freshness: 'no_data',
          overallStatus: 'unknown',
          lastObservedAt: null,
          message: '',
          lights: [],
          rentalHealthReady: false,
        }),
      });
    }

    if (url.includes('/driving-assessment-quality') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }

    if (url.includes('/tire-health-summary') || url.includes('/tires/summary')) {
      if (method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
      }
    }

    if (url.includes('/brake-health/summary') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }

    if (url.includes('/service-info-status') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }

    if (url.includes('/battery-health-summary') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orgId: TEST_ORG_ID,
          vehicleId: 'veh-mock',
          lv: null,
          hv: null,
          generatedAt: new Date().toISOString(),
        }),
      });
    }

    if (url.includes('/dtc') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/service-cases`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0, limit: 50, nextCursor: null } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/vendors`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.match(/\/organizations\/[^/]+\/vehicles\/[^/]+\/device-connection/) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          vehicleId: 'veh-mock',
          orgId: TEST_ORG_ID,
          lteR1Capable: false,
          status: 'unknown',
          severity: null,
          lastEventAt: null,
          recentEvents: [],
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/rental-health`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ vehicles: [] }),
      });
    }

    if (
      url.includes(`/organizations/${TEST_ORG_ID}/tasks`) &&
      method === 'GET' &&
      !url.includes('/tasks/summary')
    ) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0, limit: 50, nextCursor: null } }),
      });
    }

    if (
      url.includes(`/organizations/${TEST_ORG_ID}/bookings`) &&
      method === 'GET' &&
      !url.includes('/bookings/today/')
    ) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0, limit: 50, nextCursor: null } }),
      });
    }

    if (url.includes('/rental-requirements') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          vehicleId: 'veh-mock',
          rentalCategoryId: null,
          rentalCategory: null,
          overrides: {},
        }),
      });
    }

    if (url.includes('/rental-rules/effective') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          source: 'org',
          rules: {},
          rentalCategoryId: null,
        }),
      });
    }

    if (url.includes('/rental-rules/org-defaults') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured: false, rules: {} }),
      });
    }

    if (url.match(/\/vehicles\/[^/]+\/damages(\?|$)/) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.match(/\/vehicles\/[^/]+\/exterior-images/) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.match(/\/vehicles\/[^/]+\/documents/) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (method === 'GET' && url.includes('/api/v1/vehicles/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }

    return route.fallback();
  });
}

export async function openVehicleDetailBaselineRental(page: Page) {
  resetFleetOperationalMockState();
  await page.addInitScript(
    ({ token, user, locale }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(user));
      localStorage.setItem('synqdrive.locale', locale);
    },
    { token: 'vd-mobile-e2e-token', user: mockUser, locale: 'en' },
  );
  await installFleetOperationalMocks(page);
  await installVehicleDetailApiMocks(page);
  await page.goto('/rental', { waitUntil: 'load' });
  await page
    .getByRole('button', { name: /^(Dashboard|Übersicht)$/ })
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => undefined);
}

export async function openVehicleDetailBaselineFleetPage(page: Page) {
  await openVehicleDetailBaselineRental(page);
  await navigateToFleetView(page);
}

function fleetCommandPanel(page: Page) {
  return page.locator('.surface-premium.rounded-2xl').filter({ hasText: 'Fleet Command' });
}

export async function openVehicleDetailFromFleet(page: Page, plate: string) {
  await navigateToFleetView(page);
  const panel = fleetCommandPanel(page);
  await expect(panel.getByText(plate, { exact: true })).toBeVisible({ timeout: 15_000 });
  await panel
    .getByRole('button', { name: new RegExp(plate, 'i') })
    .getByRole('button', { name: 'Open vehicle details' })
    .click();
  await page.keyboard.press('Escape');
  await expect(vehicleDetailTab(page, 'Overview')).toBeVisible({ timeout: 20_000 });
}

export function vehicleDetailTab(page: Page, label: string) {
  return page
    .getByTestId('vehicle-detail-view')
    .getByRole('tablist')
    .getByRole('tab', { name: label, exact: true });
}

export async function clickVehicleDetailTab(page: Page, label: string) {
  const tab = vehicleDetailTab(page, label);
  await tab.scrollIntoViewIfNeeded();
  await tab.click();
}

export async function expectVehicleDetailTabs(page: Page) {
  for (const tab of VEHICLE_DETAIL_TAB_KEYS) {
    await expect(vehicleDetailTab(page, VEHICLE_DETAIL_TAB_LABELS_EXPORT[tab])).toBeVisible();
  }
}
