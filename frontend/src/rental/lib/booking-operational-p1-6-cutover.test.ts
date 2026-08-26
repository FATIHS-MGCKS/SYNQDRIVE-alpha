/**
 * P1.6 — Booking / rental eligibility canonical cutover tests.
 */
import { describe, expect, it } from 'vitest';
import type { VehicleConnectivityRuntimeState, VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import { isDashboardOperationalAvailabilityReady } from '../components/dashboard/runtime/dashboard-operational-readiness';
import { resolveAvailabilityBadgeFromUi } from './fleet-p1-3-display';
import { buildFleetVehicleUiProjection } from './fleet-vehicle-ui-projection';
import { VEHICLE_OPERATIONAL_STATUS } from './vehicle-operational-state';
import {
  evaluateBookingOperationalGate,
  evaluateBookingVehicleEligibility,
  isBookingOperationalGatePass,
  readBookingOperationalAvailability,
} from './booking-vehicle-eligibility';
import { hasBookingWindowConflict } from './booking-window-conflict';
import type { BookingUiRow } from '../components/bookings/bookingTypes';
import {
  isBookingVehicleHardBlocked,
  resolveBookingVehiclePreflight,
} from './booking-vehicle-preflight';

const NOW_ISO = '2026-08-26T12:00:00.000Z';

function availability(
  state: 'AVAILABLE' | 'NEEDS_VERIFICATION' | 'UNAVAILABLE' | 'UNKNOWN',
) {
  return { state, generatedAt: NOW_ISO };
}

function runtime(overrides: Partial<VehicleConnectivityRuntimeState> = {}): VehicleConnectivityRuntimeState {
  return {
    vehicleId: overrides.vehicleId ?? 'bk-1',
    organizationId: 'org-1',
    overallState: overrides.overallState ?? 'TELEMETRY_ACTIVE',
    providerLinkState: overrides.providerLinkState ?? 'ACTIVE',
    telemetryState: overrides.telemetryState ?? 'live',
    physicalDeviceState: overrides.physicalDeviceState ?? 'PLUGGED_CONFIRMED',
    dataCoverageState: overrides.dataCoverageState ?? 'GOOD',
    attentionState: overrides.attentionState ?? 'NONE',
    reasonCodes: overrides.reasonCodes ?? [],
    recommendedAction: overrides.recommendedAction ?? 'NONE',
    requiresAction: false,
    lastTelemetryAt: null,
    lastProviderObservedAt: null,
    lastReceivedAt: null,
    deviceBindingId: null,
    activeEpisodeId: null,
    evidence: {},
    calculatedAt: NOW_ISO,
    stateVersion: 1,
    ...overrides,
  };
}

function healthEvaluability(
  evaluability: 'EVALUABLE' | 'PARTIALLY_EVALUABLE' | 'NOT_EVALUABLE' | 'UNKNOWN',
) {
  return {
    condition: 'good',
    evaluability,
    pipelineAvailability: 'ready',
    generatedAt: NOW_ISO,
    healthEvidenceAt: null,
    anyModuleDataStale: false,
    source: 'p0.2_projection',
  };
}

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'bk-1',
    license: overrides.license ?? 'BK 1',
    make: 'VW',
    model: 'Golf',
    year: 2024,
    station: 'Berlin',
    stationId: 'st-1',
    homeStationId: 'st-1',
    fuelType: 'Petrol',
    status: overrides.status ?? VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: overrides.online ?? true,
    lastSignal: overrides.lastSignal ?? NOW_ISO,
    onlineStatus: overrides.onlineStatus ?? 'ONLINE',
    badge: 0,
    odometer: 10000,
    fuel: 80,
    battery: 0,
    speed: 0,
    coolant: 90,
    brakes: 90,
    tires: 90,
    engineOil: 90,
    isElectric: false,
    hvBatteryCapacityKwh: null,
    leasingRate: '0',
    insuranceCost: '0',
    taxCost: '0',
    totalMonthlyCost: '0',
    operationalState: {
      status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
      reason: null,
      source: 'fleet-read-model',
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: NOW_ISO,
      dataQualityState: 'RELIABLE',
      dataQualityReasons: [],
      isReliable: true,
      ...(overrides.operationalState ?? {}),
    },
    operationalAvailability:
      overrides.operationalAvailability !== undefined
        ? overrides.operationalAvailability
        : availability('AVAILABLE'),
    connectivityRuntime:
      overrides.connectivityRuntime !== undefined
        ? overrides.connectivityRuntime
        : runtime({ vehicleId: overrides.id ?? 'bk-1' }),
    ...overrides,
  } as VehicleData;
}

function health(overrides: Partial<VehicleHealthResponse> = {}): VehicleHealthResponse {
  return {
    vehicle_id: overrides.vehicle_id ?? 'bk-1',
    organization_id: 'org-1',
    overall_state: 'good',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {} as VehicleHealthResponse['modules'],
    generated_at: NOW_ISO,
    availability: 'ready',
    ...overrides,
  };
}

function cutoverBookingRow(
  overrides: Partial<BookingUiRow> & { id: string; vehicleId: string },
): BookingUiRow {
  return {
    id: overrides.id,
    vehicleId: overrides.vehicleId,
    customer: 'C',
    vehicle: 'Golf',
    plate: 'BK 1',
    status: 'active',
    startDate: '20 Aug 2026',
    endDate: '28 Aug 2026',
    startTime: '10:00',
    endTime: '10:00',
    pickupLocation: 'Berlin',
    returnLocation: 'Berlin',
    revenue: 100,
    days: [20, 21, 22],
    startDay: 20,
    endDay: 28,
    startMonth: 7,
    endMonth: 7,
    startYear: 2026,
    endYear: 2026,
    _raw: {
      startDate: overrides._raw?.startDate ?? '2026-08-20T08:00:00.000Z',
      endDate: overrides._raw?.endDate ?? '2026-08-28T18:00:00.000Z',
      statusEnum: overrides._raw?.statusEnum ?? 'ACTIVE',
    },
    ...overrides,
  };
}

function eligible(input: Partial<Parameters<typeof evaluateBookingVehicleEligibility>[0]> = {}) {
  return evaluateBookingVehicleEligibility({
    vehicle: vehicle(),
    health: health(),
    hasTariff: true,
    catalogLoading: false,
    locale: 'de',
    ...input,
  });
}

describe('P1.6 booking operational gate truth table', () => {
  it('1. business available + operational AVAILABLE + no conflict => selectable', () => {
    const result = resolveBookingVehiclePreflight(vehicle(), health(), true, false);
    expect(result.isSelectable).toBe(true);
    expect(result.operationalGatePass).toBe(true);
  });

  it('2. operational AVAILABLE + STANDBY => selectable', () => {
    const v = vehicle({
      connectivityRuntime: runtime({ overallState: 'STANDBY', telemetryState: 'standby' }),
    });
    expect(eligible({ vehicle: v }).eligible).toBe(true);
  });

  it('3. operational AVAILABLE + SOFT_OFFLINE => selectable', () => {
    const v = vehicle({
      connectivityRuntime: runtime({
        overallState: 'SOFT_OFFLINE',
        telemetryState: 'signal_delayed',
        attentionState: 'WATCH',
      }),
    });
    expect(eligible({ vehicle: v }).eligible).toBe(true);
  });

  it('4. operational NEEDS_VERIFICATION => not selectable', () => {
    const v = vehicle({ operationalAvailability: availability('NEEDS_VERIFICATION') });
    expect(eligible({ vehicle: v }).eligible).toBe(false);
    expect(eligible({ vehicle: v }).primaryDenialDomain).toBe('operational_needs_verification');
  });

  it('5. operational UNAVAILABLE => not selectable', () => {
    const v = vehicle({ operationalAvailability: availability('UNAVAILABLE') });
    expect(eligible({ vehicle: v }).eligible).toBe(false);
  });

  it('6. operational UNKNOWN => not selectable', () => {
    const v = vehicle({ operationalAvailability: availability('UNKNOWN') });
    expect(eligible({ vehicle: v }).eligible).toBe(false);
  });

  it('7. operational absent => not selectable', () => {
    const v = vehicle({ operationalAvailability: undefined });
    expect(eligible({ vehicle: v }).eligible).toBe(false);
    expect(readBookingOperationalAvailability(v)).toBe('absent');
  });

  it('8. legacy OFFLINE + canonical AVAILABLE => selectable when business passes', () => {
    const v = vehicle({
      onlineStatus: 'OFFLINE',
      lastSignal: '2010-01-01T00:00:00.000Z',
      signalAgeMs: 999_999_999,
      operationalAvailability: availability('AVAILABLE'),
      connectivityRuntime: runtime({ overallState: 'STANDBY', telemetryState: 'standby' }),
    });
    expect(eligible({ vehicle: v }).operationalEligible).toBe(true);
    expect(eligible({ vehicle: v }).eligible).toBe(true);
  });

  it('9. legacy ONLINE + canonical NEEDS_VERIFICATION => not selectable', () => {
    const v = vehicle({
      onlineStatus: 'ONLINE',
      lastSignal: NOW_ISO,
      operationalAvailability: availability('NEEDS_VERIFICATION'),
    });
    expect(eligible({ vehicle: v }).eligible).toBe(false);
  });

  it('10. AUTHORIZATION_REQUIRED + P0.2 AVAILABLE => operational gate PASS', () => {
    const v = vehicle({
      operationalAvailability: availability('AVAILABLE'),
      connectivityRuntime: runtime({
        overallState: 'AUTHORIZATION_REQUIRED',
        providerLinkState: 'REAUTH_REQUIRED',
        attentionState: 'ACTION_REQUIRED',
      }),
    });
    expect(evaluateBookingOperationalGate(v).operationalEligible).toBe(true);
    expect(eligible({ vehicle: v }).eligible).toBe(true);
  });

  it('11. AUTHORIZATION_REQUIRED + P0.2 NEEDS_VERIFICATION => fail', () => {
    const v = vehicle({
      operationalAvailability: availability('NEEDS_VERIFICATION'),
      connectivityRuntime: runtime({
        overallState: 'AUTHORIZATION_REQUIRED',
        attentionState: 'ACTION_REQUIRED',
      }),
    });
    expect(eligible({ vehicle: v }).operationalEligible).toBe(false);
  });

  it('12. DEVICE_UNPLUGGED + P0.2 AVAILABLE => operational gate PASS', () => {
    const v = vehicle({
      operationalAvailability: availability('AVAILABLE'),
      connectivityRuntime: runtime({
        overallState: 'DEVICE_UNPLUGGED',
        attentionState: 'CRITICAL',
      }),
    });
    expect(evaluateBookingOperationalGate(v).operationalEligible).toBe(true);
    expect(eligible({ vehicle: v }).eligible).toBe(true);
  });

  it('13. DEVICE_UNPLUGGED + P0.2 UNAVAILABLE => fail', () => {
    const v = vehicle({
      operationalAvailability: availability('UNAVAILABLE'),
      connectivityRuntime: runtime({
        overallState: 'DEVICE_UNPLUGGED',
        attentionState: 'CRITICAL',
      }),
    });
    expect(eligible({ vehicle: v }).eligible).toBe(false);
    expect(eligible({ vehicle: v }).primaryDenialDomain).toBe('operational_unavailable');
  });

  it('14. ACTIVE_RENTED now but future window after return => booking window eligible', () => {
    const v = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
        reason: null,
        source: 'fleet-read-model',
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: NOW_ISO,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
        isReliable: true,
      },
    });
    const conflict = hasBookingWindowConflict({
      vehicleId: v.id,
      pickupAt: '2026-09-01T10:00:00.000Z',
      returnAt: '2026-09-03T10:00:00.000Z',
      bookings: [
        cutoverBookingRow({
          id: 'bk-1',
          vehicleId: v.id,
          _raw: {
            startDate: '2026-08-20T08:00:00.000Z',
            endDate: '2026-08-28T18:00:00.000Z',
            statusEnum: 'ACTIVE',
          },
        }),
      ],
    });
    expect(conflict).toBe(false);
    expect(eligible({ vehicle: v, bookingWindowConflict: conflict }).bookingWindowEligible).toBe(true);
    expect(eligible({ vehicle: v, bookingWindowConflict: conflict }).eligible).toBe(true);
  });

  it('15. ACTIVE_RENTED with requested overlap => booking conflict fail', () => {
    const v = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
        reason: null,
        source: 'fleet-read-model',
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: NOW_ISO,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
        isReliable: true,
      },
    });
    const conflict = hasBookingWindowConflict({
      vehicleId: v.id,
      pickupAt: '2026-08-25T10:00:00.000Z',
      returnAt: '2026-08-27T10:00:00.000Z',
      bookings: [
        cutoverBookingRow({
          id: 'bk-1',
          vehicleId: v.id,
          _raw: {
            startDate: '2026-08-20T08:00:00.000Z',
            endDate: '2026-08-28T18:00:00.000Z',
            statusEnum: 'ACTIVE',
          },
        }),
      ],
    });
    expect(conflict).toBe(true);
    expect(eligible({ vehicle: v, bookingWindowConflict: conflict }).eligible).toBe(false);
    expect(eligible({ vehicle: v, bookingWindowConflict: conflict }).primaryDenialDomain).toBe('booking_conflict');
  });

  it('16. RESERVED with non-overlapping requested window => no booking conflict', () => {
    const v = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.RESERVED,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.RESERVED,
        reason: null,
        source: 'fleet-read-model',
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: NOW_ISO,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
        isReliable: true,
      },
    });
    const conflict = hasBookingWindowConflict({
      vehicleId: v.id,
      pickupAt: '2026-09-10T10:00:00.000Z',
      returnAt: '2026-09-12T10:00:00.000Z',
      bookings: [
        cutoverBookingRow({
          id: 'bk-1',
          vehicleId: v.id,
          _raw: {
            startDate: '2026-08-20T08:00:00.000Z',
            endDate: '2026-08-22T18:00:00.000Z',
            statusEnum: 'CONFIRMED',
          },
        }),
      ],
    });
    expect(conflict).toBe(false);
    expect(eligible({ vehicle: v, bookingWindowConflict: conflict }).eligible).toBe(true);
  });

  it('17. MAINTENANCE business status is not bookable (vehicle detail policy)', () => {
    const v = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
        reason: 'SCHEDULED_SERVICE',
        source: 'fleet-read-model',
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: NOW_ISO,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
        isReliable: true,
      },
    });
    const result = resolveBookingVehiclePreflight(v, health(), true, false);
    expect(result.isSelectable).toBe(false);
    expect(result.hardBlockReason).toBe('business_block');
  });

  it('18. manual/business block => fail', () => {
    const result = eligible({
      vehicle: vehicle({ status: VEHICLE_OPERATIONAL_STATUS.BLOCKED }),
      businessBlockReason: 'Manual block',
    });
    expect(result.eligible).toBe(false);
    expect(result.primaryDenialDomain).toBe('business_block');
  });

  it('19. rental-rule restriction => fail independently', () => {
    const result = eligible({ rentalRuleBlockReason: 'Station mismatch' });
    expect(result.eligible).toBe(false);
    expect(result.primaryDenialDomain).toBe('rental_rules');
  });

  it('20. PARTIALLY_EVALUABLE + P0.2 AVAILABLE => operational gate PASS', () => {
    const v = vehicle({ healthEvaluation: healthEvaluability('PARTIALLY_EVALUABLE') });
    expect(eligible({ vehicle: v }).operationalEligible).toBe(true);
  });

  it('21. NOT_EVALUABLE + P0.2 AVAILABLE => operational gate PASS', () => {
    const v = vehicle({ healthEvaluation: healthEvaluability('NOT_EVALUABLE') });
    expect(eligible({ vehicle: v }).operationalEligible).toBe(true);
  });

  it('22. fresh telemetry + P0.2 UNAVAILABLE => fail', () => {
    const v = vehicle({
      lastSignal: NOW_ISO,
      onlineStatus: 'ONLINE',
      operationalAvailability: availability('UNAVAILABLE'),
    });
    expect(eligible({ vehicle: v }).eligible).toBe(false);
  });

  it('23. old telemetry + P0.2 AVAILABLE => pass operational gate', () => {
    const v = vehicle({
      lastSignal: '2010-01-01T00:00:00.000Z',
      onlineStatus: 'OFFLINE',
      operationalAvailability: availability('AVAILABLE'),
    });
    expect(isBookingOperationalGatePass(v)).toBe(true);
    expect(isBookingVehicleHardBlocked(v, health())).toBe(false);
  });
});

describe('P1.6 cross-surface P0.2 consistency (current-time)', () => {
  it('NEEDS_VERIFICATION aligns fleet badge, dashboard readiness, booking gate', () => {
    const v = vehicle({ operationalAvailability: availability('NEEDS_VERIFICATION') });
    const ui = buildFleetVehicleUiProjection(v, { locale: 'de' });
    const badge = resolveAvailabilityBadgeFromUi(ui, v);
    expect(ui.availability.presentation?.state).toBe('NEEDS_VERIFICATION');
    expect(badge.isUnknown).toBe(false);
    expect(isDashboardOperationalAvailabilityReady(v)).toBe(false);
    expect(evaluateBookingOperationalGate(v).operationalEligible).toBe(false);
  });

  it('AVAILABLE + standby aligns across surfaces for operational gate', () => {
    const v = vehicle({
      operationalAvailability: availability('AVAILABLE'),
      connectivityRuntime: runtime({ overallState: 'STANDBY', telemetryState: 'standby' }),
    });
    const ui = buildFleetVehicleUiProjection(v, { locale: 'de' });
    expect(ui.availability.presentation?.state).toBe('AVAILABLE');
    expect(isDashboardOperationalAvailabilityReady(v)).toBe(true);
    expect(evaluateBookingOperationalGate(v).operationalEligible).toBe(true);
  });
});

describe('P1.6 picker count consistency', () => {
  it('selectable count matches filtered eligible vehicles', () => {
    const fleet = [
      vehicle({ id: 'a' }),
      vehicle({ id: 'b', operationalAvailability: availability('NEEDS_VERIFICATION') }),
      vehicle({
        id: 'c',
        connectivityRuntime: runtime({ overallState: 'STANDBY', telemetryState: 'standby' }),
      }),
      vehicle({ id: 'd', operationalAvailability: availability('UNAVAILABLE') }),
    ];
    const selectable = fleet.filter((v) => !isBookingVehicleHardBlocked(v, health()));
    expect(selectable.map((v) => v.id)).toEqual(['a', 'c']);
  });
});
