import { describe, expect, it } from 'vitest';
import type { VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../../rental/data/vehicles';
import { buildVehicleRuntimeStates } from '../../rental/components/dashboard/runtime/vehicleRuntimeStateBuilder';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
} from '../../rental/lib/vehicle-operational-state';
import { deriveVehicleOperatorStatuses } from './operatorStatus';
import {
  deriveOperatorVehicleStatusSnapshot,
  vehicleMatchesOperatorFilter,
} from './operatorVehicleQuickView.utils';
import { buildOperatorVehicleRuntimeState } from './operatorVehicleRuntime';

const NOW = new Date('2026-07-25T12:00:00.000Z');

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'veh-1',
    license: overrides.license ?? 'KS FH 660E',
    make: overrides.make ?? 'Tesla',
    model: overrides.model ?? 'Model 3',
    year: overrides.year ?? 2024,
    station: overrides.station ?? 'Kassel',
    stationId: overrides.stationId ?? 'st-1',
    fuelType: overrides.fuelType ?? 'Electric',
    status: overrides.status ?? VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    operationalState: overrides.operationalState ?? {
      status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
      reason: null,
      source: null,
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: NOW.toISOString(),
      dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
      dataQualityReasons: [],
      isReliable: true,
    },
    bookingContext: overrides.bookingContext ?? {
      activeBooking: null,
      reservedBooking: null,
      nextBooking: null,
      futureBookingCount: 0,
    },
    cleaningStatus: overrides.cleaningStatus ?? 'Clean',
    healthStatus: overrides.healthStatus ?? 'Good Health',
    online: overrides.online ?? true,
    lastSignal: overrides.lastSignal ?? NOW.toISOString(),
    badge: overrides.badge ?? 0,
    odometer: overrides.odometer ?? 10000,
    fuel: overrides.fuel ?? 80,
    battery: overrides.battery ?? 72,
    speed: overrides.speed ?? 0,
    coolant: overrides.coolant ?? 90,
    brakes: overrides.brakes ?? 90,
    tires: overrides.tires ?? 90,
    engineOil: overrides.engineOil ?? 90,
    isElectric: overrides.isElectric ?? true,
    hvBatteryCapacityKwh: overrides.hvBatteryCapacityKwh ?? 75,
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    ...overrides,
  } as VehicleData;
}

function health(overrides: Partial<VehicleHealthResponse> = {}): VehicleHealthResponse {
  return {
    rental_blocked: false,
    blocking_reasons: [],
    overall_state: 'good',
    modules: {
      battery: { state: 'good', reason: '', data_stale: false },
      tires: { state: 'good', reason: '', data_stale: false },
      brakes: { state: 'good', reason: '', data_stale: false },
      error_codes: { state: 'good', reason: '', data_stale: false },
      service_compliance: { state: 'good', reason: '', data_stale: false },
      complaints: { state: 'good', reason: '', data_stale: false },
      vehicle_alerts: { state: 'good', reason: '', data_stale: false },
    },
    ...overrides,
  } as VehicleHealthResponse;
}

function canonicalRuntime(v: VehicleData, h?: VehicleHealthResponse | null) {
  const healthMap = new Map<string, VehicleHealthResponse>();
  if (h) healthMap.set(v.id, h);
  const blockedVehicleIds = new Set<string>();
  if (h?.rental_blocked) blockedVehicleIds.add(v.id);
  return buildVehicleRuntimeStates({
    fleetVehicles: [v],
    healthMap,
    blockedVehicleIds,
    now: NOW,
    locale: 'de',
  })[0]!;
}

describe('operator vehicle runtime parity', () => {
  it('buildOperatorVehicleRuntimeState matches canonical builder output', () => {
    const v = vehicle();
    const h = health();
    const canonical = canonicalRuntime(v, h);
    const operator = buildOperatorVehicleRuntimeState({ vehicle: v, health: h, now: NOW, locale: 'de' });
    expect(operator.isReadyToRent).toBe(canonical.isReadyToRent);
    expect(operator.isBlocked).toBe(canonical.isBlocked);
    expect(operator.telemetryState).toBe(canonical.telemetryState);
    expect(operator.operationalStatus).toBe(canonical.operationalStatus);
  });

  it('ready filter uses runtime isReadyToRent', () => {
    const v = vehicle();
    const h = health();
    const runtime = canonicalRuntime(v, h);
    expect(vehicleMatchesOperatorFilter('ready', v, h, true, 0)).toBe(runtime.isReadyToRent);
  });

  it('blocked filter uses runtime isBlocked, not module warning alone', () => {
    const v = vehicle();
    const h = health({
      rental_blocked: false,
      modules: {
        ...health().modules,
        tires: { state: 'warning', reason: 'Profiltiefe', data_stale: false },
      },
    });
    const runtime = canonicalRuntime(v, h);
    expect(runtime.isBlocked).toBe(false);
    expect(vehicleMatchesOperatorFilter('blocked', v, h, true, 0)).toBe(false);
  });

  it('snapshot primary ready aligns with runtime readiness', () => {
    const v = vehicle();
    const h = health();
    const snapshot = deriveOperatorVehicleStatusSnapshot(v, h, true);
    expect(snapshot.runtime.isReadyToRent).toBe(true);
    expect(snapshot.primaryStatus).toBe('ready');
    expect(snapshot.releaseDecision).toBe('yes');
  });

  it('operator badges show ready only when runtime is ready', () => {
    const badges = deriveVehicleOperatorStatuses(vehicle(), health());
    expect(badges.some((badge) => badge.kind === 'ready')).toBe(true);
  });

  it('offline telemetry prevents ready via canonical runtime', () => {
    const v = vehicle({
      online: false,
      lastSignal: '2020-01-01T00:00:00.000Z',
      signalAgeMs: 72 * 60 * 60 * 1000,
    });
    const runtime = canonicalRuntime(v, health());
    expect(runtime.isReadyToRent).toBe(false);
    expect(vehicleMatchesOperatorFilter('ready', v, health(), true, 0)).toBe(false);
  });
});
