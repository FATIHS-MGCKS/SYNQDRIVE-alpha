/**
 * Playwright fixtures for Battery Health V2 E2E (rental vehicle health tab).
 */
import { expect, type Page } from '@playwright/test';

import { assertNoHorizontalOverflow } from './document-upload-fixtures';
import {
  evHvProviderSoh,
  iceLvLiveStable,
  iceLvObservationStale,
  iceLvStartProxyProxy,
} from '../src/rental/lib/battery-test-fixtures';

export { assertNoHorizontalOverflow };

export const TEST_ORG_ID = 'org-battery-e2e';
export const VEH_ICE = 'veh-bat-ice';
export const VEH_EV = 'veh-bat-ev';

export type BatteryE2EProfile =
  | 'ice-lv-stable'
  | 'ice-lv-stale'
  | 'ice-lv-proxy'
  | 'ev-hv-provider'
  | 'summary-error';

export const mockUser = {
  id: 'user-battery-e2e',
  email: 'battery@synqdrive.eu',
  name: 'Battery E2E',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: TEST_ORG_ID,
  organizationName: 'Battery Health E2E GmbH',
  organizationLogoUrl: null,
  permissions: {
    fleet: { read: true, write: true, manage: true },
    vehicles: { read: true, write: true, manage: true },
    bookings: { read: true, write: true, manage: true },
    tasks: { read: true, write: true, manage: true },
  },
};

interface BatteryMockState {
  profile: BatteryE2EProfile;
  summaryFetchCount: number;
  detailFetchCount: number;
}

const state: BatteryMockState = {
  profile: 'ice-lv-stable',
  summaryFetchCount: 0,
  detailFetchCount: 0,
};

export function resetBatteryHealthMockState(profile: BatteryE2EProfile = 'ice-lv-stable') {
  state.profile = profile;
  state.summaryFetchCount = 0;
  state.detailFetchCount = 0;
}

export function getBatterySummaryFetchCount() {
  return state.summaryFetchCount;
}

function summaryForProfile(profile: BatteryE2EProfile, vehicleId: string) {
  if (vehicleId === VEH_EV) return evHvProviderSoh();
  switch (profile) {
    case 'ice-lv-stale':
      return iceLvObservationStale();
    case 'ice-lv-proxy':
      return iceLvStartProxyProxy();
    case 'ev-hv-provider':
      return evHvProviderSoh();
    default:
      return iceLvLiveStable();
  }
}

function rentalHealth(vehicleId: string) {
  return {
    vehicle_id: vehicleId,
    organization_id: TEST_ORG_ID,
    overall_state: 'good',
    rental_blocked: false,
    blocking_reasons: [],
    generated_at: new Date().toISOString(),
    modules: {
      battery: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
      tires: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
      brakes: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
      error_codes: { state: 'unknown', reason: '', last_updated_at: null, data_stale: false },
      service_compliance: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
      complaints: { state: 'unknown', reason: '', last_updated_at: null, data_stale: false },
      vehicle_alerts: { state: 'unknown', reason: '', last_updated_at: null, data_stale: false },
    },
  };
}

function fleetVehicleRow(id: string, license: string, fuelType: string) {
  const isEv = fuelType === 'Electric';
  const now = new Date().toISOString();
  return {
    id,
    licensePlate: license,
    displayName: isEv ? `VW ID.4 ${license}` : `VW Golf ${license}`,
    make: 'VW',
    model: isEv ? 'ID.4' : 'Golf',
    year: 2024,
    status: 'Available',
    rawVehicleStatus: 'AVAILABLE',
    operationalState: {
      status: 'AVAILABLE',
      reason: null,
      source: 'fleet-map',
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: now,
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
    fuelType,
    healthStatus: 'Good Health',
    cleaningStatus: 'Clean',
    stationId: 'st-bat-1',
    stationName: 'Kassel',
    homeStationId: 'st-bat-1',
    currentStationId: 'st-bat-1',
    expectedStationId: null,
    latitude: 51.312,
    longitude: 9.48,
    lastSeenAt: now,
    signalAgeMs: 5_000,
    isFresh: true,
    onlineStatus: 'ONLINE',
    telemetryFreshness: 'live',
    displayState: 'PARKED',
    displayIgnition: 'OFF',
    isLiveTracking: false,
    heading: null,
    imageUrl: null,
    odometerKm: 12_000,
    fuelPercent: isEv ? null : 72,
    evSoc: isEv ? 68 : null,
    isElectric: isEv,
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
    activeReturnAt: null,
    activeReturnStationName: null,
    activeIsOverdue: false,
    activeKmIncluded: null,
    activeKmDriven: null,
    nextBookingId: null,
    nextBookingCustomerName: null,
    nextBookingPickupAt: null,
    nextBookingPickupStationName: null,
    futureBookingCount: 0,
  };
}

export async function installBatteryHealthMocks(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/me') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/profile`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: TEST_ORG_ID,
          name: mockUser.organizationName,
          businessType: 'RENTAL',
          timezone: 'Europe/Berlin',
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'st-bat-1', name: 'Kassel', city: 'Kassel', latitude: 51.3127, longitude: 9.4797 },
        ]),
      });
    }

    if (url.includes(`/vehicles/${VEH_ICE}`) && method === 'GET' && !url.includes('battery-health')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: VEH_ICE, licensePlate: 'BAT-ICE', make: 'VW', model: 'Golf', fuelType: 'Petrol' }),
      });
    }

    if (url.includes(`/vehicles/${VEH_EV}`) && method === 'GET' && !url.includes('battery-health')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: VEH_EV, licensePlate: 'BAT-EV', make: 'VW', model: 'ID.4', fuelType: 'Electric' }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/fleet-map`) && method === 'GET') {
      const rows =
        state.profile === 'ev-hv-provider'
          ? [
              fleetVehicleRow(VEH_EV, 'BAT-EV', 'Electric'),
              fleetVehicleRow(VEH_ICE, 'BAT-ICE', 'Petrol'),
            ]
          : [
              fleetVehicleRow(VEH_ICE, 'BAT-ICE', 'Petrol'),
              fleetVehicleRow(VEH_EV, 'BAT-EV', 'Electric'),
            ];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rows),
      });
    }

    if (url.includes('/battery-health-summary') && method === 'GET') {
      state.summaryFetchCount += 1;
      if (state.profile === 'summary-error') {
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"partial"}' });
      }
      const vehicleId = url.includes(VEH_EV) ? VEH_EV : VEH_ICE;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(summaryForProfile(state.profile, vehicleId)),
      });
    }

    if (url.includes('/battery-health-detail') && method === 'GET') {
      state.detailFetchCount += 1;
      const vehicleId = url.includes(VEH_EV) ? VEH_EV : VEH_ICE;
      const summary = summaryForProfile(state.profile, vehicleId);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...summary,
          detail: { lv: { evidence: [] }, hv: { evidence: [], chargingSessions: [] } },
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/rental-health`) && method === 'GET') {
      if (url.includes('/vehicles/')) {
        const vehicleId = url.includes(VEH_EV) ? VEH_EV : VEH_ICE;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(rentalHealth(vehicleId)),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          vehicles: [rentalHealth(VEH_ICE), rentalHealth(VEH_EV)],
        }),
      });
    }

    if (url.includes('/health-tab-summary') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ modules: {}, generatedAt: new Date().toISOString() }),
      });
    }

    if (url.includes('/dashboard-warning-lights') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }

    if (url.includes('/dtc') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/dashboard-insights`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generatedAt: new Date().toISOString(),
          hasRun: true,
          stale: false,
          activeInsightCount: 0,
          error: null,
          insights: [],
          summary: { total: 0, critical: 0, warning: 0, opportunity: 0, info: 0 },
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings/today`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/tasks`) && method === 'GET') {
      if (url.includes('/summary')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ open: 0, overdue: 0, dueSoon: 0, inProgress: 0 }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/vendors`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/price-tariffs`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ priceBook: null, groups: [], assignments: [], unassignedVehicleCount: 0 }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/fleet-connectivity`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ vehicles: [], meta: { total: 0 } }),
      });
    }

    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }

    return route.continue();
  });
}

async function navigateToFleetView(page: Page) {
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

function batteryTestPlate(profile: BatteryE2EProfile) {
  return profile === 'ev-hv-provider' ? 'BAT-EV' : 'BAT-ICE';
}

/** Desktop inline panel vs mobile drawer — avoids duplicate HealthVehicleDetailPanel matches. */
export function batteryHealthDetailRoot(page: Page) {
  const viewport = page.viewportSize();
  const isMobile = viewport != null && viewport.width < 1024;
  if (isMobile) {
    return page.getByRole('dialog');
  }
  return page
    .locator('div.hidden.lg\\:flex')
    .filter({ has: page.getByRole('heading', { name: 'Why this status?' }) });
}

export async function openBatteryHealthTab(
  page: Page,
  profile: BatteryE2EProfile = 'ice-lv-stable',
  options?: { expectContent?: boolean },
) {
  const plate = batteryTestPlate(profile);
  await navigateToFleetView(page);
  await page.getByRole('tab', { name: 'Status' }).click();
  await page.getByText(plate, { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('tab', { name: 'Zustand & Service' }).click();
  await page.getByRole('tab', { name: 'Fahrzeuge' }).click();
  const gesundGroup = page.getByRole('button', { name: /^Gesund\b/ });
  if (await gesundGroup.isVisible().catch(() => false)) {
    await gesundGroup.click();
  }
  const openHealth = page.getByRole('button', { name: new RegExp(`Open health for ${plate}`, 'i') });
  await openHealth.first().waitFor({ state: 'visible', timeout: 30_000 });
  await openHealth.first().click();
  const detailPanel = batteryHealthDetailRoot(page);
  await detailPanel.getByRole('heading', { name: 'Why this status?' }).waitFor({
    state: 'visible',
    timeout: 30_000,
  });
  const batteryTab = detailPanel.getByRole('button', { name: 'Battery', exact: true });
  await batteryTab.waitFor({ state: 'visible', timeout: 15_000 });
  await batteryTab.click();
  if (options?.expectContent !== false) {
    await expect(detailPanel.getByText('12V-Batterie').first()).toBeVisible({ timeout: 20_000 });
  }
}

export async function openBatteryLvDetailModal(page: Page) {
  await expect(page.getByText('Geschätzter 12V-Batteriezustand').first()).toBeVisible({ timeout: 15_000 });
}

export async function openBatteryHealthRental(
  page: Page,
  options?: { profile?: BatteryE2EProfile; theme?: 'light' | 'dark'; locale?: string },
) {
  resetBatteryHealthMockState(options?.profile ?? 'ice-lv-stable');
  await page.addInitScript(
    ({ token, user, locale, theme }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(user));
      localStorage.setItem('synqdrive.locale', locale);
      if (theme) localStorage.setItem('synqdrive-theme-preference', theme);
      sessionStorage.setItem('synqdrive_rental_fleet_tab', 'status');
    },
    {
      token: 'battery-e2e-token',
      user: mockUser,
      locale: options?.locale ?? 'de',
      theme: options?.theme,
    },
  );
  await installBatteryHealthMocks(page);
  await page.goto('/rental', { waitUntil: 'load' });
  await page
    .getByRole('button', { name: /^(Dashboard|Übersicht)$/ })
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => undefined);
}
