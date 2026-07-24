/**
 * Playwright fixtures for Vehicle Detail Page baseline E2E.
 * Extends fleet-operational mocks — no real backend or production credentials.
 */
import { expect, type Page } from '@playwright/test';

import {
  BASELINE_READ_ONLY_PERMISSIONS,
  VEHICLE_DETAIL_TAB_LABELS,
} from '../src/rental/lib/vehicle-detail-baseline.fixtures';
import { VEHICLE_DETAIL_TAB_KEYS } from '../src/rental/lib/vehicle-overview-navigation';
import {
  TEST_ORG_ID,
  fleetRowByPlate,
  fleetTabButton,
  installFleetOperationalMocks,
  mockUser,
  openFleetOperationalFleetPage,
  openFleetOperationalRental,
  resetFleetOperationalMockState,
} from './fleet-operational-fixtures';

export {
  assertNoHorizontalOverflow,
  assertNoVisibleUuids,
  fleetRowByPlate,
  fleetTabButton,
  openFleetOperationalFleetPage,
  openFleetOperationalRental,
} from './fleet-operational-fixtures';

export const VEHICLE_DETAIL_TAB_KEYS_EXPORT = VEHICLE_DETAIL_TAB_KEYS;
export const VEHICLE_DETAIL_TAB_LABELS_EXPORT = VEHICLE_DETAIL_TAB_LABELS;

const hoursAgoIso = (h: number) => new Date(Date.now() - h * 60 * 60_000).toISOString();

function baselineVehicleFileSummary() {
  return {
    vehicle: {
      id: 'veh-mock',
      vin: null,
      licensePlate: 'MOCK-1',
      make: 'VW',
      model: 'Golf',
      year: 2024,
      odometerKm: 12_000,
      organizationId: TEST_ORG_ID,
    },
    canonicalStatus: {
      rentalHealthStatus: 'healthy',
      rentalHealthSource: 'rental_health_service',
      rentalBlocked: false,
      blockingReasons: [],
      serviceCompliance: { tuv: null, bokraft: null, nextService: null },
      note: '',
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
    technicalSpecs: {
      general: [],
      lvBattery: [],
      hvBattery: null,
      tankEngine: null,
    },
    evidenceCounts: { tuv: 0, service: 0, repair: 0 },
    timeline: [],
  };
}

export const mockReadOnlyUser = {
  ...mockUser,
  id: 'user-vd-baseline-readonly',
  email: 'vd-readonly@synqdrive.eu',
  name: 'VD Baseline Readonly',
  membershipRole: 'ORG_VIEWER',
  permissions: BASELINE_READ_ONLY_PERMISSIONS,
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
        body: JSON.stringify(baselineVehicleFileSummary()),
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

    if (method === 'GET' && url.includes('/api/v1/vehicles/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }

    return route.fallback();
  });
}

export async function openVehicleDetailBaselineRental(
  page: Page,
  options?: { readOnly?: boolean; theme?: 'light' | 'dark' },
) {
  resetFleetOperationalMockState();
  const user = options?.readOnly ? mockReadOnlyUser : mockUser;
  await page.addInitScript(
    ({ token, user: u, locale, theme }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(u));
      localStorage.setItem('synqdrive.locale', locale);
      if (theme) localStorage.setItem('synqdrive-theme-preference', theme);
    },
    {
      token: options?.readOnly ? 'vd-baseline-readonly-token' : 'fleet-op-e2e-token',
      user,
      locale: 'de',
      theme: options?.theme,
    },
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

export async function navigateToFleetCommand(page: Page) {
  if (await page.getByText('Fleet Command').isVisible().catch(() => false)) return;

  const viewport = page.viewportSize();
  const fleetLabel = /^(Flotte|Fleet)$/;

  if (viewport && viewport.width < 1024) {
    await page.locator('div.lg\\:hidden.fixed.top-0.left-0.right-0 button').first().click();
    await page.locator('div.lg\\:hidden.fixed.top-0').getByRole('button', { name: fleetLabel }).click();
  } else {
    const fleetNav = page.getByRole('button', { name: fleetLabel });
    await fleetNav.first().waitFor({ state: 'visible', timeout: 30_000 });
    await fleetNav.first().click();
  }

  await page.getByText('Fleet Command').waitFor({ state: 'visible', timeout: 30_000 });
}

function fleetCommandPanel(page: Page) {
  return page.locator('.surface-premium.rounded-2xl').filter({ hasText: 'Fleet Command' });
}

export async function openVehicleDetailBaselineFleetPage(
  page: Page,
  options?: { readOnly?: boolean; theme?: 'light' | 'dark' },
) {
  await openVehicleDetailBaselineRental(page, options);
  await navigateToFleetCommand(page);
}

export async function openVehicleDetailFromFleet(page: Page, plate: string) {
  await navigateToFleetCommand(page);
  const panel = fleetCommandPanel(page);
  await expect(panel.getByText(plate, { exact: true })).toBeVisible({ timeout: 15_000 });
  await panel
    .getByRole('button', { name: new RegExp(`${plate}.*Open vehicle details`) })
    .getByRole('button', { name: 'Open vehicle details' })
    .click();
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

export function vehicleDetailTab(page: Page, label: string) {
  return page.getByRole('button', { name: label, exact: true });
}

export async function expectVehicleDetailTabs(page: Page) {
  for (const tab of VEHICLE_DETAIL_TAB_KEYS) {
    await expect(vehicleDetailTab(page, VEHICLE_DETAIL_TAB_LABELS[tab])).toBeVisible();
  }
}

export async function installTelemetryScenarioMocks(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes(`/organizations/${TEST_ORG_ID}/fleet-map`) && method === 'GET') {
      const body = {
        vehicles: [
          telemetryScenarioRow('v-live', 'LIVE-1', { lastSeenAt: new Date().toISOString(), signalAgeMs: 5_000, onlineStatus: 'ONLINE' }),
          telemetryScenarioRow('v-standby', 'STBY-1', { lastSeenAt: hoursAgoIso(3), signalAgeMs: 3 * 60 * 60_000, onlineStatus: 'STANDBY', isFresh: false }),
          telemetryScenarioRow('v-soft', 'SOFT-1', { lastSeenAt: hoursAgoIso(30), signalAgeMs: 30 * 60 * 60_000, onlineStatus: 'STANDBY', isFresh: false }),
          telemetryScenarioRow('v-offline', 'OFFL-1', { lastSeenAt: hoursAgoIso(50), signalAgeMs: 50 * 60 * 60_000, onlineStatus: 'OFFLINE', isFresh: false }),
          telemetryScenarioRow('v-nosig', 'NOSIG-1', { lastSeenAt: null, signalAgeMs: null, onlineStatus: 'OFFLINE', isFresh: false }),
        ],
        meta: { total: 5, fetchedAt: new Date().toISOString() },
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }

    return route.continue();
  });
}

function telemetryScenarioRow(
  id: string,
  plate: string,
  telemetry: {
    lastSeenAt: string | null;
    signalAgeMs: number | null;
    onlineStatus: string;
    isFresh: boolean;
  },
) {
  return {
    id,
    licensePlate: plate,
    displayName: `VW Golf ${plate}`,
    make: 'VW',
    model: 'Golf',
    year: 2024,
    status: 'Available',
    rawVehicleStatus: 'AVAILABLE',
    operationalState: {
      status: 'AVAILABLE',
      reason: null,
      source: 'fleet-map',
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: new Date().toISOString(),
      dataQualityState: 'RELIABLE',
      dataQualityReasons: [],
      isReliable: true,
    },
    bookingContext: {
      activeBooking: null,
      reservedBooking: null,
      nextBooking: null,
      futureBookingCount: 0,
    },
    fuelType: 'Petrol',
    healthStatus: 'Good Health',
    cleaningStatus: 'Clean',
    stationId: 'st-op-1',
    stationName: 'Kassel',
    homeStationId: 'st-op-1',
    currentStationId: 'st-op-1',
    expectedStationId: null,
    latitude: 51.312,
    longitude: 9.479,
    lastSeenAt: telemetry.lastSeenAt,
    signalAgeMs: telemetry.signalAgeMs,
    isFresh: telemetry.isFresh,
    onlineStatus: telemetry.onlineStatus,
    displayState: 'PARKED',
    displayIgnition: 'OFF',
    isLiveTracking: false,
    heading: null,
    imageUrl: null,
    odometerKm: 12_000,
    fuelPercent: 72,
    evSoc: null,
    isElectric: false,
    dataQualityState: 'RELIABLE',
    isReliable: true,
    reservedBookingId: null,
    reservedCustomerName: null,
    reservedPickupAt: null,
    reservedReturnAt: null,
    reservedPickupStationName: null,
    reservedIsOverdue: false,
    activeBookingId: null,
    activeCustomerName: null,
    activeStartAt: null,
    activeReturnAt: null,
    activeReturnStationName: null,
    activeKmIncluded: null,
    activeKmDriven: null,
    activeIsOverdue: false,
    maintenanceReason: null,
    maintenanceReasonCode: null,
    maintenanceUrgency: null,
  };
}
