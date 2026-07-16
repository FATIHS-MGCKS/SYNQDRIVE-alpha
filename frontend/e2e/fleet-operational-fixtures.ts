/**
 * Playwright fixtures for Vehicle Operational State V2 E2E (rental fleet + dashboard + operator).
 */
import { expect, type Page } from '@playwright/test';

import { assertNoHorizontalOverflow } from './document-upload-fixtures';

export { assertNoHorizontalOverflow };

export const TEST_ORG_ID = 'org-fleet-op-e2e';

export const VEH_AVAILABLE = 'v-op-avl';
export const VEH_FUTURE = 'v-op-fut';
export const VEH_RESERVED = 'v-op-rsv';
export const VEH_ACTIVE = 'v-op-act';
export const VEH_UNKNOWN = 'v-op-unk';

export const BK_RESERVED = 'bk-op-rsv';
export const BK_ACTIVE = 'bk-op-act';
export const BK_FUTURE = 'bk-op-fut';

export const mockUser = {
  id: 'user-fleet-op-e2e',
  email: 'fleet-op@synqdrive.eu',
  name: 'Fleet Op E2E',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: TEST_ORG_ID,
  organizationName: 'Fleet Operational E2E GmbH',
  organizationLogoUrl: null,
  permissions: {
    fleet: { read: true, write: true, manage: true },
    bookings: { read: true, write: true, manage: true },
    vehicles: { read: true, write: true, manage: true },
    tasks: { read: true, write: true, manage: true },
  },
};

type FleetOperationalStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'ACTIVE_RENTED'
  | 'UNKNOWN';

interface FleetVehicleSeed {
  id: string;
  license: string;
  status: FleetOperationalStatus;
  lat: number;
  lng: number;
  nextBooking?: boolean;
  unreliable?: boolean;
  degraded?: boolean;
}

interface MockState {
  vehicles: Map<string, ReturnType<typeof buildFleetMapRow>>;
  fleetMapFetchCount: number;
  handoverEvents: number;
}

const state: MockState = {
  vehicles: new Map(),
  fleetMapFetchCount: 0,
  handoverEvents: 0,
};

const todayIso = () => new Date().toISOString();
const futureIso = () => new Date(Date.now() + 14 * 24 * 60 * 60_000).toISOString();

function operationalPayload(
  status: FleetOperationalStatus,
  options?: { unreliable?: boolean; degraded?: boolean },
) {
  const degraded = options?.degraded ?? false;
  const unreliable = options?.unreliable ?? status === 'UNKNOWN';
  const dataQualityState = unreliable
    ? 'UNAVAILABLE'
    : degraded
      ? 'DEGRADED'
      : 'RELIABLE';

  return {
    status,
    reason: unreliable ? 'TELEMETRY_STALE' : degraded ? 'PARTIAL_BOOKING_CONTEXT' : null,
    source: 'fleet-map',
    effectiveFrom: null,
    effectiveUntil: null,
    derivedAt: todayIso(),
    dataQualityState,
    dataQualityReasons: unreliable ? ['no_signal'] : degraded ? ['stale_telemetry'] : [],
    isReliable: !unreliable && !degraded,
  };
}

function displayStatus(status: FleetOperationalStatus): string {
  switch (status) {
    case 'AVAILABLE':
      return 'Available';
    case 'RESERVED':
      return 'Reserved';
    case 'ACTIVE_RENTED':
      return 'Active Rented';
    default:
      return 'Unknown';
  }
}

function buildFleetMapRow(seed: FleetVehicleSeed) {
  const operationalState = operationalPayload(seed.status, {
    unreliable: seed.unreliable,
    degraded: seed.degraded,
  });
  const statusLabel = displayStatus(seed.status);

  const reservedBooking =
    seed.status === 'RESERVED'
      ? {
          bookingId: BK_RESERVED,
          customerName: 'Anna Schmidt',
          pickupAt: todayIso(),
          returnAt: new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString(),
          pickupStationName: 'Kassel',
          returnStationName: 'Kassel',
          isOverdue: false,
        }
      : null;

  const activeBooking =
    seed.status === 'ACTIVE_RENTED'
      ? {
          bookingId: BK_ACTIVE,
          customerName: 'Ben Müller',
          pickupAt: new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString(),
          returnAt: new Date(Date.now() + 1 * 24 * 60 * 60_000).toISOString(),
          pickupStationName: 'Kassel',
          returnStationName: 'Kassel',
          isOverdue: false,
        }
      : null;

  const nextBooking = seed.nextBooking
    ? {
        bookingId: BK_FUTURE,
        customerName: 'Zukunft Kunde mit sehr langem Namen für UI-Test',
        pickupAt: futureIso(),
        returnAt: new Date(Date.now() + 18 * 24 * 60 * 60_000).toISOString(),
        pickupStationName: 'Kassel Hauptbahnhof Standort Mitte',
        returnStationName: null,
        isOverdue: false,
      }
    : null;

  const bookingContext = {
    activeBooking,
    reservedBooking,
    nextBooking,
    futureBookingCount: seed.nextBooking ? 1 : 0,
  };

  return {
    id: seed.id,
    licensePlate: seed.license,
    displayName: `VW Golf ${seed.license}`,
    make: 'VW',
    model: 'Golf',
    year: 2024,
    status: statusLabel,
    rawVehicleStatus: seed.status === 'ACTIVE_RENTED' ? 'RENTED' : seed.status,
    operationalState,
    bookingContext,
    fuelType: 'Petrol',
    healthStatus: 'Good Health',
    cleaningStatus: 'Clean',
    stationId: 'st-op-1',
    stationName: 'Kassel',
    homeStationId: 'st-op-1',
    currentStationId: 'st-op-1',
    expectedStationId: null,
    latitude: seed.lat,
    longitude: seed.lng,
    lastSeenAt: todayIso(),
    signalAgeMs: seed.unreliable ? 3_600_000 : 5_000,
    isFresh: !seed.unreliable,
    onlineStatus: seed.unreliable ? 'OFFLINE' : 'ONLINE',
    telemetryFreshness: seed.unreliable ? 'stale' : 'live',
    displayState: 'PARKED',
    displayIgnition: 'OFF',
    isLiveTracking: false,
    heading: null,
    imageUrl: null,
    odometerKm: 12_000,
    fuelPercent: 72,
    evSoc: null,
    isElectric: false,
    dataQualityState: operationalState.dataQualityState,
    isReliable: operationalState.isReliable,
    reservedBookingId: reservedBooking?.bookingId ?? null,
    reservedCustomerName: reservedBooking?.customerName ?? null,
    reservedPickupAt: reservedBooking?.pickupAt ?? null,
    reservedReturnAt: reservedBooking?.returnAt ?? null,
    reservedPickupStationName: reservedBooking?.pickupStationName ?? null,
    reservedIsOverdue: false,
    activeBookingId: activeBooking?.bookingId ?? null,
    activeCustomerName: activeBooking?.customerName ?? null,
    activeStartAt: activeBooking?.pickupAt ?? null,
    activeReturnAt: activeBooking?.returnAt ?? null,
    activeReturnStationName: activeBooking?.returnStationName ?? null,
    activeKmIncluded: 500,
    activeKmDriven: 120,
    activeIsOverdue: false,
    maintenanceReason: null,
    maintenanceReasonCode: null,
    maintenanceUrgency: null,
  };
}

function seedFleetVehicles() {
  const seeds: FleetVehicleSeed[] = [
    { id: VEH_AVAILABLE, license: 'AVL-1', status: 'AVAILABLE', lat: 51.312, lng: 9.479 },
    {
      id: VEH_FUTURE,
      license: 'FUT-1',
      status: 'AVAILABLE',
      lat: 51.314,
      lng: 9.481,
      nextBooking: true,
    },
    { id: VEH_RESERVED, license: 'RSV-1', status: 'RESERVED', lat: 51.316, lng: 9.483 },
    { id: VEH_ACTIVE, license: 'ACT-1', status: 'ACTIVE_RENTED', lat: 51.318, lng: 9.485 },
    {
      id: VEH_UNKNOWN,
      license: 'UNK-1',
      status: 'UNKNOWN',
      lat: 51.32,
      lng: 9.487,
      unreliable: true,
    },
  ];

  state.vehicles.clear();
  for (const seed of seeds) {
    state.vehicles.set(seed.id, buildFleetMapRow(seed));
  }
}

export function resetFleetOperationalMockState() {
  seedFleetVehicles();
  state.fleetMapFetchCount = 0;
  state.handoverEvents = 0;
}

export function getFleetMapFetchCount() {
  return state.fleetMapFetchCount;
}

export function simulatePickupForReservedVehicle() {
  const reserved = state.vehicles.get(VEH_RESERVED);
  if (!reserved) return;
  const activeRow = buildFleetMapRow({
    id: VEH_RESERVED,
    license: 'RSV-1',
    status: 'ACTIVE_RENTED',
    lat: 51.316,
    lng: 9.483,
  });
  state.vehicles.set(VEH_RESERVED, activeRow);
  state.handoverEvents += 1;
}

export function simulateReturnForActiveVehicle() {
  const active = state.vehicles.get(VEH_ACTIVE);
  if (!active) return;
  const availableRow = buildFleetMapRow({
    id: VEH_ACTIVE,
    license: 'ACT-1',
    status: 'AVAILABLE',
    lat: 51.318,
    lng: 9.485,
  });
  state.vehicles.set(VEH_ACTIVE, availableRow);
  state.handoverEvents += 1;
}

function fleetMapBody() {
  return JSON.stringify([...state.vehicles.values()]);
}

function emptyDashboardInsights() {
  return {
    generatedAt: todayIso(),
    hasRun: true,
    stale: false,
    activeInsightCount: 0,
    error: null,
    insights: [],
    summary: { total: 0, critical: 0, warning: 0, opportunity: 0, info: 0 },
  };
}

export async function installFleetOperationalMocks(page: Page) {
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

    if (url.includes(`/organizations/${TEST_ORG_ID}/fleet-connectivity`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ vehicles: [], meta: { total: 0 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/price-tariffs`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          priceBook: null,
          groups: [],
          assignments: [],
          unassignedVehicleCount: 0,
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/fleet-map`) && method === 'GET') {
      state.fleetMapFetchCount += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: fleetMapBody(),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/rental-health`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          vehicles: [...state.vehicles.values()].map((v) => ({
            vehicle_id: v.id,
            organization_id: TEST_ORG_ID,
            overall_state: 'good',
            rental_blocked: false,
            blocking_reasons: [],
            modules: {},
            generated_at: todayIso(),
          })),
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'st-op-1', name: 'Kassel', city: 'Kassel', latitude: 51.3127, longitude: 9.4797 },
        ]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/dashboard-insights`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptyDashboardInsights()),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings/today/pickups`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: BK_RESERVED,
            bookingNumber: 'BK-RSV-1',
            status: 'CONFIRMED',
            customerName: 'Anna Schmidt',
            vehicleId: VEH_RESERVED,
            licensePlate: 'RSV-1',
            startDate: todayIso(),
            endDate: new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString(),
            pickupStationId: 'st-op-1',
            pickupStationName: 'Kassel',
            isOverdue: false,
          },
        ]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings/today/returns`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: BK_ACTIVE,
            bookingNumber: 'BK-ACT-1',
            status: 'ACTIVE',
            customerName: 'Ben Müller',
            vehicleId: VEH_ACTIVE,
            licensePlate: 'ACT-1',
            endDate: new Date(Date.now() + 1 * 24 * 60 * 60_000).toISOString(),
            returnStationId: 'st-op-1',
            returnStationName: 'Kassel',
            isOverdue: false,
          },
        ]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings`) && method === 'GET' && !url.includes('/bookings/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/invoices`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/vehicles`) && method === 'GET' && !url.match(/\/vehicles\/[^/?]+/)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    }

    const vehicleDetailMatch = url.match(
      new RegExp(`/organizations/${TEST_ORG_ID}/vehicles/([^/?]+)`),
    );
    if (vehicleDetailMatch && method === 'GET') {
      const vehicleId = vehicleDetailMatch[1];
      const row = state.vehicles.get(vehicleId);
      if (row) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: row.id,
            licensePlate: row.licensePlate,
            make: row.make,
            model: row.model,
            year: row.year,
            status: row.status,
            operationalState: row.operationalState,
            bookingContext: row.bookingContext,
            stationId: row.stationId,
            stationName: row.stationName,
          }),
        });
      }
    }

    if (
      url.includes(`/organizations/${TEST_ORG_ID}/bookings/${BK_RESERVED}/handover/pickup`) &&
      method === 'POST'
    ) {
      simulatePickupForReservedVehicle();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          booking: { id: BK_RESERVED, status: 'ACTIVE' },
          protocol: { id: 'proto-pickup-e2e', kind: 'PICKUP' },
        }),
      });
    }

    if (
      url.includes(`/organizations/${TEST_ORG_ID}/bookings/${BK_ACTIVE}/handover/return`) &&
      method === 'POST'
    ) {
      simulateReturnForActiveVehicle();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          booking: { id: BK_ACTIVE, status: 'COMPLETED' },
          protocol: { id: 'proto-return-e2e', kind: 'RETURN' },
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/notifications`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          url.includes('/counts')
            ? {
                totalActive: 0,
                unread: 0,
                critical: 0,
                warning: 0,
                info: 0,
                resolvedRecent: 0,
                byDomain: {},
              }
            : { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
        ),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/users`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: mockUser.id, name: mockUser.name, email: mockUser.email }]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/tasks/summary`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 0,
          open: 0,
          inProgress: 0,
          done: 0,
          overdue: 0,
          unassigned: 0,
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/tasks`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/support/unread-count`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/activity-log`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    }

    return route.continue();
  });
}

export async function navigateToFleetView(page: Page) {
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

export async function openFleetOperationalRental(
  page: Page,
  options?: { theme?: 'light' | 'dark'; path?: string },
) {
  resetFleetOperationalMockState();
  await page.addInitScript(
    ({ token, user, locale, theme }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(user));
      localStorage.setItem('synqdrive.locale', locale);
      if (theme) localStorage.setItem('synqdrive-theme-preference', theme);
    },
    {
      token: 'fleet-op-e2e-token',
      user: mockUser,
      locale: 'de',
      theme: options?.theme,
    },
  );
  await installFleetOperationalMocks(page);
  await page.goto(options?.path ?? '/rental', { waitUntil: 'load' });
  await page
    .getByRole('button', { name: /^(Dashboard|Übersicht)$/ })
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => undefined);
}

export async function openFleetOperationalFleetPage(page: Page, options?: { theme?: 'light' | 'dark' }) {
  await openFleetOperationalRental(page, options);
  await navigateToFleetView(page);
}

export function fleetTabButton(page: Page, label: string | RegExp) {
  return page
    .locator('.surface-premium.rounded-2xl')
    .filter({ hasText: 'Fleet Command' })
    .locator('.sq-tab-bar button')
    .filter({ hasText: label });
}

export async function openFleetAllTab(page: Page) {
  const panel = page.locator('.surface-premium.rounded-2xl').filter({ hasText: 'Fleet Command' });
  await panel.locator('.sq-tab-bar button').filter({ hasText: 'All' }).first().click();
}

export function fleetRowByPlate(page: Page, plate: string) {
  return page
    .locator('.surface-premium.rounded-2xl')
    .filter({ hasText: 'Fleet Command' })
    .getByText(plate, { exact: true });
}

export async function dispatchHandoverCompleted(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('handover:completed'));
  });
}

export async function assertNoVisibleUuids(page: Page) {
  const text = await page.locator('body').innerText();
  const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
  expect(text.match(uuidPattern) ?? []).toEqual([]);
}

resetFleetOperationalMockState();
