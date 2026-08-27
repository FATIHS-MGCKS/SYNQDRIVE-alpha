/**
 * P1 FINAL — Global legacy authority cleanup & architecture closure regressions.
 *
 * Separates operational authority (P0.2 + P1.5 readiness) from marker/attention
 * presentation (P1.3 map visuals, notifications).
 */
import { describe, expect, it } from 'vitest';
import type { VehicleConnectivityRuntimeState, VehicleHealthResponse } from '../../lib/api';
import {
  isDashboardOperationalAvailabilityReady,
  isStationFilterHudOperationallyReady,
} from '../components/dashboard/runtime/dashboard-operational-readiness';
import {
  buildVehicleRuntimeStates,
  isDashboardPopupReadyForRent,
} from '../components/dashboard/runtime/vehicleRuntimeStateBuilder';
import {
  canonicalAvailability,
  canonicalConnectivityRuntime,
  canonicalOperationalVehicle,
} from '../components/dashboard/runtime/dashboard-canonical-test-fixtures';
import { VEHICLE_OPERATIONAL_STATUS } from './vehicle-operational-state';
import { buildFleetVehicleUiProjection } from './fleet-vehicle-ui-projection';
import { deriveFleetVisualState } from './fleetVisualState';
import { resolveAvailabilityBadgeFromUi } from './fleet-p1-3-display';
import { resolveVehicleDetailConnectivityPresentation } from './vehicle-detail-operational-display';
import {
  evaluateBookingOperationalGate,
  isBookingOperationalGatePass,
} from './booking-vehicle-eligibility';
import { shouldEmitCanonicalConnectivityNotification } from './notifications/notification-operational-attention';
import { buildStationFilterOptions } from './fleet-operator-panel';
import { isVehicleOffline } from '../data/vehicles';

const NOW = new Date('2026-08-26T12:00:00.000Z');

function health(overrides: Partial<VehicleHealthResponse> = {}): VehicleHealthResponse {
  return {
    vehicle_id: 'v1',
    organization_id: 'org-1',
    overall_state: 'good',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {},
    ...overrides,
  };
}

function runtime(overrides: Partial<VehicleConnectivityRuntimeState> = {}) {
  return canonicalConnectivityRuntime(overrides);
}

type OperationalAuthorityExpectation = {
  fleetOperationalAvailability: boolean;
  dashboardReadyToRent: boolean;
  dashboardPopupReady: boolean;
  bookingOperationalGate: boolean;
  stationReady: boolean;
};

type PresentationExpectation = {
  markerVisualReady: boolean;
  markerBlocked: boolean;
  notificationEmit: boolean;
  stationAttention: boolean;
};

function readOperationalAuthority(
  vehicle: ReturnType<typeof canonicalOperationalVehicle>,
  healthRecord: VehicleHealthResponse | null = health(),
): OperationalAuthorityExpectation {
  const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'de' });
  const availability = resolveAvailabilityBadgeFromUi(ui, vehicle);
  const [runtimeState] = buildVehicleRuntimeStates({
    fleetVehicles: [vehicle],
    healthMap: new Map([[vehicle.id, healthRecord]]),
    now: NOW,
  });
  const station = buildStationFilterOptions([], [vehicle], () => healthRecord)[0];

  return {
    fleetOperationalAvailability:
      availability.label.length > 0 &&
      isDashboardOperationalAvailabilityReady(vehicle),
    dashboardReadyToRent: runtimeState?.isReadyToRent ?? false,
    dashboardPopupReady: isDashboardPopupReadyForRent(vehicle, healthRecord, { now: NOW }),
    bookingOperationalGate: isBookingOperationalGatePass(vehicle),
    stationReady: (station?.ready ?? 0) > 0,
  };
}

function readPresentationSignals(
  vehicle: ReturnType<typeof canonicalOperationalVehicle>,
  healthRecord: VehicleHealthResponse | null = health(),
): PresentationExpectation {
  const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'de' });
  const visual = deriveFleetVisualState(vehicle, { uiProjection: ui, locale: 'de' });
  const station = buildStationFilterOptions([], [vehicle], () => healthRecord)[0];

  return {
    markerVisualReady: visual.isReady,
    markerBlocked: visual.isBlocked || visual.visualStatus === 'blocked',
    notificationEmit: shouldEmitCanonicalConnectivityNotification(vehicle.connectivityRuntime),
    stationAttention: (station?.attention ?? 0) > 0,
  };
}

function expectOperationalAuthority(
  vehicle: ReturnType<typeof canonicalOperationalVehicle>,
  expected: OperationalAuthorityExpectation,
  healthRecord: VehicleHealthResponse | null = health(),
) {
  expect(readOperationalAuthority(vehicle, healthRecord)).toEqual(expected);
}

function expectPresentation(
  vehicle: ReturnType<typeof canonicalOperationalVehicle>,
  expected: PresentationExpectation,
  healthRecord: VehicleHealthResponse | null = health(),
) {
  expect(readPresentationSignals(vehicle, healthRecord)).toEqual(expected);
}

describe('P1 FINAL operational authority (must agree across surfaces)', () => {
  it('AVAILABLE + live => all operational selectors ready', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      connectivityRuntime: runtime({ telemetryState: 'live', overallState: 'TELEMETRY_ACTIVE' }),
    });
    expectOperationalAuthority(vehicle, {
      fleetOperationalAvailability: true,
      dashboardReadyToRent: true,
      dashboardPopupReady: true,
      bookingOperationalGate: true,
      stationReady: true,
    });
  });

  it('NEEDS_VERIFICATION excludes all operational readiness selectors', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
    });
    expectOperationalAuthority(vehicle, {
      fleetOperationalAvailability: false,
      dashboardReadyToRent: false,
      dashboardPopupReady: false,
      bookingOperationalGate: false,
      stationReady: false,
    });
  });

  it('UNAVAILABLE excludes all operational readiness selectors', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      operationalAvailability: canonicalAvailability('UNAVAILABLE'),
    });
    expectOperationalAuthority(vehicle, {
      fleetOperationalAvailability: false,
      dashboardReadyToRent: false,
      dashboardPopupReady: false,
      bookingOperationalGate: false,
      stationReady: false,
    });
  });
});

describe('P1 FINAL authority vs presentation separation', () => {
  it('1. AVAILABLE + DEVICE_UNPLUGGED + CRITICAL — ready yes, attention yes, marker blocked', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      operationalAvailability: canonicalAvailability('AVAILABLE'),
      connectivityRuntime: runtime({
        overallState: 'DEVICE_UNPLUGGED',
        attentionState: 'CRITICAL',
        physicalDeviceState: 'UNPLUGGED_CONFIRMED',
      }),
    });

    expectOperationalAuthority(vehicle, {
      fleetOperationalAvailability: true,
      dashboardReadyToRent: true,
      dashboardPopupReady: true,
      bookingOperationalGate: true,
      stationReady: true,
    });
    expectPresentation(vehicle, {
      markerVisualReady: false,
      markerBlocked: true,
      notificationEmit: true,
      stationAttention: true,
    });
    expect(
      resolveVehicleDetailConnectivityPresentation(vehicle, { locale: 'de' }).label.length,
    ).toBeGreaterThan(0);
  });

  it('2. AVAILABLE + INTEGRATION_ERROR + CRITICAL', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      connectivityRuntime: runtime({
        overallState: 'INTEGRATION_ERROR',
        attentionState: 'CRITICAL',
      }),
    });

    expectOperationalAuthority(vehicle, {
      fleetOperationalAvailability: true,
      dashboardReadyToRent: true,
      dashboardPopupReady: true,
      bookingOperationalGate: true,
      stationReady: true,
    });
    expectPresentation(vehicle, {
      markerVisualReady: false,
      markerBlocked: true,
      notificationEmit: true,
      stationAttention: true,
    });
  });

  it('3. AVAILABLE + OFFLINE + CRITICAL', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      connectivityRuntime: runtime({
        overallState: 'OFFLINE',
        telemetryState: 'offline',
        attentionState: 'CRITICAL',
      }),
    });

    expectOperationalAuthority(vehicle, {
      fleetOperationalAvailability: true,
      dashboardReadyToRent: true,
      dashboardPopupReady: true,
      bookingOperationalGate: true,
      stationReady: true,
    });
    expectPresentation(vehicle, {
      markerVisualReady: false,
      markerBlocked: true,
      notificationEmit: true,
      stationAttention: true,
    });
  });

  it('4. AVAILABLE + AUTHORIZATION_REQUIRED + ACTION_REQUIRED', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      operationalAvailability: canonicalAvailability('AVAILABLE'),
      connectivityRuntime: runtime({
        overallState: 'AUTHORIZATION_REQUIRED',
        attentionState: 'ACTION_REQUIRED',
      }),
    });

    expectOperationalAuthority(vehicle, {
      fleetOperationalAvailability: true,
      dashboardReadyToRent: true,
      dashboardPopupReady: true,
      bookingOperationalGate: true,
      stationReady: true,
    });
    expectPresentation(vehicle, {
      markerVisualReady: false,
      markerBlocked: true,
      notificationEmit: true,
      stationAttention: true,
    });
  });

  it('5. NEEDS_VERIFICATION + AUTHORIZATION_REQUIRED — operational false, attention true', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
      connectivityRuntime: runtime({
        overallState: 'AUTHORIZATION_REQUIRED',
        attentionState: 'ACTION_REQUIRED',
      }),
    });

    expectOperationalAuthority(vehicle, {
      fleetOperationalAvailability: false,
      dashboardReadyToRent: false,
      dashboardPopupReady: false,
      bookingOperationalGate: false,
      stationReady: false,
    });
    expectPresentation(vehicle, {
      markerVisualReady: false,
      markerBlocked: true,
      notificationEmit: true,
      stationAttention: true,
    });
  });

  it('6. UNAVAILABLE + DEVICE_UNPLUGGED — all operational false, attention true', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      operationalAvailability: canonicalAvailability('UNAVAILABLE'),
      connectivityRuntime: runtime({
        overallState: 'DEVICE_UNPLUGGED',
        attentionState: 'CRITICAL',
      }),
    });

    expectOperationalAuthority(vehicle, {
      fleetOperationalAvailability: false,
      dashboardReadyToRent: false,
      dashboardPopupReady: false,
      bookingOperationalGate: false,
      stationReady: false,
    });
    expectPresentation(vehicle, {
      markerVisualReady: false,
      markerBlocked: true,
      notificationEmit: true,
      stationAttention: true,
    });
  });

  it('proves ATTENTION != UNAVAILABLE for canonical AVAILABLE + critical connectivity', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      operationalAvailability: canonicalAvailability('AVAILABLE'),
      connectivityRuntime: runtime({
        overallState: 'DEVICE_UNPLUGGED',
        attentionState: 'CRITICAL',
      }),
    });
    const authority = readOperationalAuthority(vehicle);
    const presentation = readPresentationSignals(vehicle);
    expect(authority.stationReady).toBe(true);
    expect(presentation.stationAttention).toBe(true);
    expect(isStationFilterHudOperationallyReady(vehicle)).toBe(true);
  });
});

describe('P1 FINAL dashboard popup readiness contract (P1.5 Ready to Rent)', () => {
  it('AVAILABLE + dirty => popup not ready', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      cleaningStatus: 'Dirty',
    });
    expect(isDashboardPopupReadyForRent(vehicle, health(), { now: NOW })).toBe(false);
  });

  it('AVAILABLE + rental_blocked => popup not ready', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE);
    expect(isDashboardPopupReadyForRent(vehicle, health({ rental_blocked: true }), { now: NOW })).toBe(
      false,
    );
  });

  it('AVAILABLE + health absent => popup ready when P0.2 AVAILABLE', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE);
    expect(isDashboardPopupReadyForRent(vehicle, null, { now: NOW })).toBe(true);
  });

  it('AVAILABLE + standby => popup ready', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      connectivityRuntime: runtime({ overallState: 'STANDBY', telemetryState: 'standby' }),
    });
    expect(isDashboardPopupReadyForRent(vehicle, health(), { now: NOW })).toBe(true);
  });

  it('AVAILABLE + critical connectivity => popup ready (connectivity does not block P1.5)', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      connectivityRuntime: runtime({
        overallState: 'DEVICE_UNPLUGGED',
        attentionState: 'CRITICAL',
      }),
    });
    expect(isDashboardPopupReadyForRent(vehicle, health(), { now: NOW })).toBe(true);
  });

  it('NEEDS_VERIFICATION + otherwise clean/good => popup not ready', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
    });
    expect(isDashboardPopupReadyForRent(vehicle, health(), { now: NOW })).toBe(false);
  });

  it('popup readiness matches dashboard runtime isReadyToRent', () => {
    const vehicle = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      cleaningStatus: 'Dirty',
    });
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [vehicle],
      healthMap: new Map([[vehicle.id, health()]]),
      now: NOW,
    });
    expect(isDashboardPopupReadyForRent(vehicle, health(), { now: NOW })).toBe(
      state?.isReadyToRent ?? false,
    );
  });
});

describe('P1 FINAL negative legacy authority', () => {
  const base = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
    id: 'neg-v1',
    operationalAvailability: canonicalAvailability('AVAILABLE'),
    connectivityRuntime: runtime({ overallState: 'TELEMETRY_ACTIVE', telemetryState: 'live' }),
  });

  function authoritySnapshot(vehicle: typeof base) {
    return readOperationalAuthority(vehicle, health());
  }

  it('mutating only onlineStatus does not change operational authority', () => {
    const before = authoritySnapshot(base);
    const mutated = { ...base, onlineStatus: 'OFFLINE' as const };
    expect(authoritySnapshot(mutated)).toEqual(before);
  });

  it('mutating only lastSignal/signalAgeMs does not change operational authority', () => {
    const before = authoritySnapshot(base);
    const mutated = {
      ...base,
      lastSignal: '2010-01-01T00:00:00.000Z',
      signalAgeMs: 999_999_999,
    };
    expect(authoritySnapshot(mutated)).toEqual(before);
    expect(isVehicleOffline(mutated)).toBe(true);
  });

  it('mutating only legacy healthStatus does not change operational authority', () => {
    const before = authoritySnapshot(base);
    const mutated = { ...base, healthStatus: 'Critical' as const };
    expect(authoritySnapshot(mutated)).toEqual(before);
  });

  it('stale telemetry with canonical AVAILABLE still counts in station ready HUD', () => {
    const vehicle = {
      ...base,
      lastSignal: '2010-01-01T00:00:00.000Z',
      onlineStatus: 'OFFLINE' as const,
    };
    const options = buildStationFilterOptions([], [vehicle], () => null);
    expect(options[0]?.ready).toBe(1);
    expect(isVehicleOffline(vehicle)).toBe(true);
  });
});
