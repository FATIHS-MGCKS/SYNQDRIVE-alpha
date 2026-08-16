/**
 * Playwright fixtures for Vehicle Detail page E2E (controlled mocks, no production providers).
 */
import { expect, type Page } from '@playwright/test';

import { assertNoHorizontalOverflow } from './document-upload-fixtures';

export { assertNoHorizontalOverflow };

export const TEST_ORG_ID = 'org-vehicle-detail-e2e';
export const FOREIGN_ORG_ID = 'org-foreign-e2e';

export const VEH_LIVE = 'veh-vd-live';
export const VEH_STANDBY = 'veh-vd-standby';
export const VEH_DELAYED = 'veh-vd-delayed';
export const VEH_OFFLINE = 'veh-vd-offline';
export const VEH_LAST_KNOWN = 'veh-vd-last';
export const VEH_NO_POS = 'veh-vd-nopos';
export const VEH_NULL = 'veh-vd-null';
export const VEH_ZERO = 'veh-vd-zero';
export const VEH_SECOND = 'veh-vd-second';
export const VEH_DEVICE = 'veh-vd-device';
export const VEH_DEVICE_ERR = 'veh-vd-device-err';
export const VEH_DEVICE_EMPTY = 'veh-vd-device-empty';

export type VehicleDetailE2EProfile =
  | 'default'
  | 'read-only'
  | 'foreign-org'
  | 'status-patch-fail'
  | 'device-loading'
  | 'telemetry-error';

export type TelemetryScenario =
  | 'live'
  | 'standby'
  | 'signal_delayed'
  | 'offline'
  | 'no_signal'
  | 'last_known'
  | 'no_position'
  | 'null_values'
  | 'zero_values'
  | 'telemetry_error';

interface MockState {
  profile: VehicleDetailE2EProfile;
  telemetryScenario: TelemetryScenario;
  telemetryFetchCount: number;
  liveGpsFetchCount: number;
  statusPatchFail: boolean;
  deviceConnectionDelayMs: number;
  cleaningStatus: 'CLEAN' | 'NEEDS_CLEANING';
}

const state: MockState = {
  profile: 'default',
  telemetryScenario: 'live',
  telemetryFetchCount: 0,
  liveGpsFetchCount: 0,
  statusPatchFail: false,
  deviceConnectionDelayMs: 0,
  cleaningStatus: 'CLEAN',
};

const MS = {
  live: 2 * 60_000,
  standby: 2 * 60 * 60_000,
  signal_delayed: 30 * 60 * 60_000,
  offline: 72 * 60 * 60_000,
};

function isoAgo(ms: number) {
  return new Date(Date.now() - ms).toISOString();
}

export function resetVehicleDetailMockState(
  profile: VehicleDetailE2EProfile = 'default',
  telemetryScenario: TelemetryScenario = 'live',
) {
  state.profile = profile;
  state.telemetryScenario = telemetryScenario;
  state.telemetryFetchCount = 0;
  state.liveGpsFetchCount = 0;
  state.statusPatchFail = profile === 'status-patch-fail';
  state.deviceConnectionDelayMs = profile === 'device-loading' ? 5_000 : 0;
  state.cleaningStatus = 'CLEAN';
}

export function getTelemetryFetchCount() {
  return state.telemetryFetchCount;
}

export function getLiveGpsFetchCount() {
  return state.liveGpsFetchCount;
}

export function setTelemetryScenario(scenario: TelemetryScenario) {
  state.telemetryScenario = scenario;
}

export const mockAdminUser = {
  id: 'user-vd-e2e-admin',
  email: 'vehicle-detail@synqdrive.eu',
  name: 'Vehicle Detail E2E',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: TEST_ORG_ID,
  organizationName: 'Vehicle Detail E2E GmbH',
  organizationLogoUrl: null,
  permissions: {
    fleet: { read: true, write: true, manage: true },
    bookings: { read: true, write: true, manage: true },
    rental_rules: { read: true, write: true, manage: true },
  },
};

export const mockReadOnlyUser = {
  ...mockAdminUser,
  id: 'user-vd-e2e-read',
  membershipRole: 'WORKER',
  permissions: {
    fleet: { read: true, write: false, manage: false },
    bookings: { read: true, write: false, manage: false },
    rental_rules: { read: true, write: false, manage: false },
  },
};

function scenarioForVehicle(vehicleId: string): TelemetryScenario {
  const map: Record<string, TelemetryScenario> = {
    [VEH_STANDBY]: 'standby',
    [VEH_DELAYED]: 'signal_delayed',
    [VEH_OFFLINE]: 'offline',
    [VEH_LAST_KNOWN]: 'last_known',
    [VEH_NO_POS]: 'no_position',
    [VEH_NULL]: 'null_values',
    [VEH_ZERO]: 'zero_values',
  };
  return map[vehicleId] ?? state.telemetryScenario;
}

function buildFleetRow(id: string, license: string, scenario: TelemetryScenario = 'live') {
  const signalAgeMs =
    scenario === 'live'
      ? 60_000
      : scenario === 'standby' || scenario === 'last_known'
        ? MS.standby
        : scenario === 'signal_delayed'
          ? MS.signal_delayed
          : scenario === 'offline'
            ? MS.offline
            : 999_999_999;

  const hasCoords = scenario !== 'no_position';
  const onlineStatus =
    scenario === 'live'
      ? 'ONLINE'
      : scenario === 'standby' || scenario === 'last_known'
        ? 'STANDBY'
        : 'OFFLINE';

  return {
    id,
    licensePlate: license,
    displayName: `VW Golf ${license}`,
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
      derivedAt: isoAgo(60_000),
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
    cleaningStatus: state.cleaningStatus === 'NEEDS_CLEANING' ? 'Needs Cleaning' : 'Clean',
    stationId: 'st-vd-1',
    stationName: 'Kassel',
    homeStationId: 'st-vd-1',
    currentStationId: 'st-vd-1',
    expectedStationId: null,
    latitude: hasCoords ? 51.3127 : null,
    longitude: hasCoords ? 9.4797 : null,
    lastSeenAt: isoAgo(signalAgeMs),
    signalAgeMs,
    isFresh: scenario === 'live',
    onlineStatus,
    telemetryFreshness:
      scenario === 'live'
        ? 'live'
        : scenario === 'standby' || scenario === 'last_known'
          ? 'standby'
          : scenario === 'signal_delayed'
            ? 'signal_delayed'
            : scenario === 'offline'
              ? 'offline'
              : 'no_signal',
    displayState: scenario === 'live' ? 'MOVING' : 'PARKED',
    displayIgnition: 'OFF',
    isLiveTracking: scenario === 'live',
    heading: null,
    imageUrl: null,
    odometerKm: scenario === 'null_values' ? null : scenario === 'zero_values' ? 0 : 12_000,
    fuelPercent: scenario === 'null_values' ? null : scenario === 'zero_values' ? 0 : 68,
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

function fleetRows() {
  return [
    buildFleetRow(VEH_LIVE, 'VD-LIVE', 'live'),
    buildFleetRow(VEH_STANDBY, 'VD-STBY', 'standby'),
    buildFleetRow(VEH_DELAYED, 'VD-DLY', 'signal_delayed'),
    buildFleetRow(VEH_OFFLINE, 'VD-OFF', 'offline'),
    buildFleetRow(VEH_LAST_KNOWN, 'VD-LAST', 'last_known'),
    buildFleetRow(VEH_NO_POS, 'VD-NPOS', 'no_position'),
    buildFleetRow(VEH_NULL, 'VD-NULL', 'null_values'),
    buildFleetRow(VEH_ZERO, 'VD-ZERO', 'zero_values'),
    buildFleetRow(VEH_SECOND, 'VD-SEC', 'live'),
    buildFleetRow(VEH_DEVICE, 'VD-DEV', 'live'),
    buildFleetRow(VEH_DEVICE_ERR, 'VD-DERR', 'live'),
    buildFleetRow(VEH_DEVICE_EMPTY, 'VD-DEMP', 'live'),
  ];
}

function telemetryPayload(vehicleId: string) {
  const scenario = scenarioForVehicle(vehicleId);
  if (scenario === 'telemetry_error' || state.profile === 'telemetry-error') {
    throw new Error('telemetry unavailable');
  }
  const signalAgeMs =
    scenario === 'live'
      ? 60_000
      : scenario === 'standby' || scenario === 'last_known'
        ? MS.standby
        : scenario === 'signal_delayed'
          ? MS.signal_delayed
          : scenario === 'offline'
            ? MS.offline
            : 999_999_999;
  const hasCoords = scenario !== 'no_position';
  const isLiveTracking = scenario === 'live';

  return {
    id: vehicleId,
    vin: 'WVWZZZTEST',
    make: 'VW',
    model: 'Golf',
    year: 2024,
    station: 'Kassel',
    online: scenario === 'live',
    lastSignal: isoAgo(signalAgeMs),
    speed: scenario === 'null_values' ? null : scenario === 'zero_values' ? 0 : 42,
    odometer: scenario === 'null_values' ? null : scenario === 'zero_values' ? 0 : 12_000,
    fuel: scenario === 'null_values' ? null : scenario === 'zero_values' ? 0 : 68,
    battery: 0,
    coolant: 90,
    brakes: 0,
    tires: 0,
    engineOil: 0,
    oilLevel: 0,
    lvBatteryVoltage: 12.4,
    engineLoad: 0,
    isIgnitionOn: false,
    latitude: hasCoords ? 51.3127 : null,
    longitude: hasCoords ? 9.4797 : null,
    signalAgeMs,
    isFresh: scenario === 'live',
    onlineStatus:
      scenario === 'live'
        ? 'ONLINE'
        : scenario === 'standby' || scenario === 'last_known'
          ? 'STANDBY'
          : 'OFFLINE',
    telemetryFreshness:
      scenario === 'live'
        ? 'live'
        : scenario === 'standby' || scenario === 'last_known'
          ? 'standby'
          : scenario === 'signal_delayed'
            ? 'signal_delayed'
            : scenario === 'offline'
              ? 'offline'
              : 'no_signal',
    displayState: isLiveTracking ? 'MOVING' : 'PARKED',
    displayIgnition: 'OFF',
    isLiveTracking,
    displaySpeed: scenario === 'zero_values' ? 0 : isLiveTracking ? 42 : null,
    displayCoolant: scenario === 'null_values' ? null : 90,
    displayEngineLoad: scenario === 'null_values' ? null : 0,
    tripDetectionState: null,
    odometerKm: scenario === 'null_values' ? null : scenario === 'zero_values' ? 0 : 12_000,
    fuelPercent: scenario === 'null_values' ? null : scenario === 'zero_values' ? 0 : 68,
    evSoc: scenario === 'null_values' ? null : scenario === 'zero_values' ? 0 : null,
  };
}

function liveGpsPayload(vehicleId: string) {
  const scenario = scenarioForVehicle(vehicleId);
  if (scenario === 'no_position' || scenario === 'no_signal') {
    return { latitude: null, longitude: null, speedKmh: null, lastSeenAt: null, source: 'cache' as const };
  }
  if (scenario === 'last_known' || scenario === 'offline' || scenario === 'signal_delayed') {
    return {
      latitude: 51.31,
      longitude: 9.48,
      speedKmh: null,
      lastSeenAt: isoAgo(MS.standby),
      source: 'cache' as const,
    };
  }
  return {
    latitude: 51.3127,
    longitude: 9.4797,
    speedKmh: scenario === 'zero_values' ? 0 : 42,
    lastSeenAt: isoAgo(30_000),
    source: 'dimo' as const,
  };
}

function rentalHealthModule() {
  return {
    state: 'good' as const,
    reason: 'ok',
    last_updated_at: isoAgo(60_000),
    data_stale: false,
  };
}

function rentalHealthVehicle(vehicleId: string) {
  return {
    vehicle_id: vehicleId,
    organization_id: TEST_ORG_ID,
    overall_state: 'good' as const,
    rental_blocked: false,
    blocking_reasons: [] as string[],
    generated_at: isoAgo(60_000),
    modules: {
      battery: rentalHealthModule(),
      tires: rentalHealthModule(),
      brakes: rentalHealthModule(),
      error_codes: rentalHealthModule(),
      service_compliance: rentalHealthModule(),
      complaints: rentalHealthModule(),
      vehicle_alerts: rentalHealthModule(),
    },
  };
}

function fleetRentalHealthPage() {
  const data = fleetRows().map((v) => rentalHealthVehicle(v.id));
  return {
    summary: {
      availability: { ready: data.length, partial: 0, unavailable: 0 },
      pageHealth: {
        rentalBlocked: 0,
        byOverallState: { good: data.length },
        vehiclesWithDetail: data.length,
      },
    },
    data,
    meta: { limit: 50, nextCursor: null },
  };
}

function ruleField<T>(value: T) {
  return { value, source: 'ORG_DEFAULT' as const, sourceName: 'Org default' };
}

function emptyEffectiveRentalRules(vehicleId: string) {
  return {
    organizationId: TEST_ORG_ID,
    vehicleId,
    rentalCategoryId: null,
    rentalCategoryName: null,
    rentalCategoryType: null,
    rulesActive: true,
    minimumAgeYears: ruleField(21),
    minimumLicenseHoldingMonths: ruleField(12),
    minimumLicenseHoldingYears: ruleField(1),
    minimumLicenseHoldingRemainderMonths: ruleField(0),
    depositAmount: ruleField(500),
    depositAmountCents: ruleField(50_000),
    depositCurrency: ruleField('EUR'),
    creditCardRequired: ruleField(true),
    foreignTravelPolicy: ruleField('ALLOWED'),
    additionalDriverPolicy: ruleField('ALLOWED'),
    youngDriverPolicy: ruleField('SURCHARGE'),
    insuranceRequirement: ruleField(''),
    manualApprovalRequired: ruleField(false),
    notes: ruleField(''),
  };
}

function emptyVehicleRentalRequirements(vehicleId: string) {
  return {
    vehicleId,
    organizationId: TEST_ORG_ID,
    rentalCategoryId: null,
    rentalCategory: null,
    overrides: null,
    draft: null,
    published: null,
    hasUnpublishedChanges: false,
  };
}

function emptyOrgRentalDefaults() {
  return {
    organizationId: TEST_ORG_ID,
    configured: true,
    draft: null,
    published: null,
    hasUnpublishedChanges: false,
  };
}

function emptyHealthTabSummary(vehicleId: string) {
  return {
    vehicleId,
    generatedAt: isoAgo(0),
    overall: {
      state: 'good',
      label: 'Good',
      headline: 'Good health',
      description: '',
      rentalBlocked: false,
      blockingReasons: [],
    },
    dataQuality: { level: 'reliable', label: 'Reliable', reasons: [] },
    findings: [],
    moduleStates: {},
    sourceStatus: {
      rentalHealth: 'loaded',
      aiHealthCare: 'not_available',
      highMobility: 'no_data',
      dimo: 'no_data',
    },
    degradedDependencies: [],
  };
}

function emptyDashboardWarningLights(vehicleId: string) {
  return {
    vehicleId,
    provider: 'NONE' as const,
    connectionStatus: 'not_connected' as const,
    supportStatus: 'not_connected' as const,
    freshness: 'no_data' as const,
    overallStatus: 'unknown' as const,
    lastObservedAt: null,
    message: '',
    lights: [] as unknown[],
    rentalHealthReady: true,
  };
}

function emptyDamageStats() {
  return {
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
  };
}

function emptyFileSummary(vehicleId: string) {
  return {
    vehicle: {
      id: vehicleId,
      vin: null,
      licensePlate: null,
      make: 'VW',
      model: 'Golf',
      year: 2024,
      odometerKm: null,
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
    fixedCosts: { currency: 'EUR', monthlyTotal: null, items: [] },
    variableCostAverages: {
      serviceAverageMonthly: null,
      repairAverageMonthly: null,
      sampleServiceEvents: 0,
      sampleRepairEvents: 0,
      source: 'none',
    },
    technicalSpecs: { general: [], lvBattery: [], hvBattery: null, tankEngine: null },
    pendingReviews: { count: 0, items: [] },
    evidenceCounts: { tuv: 0, service: 0, repair: 0 },
    timeline: [],
  };
}

function deviceConnectionPayload(vehicleId: string) {
  if (vehicleId === VEH_DEVICE_EMPTY) {
    return { vehicleId, lteR1Capable: false, recentEvents: [], currentDeviceConnectionStatus: 'unknown', severity: null, openUnpluggedEpisode: false };
  }
  if (vehicleId === VEH_DEVICE_ERR) throw new Error('device connection failed');
  return {
    vehicleId,
    lteR1Capable: true,
    maskedDimoTokenId: '123…789',
    dimoTokenId: null,
    lastWebhookReceivedAt: isoAgo(60_000),
    currentDeviceConnectionStatus: 'plugged',
    severity: 'info',
    openUnpluggedEpisode: false,
    recentEvents: [{ id: 'evt-1', eventType: 'OBD_DEVICE_PLUGGED_IN', observedAt: isoAgo(120_000), receivedAt: isoAgo(115_000) }],
    connectivityRuntime: { lastProviderObservedAt: isoAgo(90_000), lastReceivedAt: isoAgo(60_000), telemetryState: 'live', overallState: 'TELEMETRY_ACTIVE' },
  };
}

export async function installVehicleDetailMocks(page: Page) {
  const activeUser = state.profile === 'read-only' ? mockReadOnlyUser : mockAdminUser;

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (state.profile === 'foreign-org' && url.includes(`/organizations/${FOREIGN_ORG_ID}/`)) {
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'You do not have access to this organization', statusCode: 403 }),
      });
    }

    if (url.includes('/auth/me') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(activeUser) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/profile`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: TEST_ORG_ID, name: activeUser.organizationName, businessType: 'RENTAL', timezone: 'Europe/Berlin' }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/fleet-map`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fleetRows()) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/rental-health/fleet`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fleetRentalHealthPage()),
      });
    }

    const perVehicleHealthMatch = url.match(
      new RegExp(`/organizations/${TEST_ORG_ID}/vehicles/([^/?]+)/rental-health`),
    );
    if (perVehicleHealthMatch && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rentalHealthVehicle(perVehicleHealthMatch[1])),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/rental-health`) && method === 'GET') {
      const healthPage = fleetRentalHealthPage();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ vehicles: healthPage.data, summary: healthPage.summary }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'st-vd-1', name: 'Kassel', city: 'Kassel', latitude: 51.3127, longitude: 9.4797 }]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/dashboard-insights`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generatedAt: isoAgo(0),
          hasRun: true,
          stale: false,
          activeInsightCount: 0,
          error: null,
          insights: [],
          summary: { total: 0, critical: 0, warning: 0, opportunity: 0, info: 0 },
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/rental-rules/defaults`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptyOrgRentalDefaults()),
      });
    }

    const vehicleMatch = url.match(new RegExp(`/organizations/${TEST_ORG_ID}/vehicles/([^/?]+)`));
    if (vehicleMatch && method === 'GET') {
      const vehicleId = vehicleMatch[1];
      const row = fleetRows().find((v) => v.id === vehicleId);
      if (!row) return route.fulfill({ status: 404, body: JSON.stringify({ message: 'Vehicle not found' }) });

      if (url.includes('/telemetry')) {
        state.telemetryFetchCount += 1;
        if (state.profile === 'telemetry-error') {
          return route.fulfill({ status: 503, body: JSON.stringify({ message: 'telemetry down' }) });
        }
        try {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(telemetryPayload(vehicleId)) });
        } catch {
          return route.fulfill({ status: 503, body: JSON.stringify({ message: 'telemetry down' }) });
        }
      }
      if (url.includes('/live-gps')) {
        state.liveGpsFetchCount += 1;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(liveGpsPayload(vehicleId)) });
      }
      if (url.includes('/device-connection')) {
        if (state.deviceConnectionDelayMs > 0) await new Promise((r) => setTimeout(r, state.deviceConnectionDelayMs));
        try {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deviceConnectionPayload(vehicleId)) });
        } catch {
          return route.fulfill({ status: 503, body: JSON.stringify({ message: 'device connection failed' }) });
        }
      }
      if (url.includes('/rental-requirements/effective')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(emptyEffectiveRentalRules(vehicleId)),
        });
      }
      if (url.includes('/rental-requirements')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(emptyVehicleRentalRequirements(vehicleId)),
        });
      }
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
          cleaningStatus: row.cleaningStatus,
          stationName: row.stationName,
        }),
      });
    }

    if (vehicleMatch && method === 'PATCH' && url.includes('/status')) {
      if (state.statusPatchFail || state.profile === 'read-only') {
        return route.fulfill({
          status: state.profile === 'read-only' ? 403 : 500,
          body: JSON.stringify({
            message: state.profile === 'read-only' ? 'Missing permission: fleet.write' : 'Status update failed',
          }),
        });
      }
      const body = route.request().postDataJSON() as { cleaningStatus?: string };
      if (body.cleaningStatus === 'NEEDS_CLEANING') state.cleaningStatus = 'NEEDS_CLEANING';
      if (body.cleaningStatus === 'CLEAN') state.cleaningStatus = 'CLEAN';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          vehicle: { id: vehicleMatch[1], cleaningStatus: body.cleaningStatus ?? 'CLEAN' },
          cleaningTask: body.cleaningStatus === 'NEEDS_CLEANING' ? { action: 'created', taskId: 'task-clean-e2e' } : null,
        }),
      });
    }

    const passthrough = [
      '/bookings',
      '/tasks',
      '/notifications',
      '/users',
      '/invoices',
      '/price-tariffs',
      '/fleet-connectivity',
      '/activity-log',
      '/support/unread-count',
      '/service-cases',
      '/vendors',
    ];
    for (const segment of passthrough) {
      if (url.includes(`/organizations/${TEST_ORG_ID}${segment}`) && method === 'GET') {
        if (segment === '/notifications' && url.includes('/counts')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ totalActive: 0, unread: 0, critical: 0, warning: 0, info: 0, resolvedRecent: 0, byDomain: {} }),
          });
        }
        if (segment === '/users') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{ id: activeUser.id, name: activeUser.name, email: activeUser.email }]),
          });
        }
        if (segment === '/invoices') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        if (segment === '/service-cases' || segment === '/vendors') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        }
        if (segment === '/price-tariffs') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ priceBook: null, groups: [], assignments: [], unassignedVehicleCount: 0 }),
          });
        }
        if (segment === '/fleet-connectivity') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ vehicles: [], meta: { total: 0 } }) });
        }
        if (segment === '/support/unread-count') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(segment === '/tasks' ? { data: [], meta: { total: 0 } } : { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } }),
        });
      }
    }

    if (url.includes('/api/v1/vehicles/') && method === 'GET') {
      if (url.includes('/trips/stats')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ totalTrips: 0, totalDistanceKm: 0, stressLevel: null }),
        });
      }
      if (url.includes('/trips')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      if (url.includes('/damages/stats')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(emptyDamageStats()),
        });
      }
      if (url.includes('/file-summary')) {
        const vehicleId = url.match(/\/vehicles\/([^/]+)\//)?.[1] ?? VEH_LIVE;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(emptyFileSummary(vehicleId)),
        });
      }
      if (url.includes('/driving-assessment-quality')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ score: null, sampleSize: 0, confidence: 'low' }),
        });
      }
      if (url.includes('/battery-health-summary') || url.includes('/tires/summary') || url.includes('/brake-health/summary')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ state: 'unknown', generatedAt: isoAgo(0) }),
        });
      }
      if (url.includes('/service-info-status')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'unknown' }) });
      }
      if (url.includes('/dtc/active')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      if (url.includes('/health/dashboard-warning-lights')) {
        const vehicleId = url.match(/\/vehicles\/([^/]+)\//)?.[1] ?? VEH_LIVE;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(emptyDashboardWarningLights(vehicleId)),
        });
      }
      if (url.includes('/health/summary')) {
        const vehicleId = url.match(/\/vehicles\/([^/]+)\//)?.[1] ?? VEH_LIVE;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(emptyHealthTabSummary(vehicleId)),
        });
      }
      if (url.includes('/health/')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modules: {} }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }

    if (method === 'GET' && url.includes('/api/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }

    return route.continue();
  });
}

export async function openVehicleDetailRental(
  page: Page,
  options?: { profile?: VehicleDetailE2EProfile; telemetryScenario?: TelemetryScenario; theme?: 'light' | 'dark'; locale?: string },
) {
  resetVehicleDetailMockState(options?.profile ?? 'default', options?.telemetryScenario ?? 'live');
  const user = state.profile === 'read-only' ? mockReadOnlyUser : mockAdminUser;
  await page.addInitScript(
    ({ token, user: u, locale, theme }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(u));
      localStorage.setItem('synqdrive.locale', locale);
      if (theme) localStorage.setItem('synqdrive-theme-preference', theme);
      sessionStorage.setItem('synqdrive_rental_fleet_tab', 'status');
    },
    { token: 'vehicle-detail-e2e-token', user, locale: options?.locale ?? 'en', theme: options?.theme },
  );
  await installVehicleDetailMocks(page);
  await page.goto('/rental', { waitUntil: 'load' });
  await page.getByRole('button', { name: /^(Dashboard|Übersicht)$/ }).first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
}

export async function navigateToFleet(page: Page) {
  if (await page.getByText('Fleet Command').isVisible().catch(() => false)) return;
  const fleetLabel = /^(Flotte|Fleet)$/;
  const viewport = page.viewportSize();
  if (viewport && viewport.width < 1024) {
    await page.locator('div.lg\\:hidden.fixed.top-0.left-0.right-0 button').first().click();
    await page.locator('div.lg\\:hidden.fixed.top-0').getByRole('button', { name: fleetLabel }).click();
  } else {
    await page.getByRole('button', { name: fleetLabel }).first().click();
  }
  await page.getByText('Fleet Command').waitFor({ state: 'visible', timeout: 30_000 });
}

export function fleetRowByPlate(page: Page, plate: string) {
  return page.locator('.surface-premium.rounded-2xl').filter({ hasText: 'Fleet Command' }).getByText(plate, { exact: true });
}

export async function openVehicleFromFleet(page: Page, plate: string) {
  await navigateToFleet(page);
  const row = page.locator('[role="button"]').filter({ has: page.getByText(plate, { exact: true }) });
  await expect(row.first()).toBeVisible({ timeout: 20_000 });
  await row.first().getByRole('button', { name: 'Open vehicle details' }).click();
  await expect(page.getByRole('heading', { name: /VW Golf/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#vehicle-detail-tab-overview')).toBeVisible({ timeout: 20_000 });
}

export async function openVehicleBySearch(page: Page, query: string) {
  const search = page.getByPlaceholder(/Search|Suchen/i).first();
  await search.click();
  await search.fill(query);
  const result = page.getByRole('button').filter({ hasText: query }).first();
  await expect(result).toBeVisible({ timeout: 20_000 });
  await result.click();
  await expect(page.getByRole('heading', { name: /VW Golf/ })).toBeVisible({ timeout: 20_000 });
}

export function vehicleDetailTab(page: Page, label: string) {
  return page.getByRole('tab', { name: label, exact: true });
}

export async function openAllVehicleDetailTabs(page: Page) {
  for (const tab of ['Overview', 'Trips', 'Health', 'Damages', 'Documents', 'Bookings', 'Task List', 'Requirements']) {
    const tabButton = vehicleDetailTab(page, tab);
    await tabButton.scrollIntoViewIfNeeded();
    await tabButton.click();
    await expect(tabButton).toBeVisible({ timeout: 20_000 });
  }
}

export async function waitForTelemetryPolls(minCount = 1, timeoutMs = 35_000) {
  await expect.poll(() => getTelemetryFetchCount(), { timeout: timeoutMs }).toBeGreaterThanOrEqual(minCount);
}

export async function expectMapboxFallbackOrMap(page: Page) {
  const tokenMissing = await page.getByText('Mapbox token not configured').isVisible().catch(() => false);
  const mapLoading = await page.getByText('Loading map...').isVisible().catch(() => false);
  const liveBadge = await page.getByText('Live', { exact: true }).first().isVisible().catch(() => false);
  const lastKnown = await page.getByText('Last known', { exact: true }).first().isVisible().catch(() => false);
  expect(tokenMissing || mapLoading || liveBadge || lastKnown).toBeTruthy();
}

export async function expectNoPositionOverview(page: Page) {
  const tokenMissing = await page.getByText('Mapbox token not configured').isVisible().catch(() => false);
  if (tokenMissing) {
    await expect(page.getByText('Mapbox token not configured').first()).toBeVisible();
    await expect(page.getByText('No Tracking', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Offline', { exact: true }).locator('visible=true').first()).toBeVisible();
    await expect(visibleLiveBadge(page)).toHaveCount(0);
    await expect(page.getByText('Last known', { exact: true }).locator('visible=true')).toHaveCount(0);
    return;
  }

  await expect(
    page
      .getByText(
        /No coordinates available|No live tracking available|Connect vehicle telematics|Waiting for live GPS signal/i,
      )
      .locator('visible=true')
      .first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(visibleLiveBadge(page)).toHaveCount(0);
}

export function vehicleDetailOverview(page: Page) {
  return page.locator('section[aria-label="Live vehicle status"]');
}

export function vehicleDetailHeader(page: Page) {
  return page.locator('h1').filter({ hasText: /VW Golf/ });
}

export async function vehicleDetailApiRequest(
  page: Page,
  path: string,
  options?: { method?: string; data?: unknown },
) {
  return page.evaluate(
    async ({ requestPath, method, data }) => {
      const token = localStorage.getItem('synqdrive_token');
      const response = await fetch(requestPath, {
        method: method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      return { status: response.status, body };
    },
    { requestPath: path, method: options?.method, data: options?.data },
  );
}

export function visibleLiveBadge(page: Page) {
  return page.getByText('Live', { exact: true }).locator('visible=true').first();
}

export async function openCleaningDropdown(page: Page, currentStatus: 'Clean' | 'Needs Cleaning' = 'Clean') {
  await page.getByTestId('vehicle-detail-cleaning-trigger').click();
}

export async function selectCleaningStatus(page: Page, status: 'Clean' | 'Needs Cleaning') {
  await openCleaningDropdown(page);
  await page.getByRole('menuitem', { name: status, exact: true }).click();
}

export async function confirmCleaningNeedsCleaning(page: Page) {
  await page.getByRole('button', { name: /Bestätigen|Confirm/i }).click();
}

export async function expectTelemetryPollingStalled(previousCount: number, stallMs = 8_000) {
  await pageWait(stallMs);
  expect(getTelemetryFetchCount()).toBe(previousCount);
}

function pageWait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function backToFleet(page: Page) {
  const back = page.getByRole('button', { name: 'Back to Fleet' });
  if (await back.isVisible().catch(() => false)) {
    await back.click();
  } else {
    await page.getByRole('button', { name: /^(Flotte|Fleet)$/ }).first().click();
  }
  await page.getByText('Fleet Command').waitFor({ state: 'visible', timeout: 20_000 });
}
