/**
 * P1 FINAL — Global legacy authority cleanup & architecture closure regressions.
 *
 * Proves tenant-facing operational decisions use canonical state, not legacy
 * timestamp/onlineStatus/healthStatus heuristics.
 */
import { describe, expect, it } from 'vitest';
import type { VehicleConnectivityRuntimeState, VehicleHealthResponse } from '../../lib/api';
import {
  isDashboardAvailablePopupReadyForRent,
  isDashboardOperationalAvailabilityReady,
} from '../components/dashboard/runtime/dashboard-operational-readiness';
import { buildVehicleRuntimeStates } from '../components/dashboard/runtime/vehicleRuntimeStateBuilder';
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

function healthEvaluability(
  evaluability: 'EVALUABLE' | 'PARTIALLY_EVALUABLE' | 'NOT_EVALUABLE' | 'UNKNOWN',
  condition: 'good' | 'warning' | 'critical' = 'good',
) {
  return {
    condition,
    evaluability,
    pipelineAvailability: 'ready',
    generatedAt: NOW.toISOString(),
    healthEvidenceAt: null,
    anyModuleDataStale: false,
    source: 'p0.2_projection',
  };
}

function runtime(overrides: Partial<VehicleConnectivityRuntimeState> = {}) {
  return canonicalConnectivityRuntime(overrides);
}

type TruthCase = {
  name: string;
  vehicle: ReturnType<typeof canonicalOperationalVehicle>;
  fleetReady: boolean;
  dashboardReady: boolean;
  bookingPass: boolean;
  notificationEmit: boolean;
};

function assertSurfaces(input: TruthCase) {
  const { vehicle } = input;
  const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'de' });
  const visual = deriveFleetVisualState(vehicle, { uiProjection: ui, locale: 'de' });
  const availability = resolveAvailabilityBadgeFromUi(ui, vehicle);
  const detailConnectivity = resolveVehicleDetailConnectivityPresentation(vehicle, { locale: 'de' });
  const [runtimeState] = buildVehicleRuntimeStates({
    fleetVehicles: [vehicle],
    now: NOW,
  });

  expect(visual.isReady).toBe(input.fleetReady);
  expect(availability.label.length).toBeGreaterThan(0);
  expect(detailConnectivity.label.length).toBeGreaterThan(0);
  expect(isDashboardOperationalAvailabilityReady(vehicle)).toBe(input.dashboardReady);
  expect(runtimeState?.isReadyToRent ?? false).toBe(input.dashboardReady);
  expect(isBookingOperationalGatePass(vehicle)).toBe(input.bookingPass);
  expect(evaluateBookingOperationalGate(vehicle).operationalEligible).toBe(input.bookingPass);
  expect(shouldEmitCanonicalConnectivityNotification(vehicle.connectivityRuntime)).toBe(
    input.notificationEmit,
  );
}

describe('P1 FINAL cross-surface truth table', () => {
  const cases: TruthCase[] = [
    {
      name: '1. AVAILABLE + live + EVALUABLE/good',
      vehicle: canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
        healthEvaluation: healthEvaluability('EVALUABLE', 'good'),
        connectivityRuntime: runtime({ telemetryState: 'live', overallState: 'TELEMETRY_ACTIVE' }),
      }),
      fleetReady: true,
      dashboardReady: true,
      bookingPass: true,
      notificationEmit: false,
    },
    {
      name: '2. AVAILABLE + standby',
      vehicle: canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
        connectivityRuntime: runtime({ overallState: 'STANDBY', telemetryState: 'standby' }),
      }),
      fleetReady: true,
      dashboardReady: true,
      bookingPass: true,
      notificationEmit: false,
    },
    {
      name: '3. AVAILABLE + soft offline',
      vehicle: canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
        connectivityRuntime: runtime({
          overallState: 'SOFT_OFFLINE',
          telemetryState: 'signal_delayed',
          attentionState: 'WATCH',
        }),
      }),
      fleetReady: true,
      dashboardReady: true,
      bookingPass: true,
      notificationEmit: true,
    },
    {
      name: '4. NEEDS_VERIFICATION + AUTHORIZATION_REQUIRED',
      vehicle: canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
        operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION'),
        connectivityRuntime: runtime({
          overallState: 'AUTHORIZATION_REQUIRED',
          attentionState: 'ACTION_REQUIRED',
        }),
      }),
      fleetReady: false,
      dashboardReady: false,
      bookingPass: false,
      notificationEmit: true,
    },
    {
      name: '5. UNAVAILABLE',
      vehicle: canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
        operationalAvailability: canonicalAvailability('UNAVAILABLE'),
      }),
      fleetReady: false,
      dashboardReady: false,
      bookingPass: false,
      notificationEmit: false,
    },
    {
      name: '6. DEVICE_UNPLUGGED',
      vehicle: canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
        operationalAvailability: canonicalAvailability('AVAILABLE'),
        connectivityRuntime: runtime({
          overallState: 'DEVICE_UNPLUGGED',
          attentionState: 'CRITICAL',
          physicalDeviceState: 'UNPLUGGED_CONFIRMED',
        }),
      }),
      fleetReady: false,
      dashboardReady: true,
      bookingPass: true,
      notificationEmit: true,
    },
    {
      name: '7. INTEGRATION_ERROR',
      vehicle: canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
        connectivityRuntime: runtime({
          overallState: 'INTEGRATION_ERROR',
          attentionState: 'CRITICAL',
        }),
      }),
      fleetReady: false,
      dashboardReady: true,
      bookingPass: true,
      notificationEmit: true,
    },
    {
      name: '8. OFFLINE + WATCH',
      vehicle: canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
        connectivityRuntime: runtime({
          overallState: 'OFFLINE',
          telemetryState: 'offline',
          attentionState: 'WATCH',
        }),
      }),
      fleetReady: true,
      dashboardReady: true,
      bookingPass: true,
      notificationEmit: true,
    },
    {
      name: '9. OFFLINE + CRITICAL',
      vehicle: canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
        connectivityRuntime: runtime({
          overallState: 'OFFLINE',
          telemetryState: 'offline',
          attentionState: 'CRITICAL',
        }),
      }),
      fleetReady: false,
      dashboardReady: true,
      bookingPass: true,
      notificationEmit: true,
    },
    {
      name: '10. UNKNOWN operational availability',
      vehicle: canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
        operationalAvailability: canonicalAvailability('UNKNOWN'),
      }),
      fleetReady: false,
      dashboardReady: false,
      bookingPass: false,
      notificationEmit: false,
    },
    {
      name: '11. connectivity absent',
      vehicle: canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
        connectivityRuntime: undefined,
      }),
      fleetReady: true,
      dashboardReady: true,
      bookingPass: true,
      notificationEmit: false,
    },
    {
      name: '12. health PARTIALLY_EVALUABLE',
      vehicle: canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
        healthEvaluation: healthEvaluability('PARTIALLY_EVALUABLE', 'warning'),
      }),
      fleetReady: true,
      dashboardReady: true,
      bookingPass: true,
      notificationEmit: false,
    },
    {
      name: '13. health NOT_EVALUABLE',
      vehicle: canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
        healthEvaluation: healthEvaluability('NOT_EVALUABLE'),
      }),
      fleetReady: true,
      dashboardReady: true,
      bookingPass: true,
      notificationEmit: false,
    },
    {
      name: '14. health absent',
      vehicle: canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
        healthEvaluation: undefined,
      }),
      fleetReady: true,
      dashboardReady: true,
      bookingPass: true,
      notificationEmit: false,
    },
    {
      name: '15. legacy ONLINE contradicts canonical bad state',
      vehicle: canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
        onlineStatus: 'ONLINE',
        lastSignal: NOW.toISOString(),
        operationalAvailability: canonicalAvailability('UNAVAILABLE'),
        connectivityRuntime: runtime({ overallState: 'OFFLINE', attentionState: 'CRITICAL' }),
      }),
      fleetReady: false,
      dashboardReady: false,
      bookingPass: false,
      notificationEmit: true,
    },
    {
      name: '16. legacy OFFLINE contradicts canonical good state',
      vehicle: canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
        onlineStatus: 'OFFLINE',
        lastSignal: '2010-01-01T00:00:00.000Z',
        operationalAvailability: canonicalAvailability('AVAILABLE'),
        connectivityRuntime: runtime({ overallState: 'TELEMETRY_ACTIVE', telemetryState: 'live' }),
      }),
      fleetReady: true,
      dashboardReady: true,
      bookingPass: true,
      notificationEmit: false,
    },
  ];

  it.each(cases)('$name', (input) => {
    assertSurfaces(input);
  });
});

describe('P1 FINAL negative legacy authority', () => {
  const base = canonicalOperationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
    id: 'neg-v1',
    operationalAvailability: canonicalAvailability('AVAILABLE'),
    connectivityRuntime: runtime({ overallState: 'TELEMETRY_ACTIVE', telemetryState: 'live' }),
  });

  function snapshot(vehicle: typeof base) {
    const ui = buildFleetVehicleUiProjection(vehicle, { locale: 'de' });
    const visual = deriveFleetVisualState(vehicle, { uiProjection: ui, locale: 'de' });
    const [runtimeState] = buildVehicleRuntimeStates({ fleetVehicles: [vehicle], now: NOW });
    const station = buildStationFilterOptions([], [vehicle], () => null)[0];
    return {
      fleetReady: visual.isReady,
      popupReady: isDashboardAvailablePopupReadyForRent(vehicle, health()),
      dashboardReady: runtimeState?.isReadyToRent ?? false,
      bookingPass: isBookingOperationalGatePass(vehicle),
      notification: shouldEmitCanonicalConnectivityNotification(vehicle.connectivityRuntime),
      stationReady: station?.ready ?? 0,
    };
  }

  it('mutating only onlineStatus does not change canonical operational outcomes', () => {
    const before = snapshot(base);
    const mutated = { ...base, onlineStatus: 'OFFLINE' as const };
    expect(snapshot(mutated)).toEqual(before);
  });

  it('mutating only lastSignal/signalAgeMs does not change canonical operational outcomes', () => {
    const before = snapshot(base);
    const mutated = {
      ...base,
      lastSignal: '2010-01-01T00:00:00.000Z',
      signalAgeMs: 999_999_999,
    };
    expect(snapshot(mutated)).toEqual(before);
    expect(isVehicleOffline(mutated)).toBe(true);
  });

  it('mutating only legacy healthStatus does not change canonical operational outcomes', () => {
    const before = snapshot(base);
    const mutated = { ...base, healthStatus: 'Critical' as const };
    expect(snapshot(mutated)).toEqual(before);
  });

  it('stale telemetry with canonical AVAILABLE still counts ready in station filter HUD', () => {
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