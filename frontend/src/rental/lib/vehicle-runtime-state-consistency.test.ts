import { describe, expect, it } from 'vitest';
import type { RentalHealthModule, RentalHealthState, VehicleHealthResponse } from '../../lib/api';
import { buildDashboardRuntimeModel } from '../components/dashboard/runtime/dashboardSliceBuilder';
import { buildVehicleRuntimeStates } from '../components/dashboard/runtime/vehicleRuntimeStateBuilder';
import type { VehicleData } from '../data/vehicles';
import { deriveFleetVisualState } from './fleetVisualState';
import { resolveFleetVehicleDisplayState } from './fleetVehicleDisplay';
import { resolveVehicleDetailHeaderReadinessChip } from './vehicle-detail-header-status';
import {
  crossSurfaceRentalReadinessToFleetAvailability,
  resolveCrossSurfaceRentalReadiness,
} from './vehicle-rental-readiness';
import { deriveRuntimeTelemetryState } from './vehicle-telemetry-runtime';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
} from './vehicle-operational-state';

const NOW = new Date('2026-07-18T12:00:00.000Z');

function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * 3_600_000).toISOString();
}

function mod(state: RentalHealthState, reason = ''): RentalHealthModule {
  return { state, reason, last_updated_at: null, data_stale: false };
}

function health(overrides: Partial<VehicleHealthResponse> = {}): VehicleHealthResponse {
  return {
    vehicle_id: 'v1',
    organization_id: 'org-1',
    overall_state: 'good',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {
      battery: mod('good'),
      tires: mod('good'),
      brakes: mod('good'),
      error_codes: mod('good'),
      service_compliance: mod('good'),
      complaints: mod('good'),
      vehicle_alerts: mod('good'),
    },
    generated_at: NOW.toISOString(),
    ...overrides,
  };
}

function fleetVehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  const status = overrides.status ?? VEHICLE_OPERATIONAL_STATUS.AVAILABLE;
  return {
    id: overrides.id ?? 'v1',
    license: overrides.license ?? 'KS-RS 1',
    make: 'VW',
    model: 'Golf',
    year: 2024,
    station: 'Kassel',
    stationId: 'st-1',
    fuelType: 'Petrol',
    status,
    operationalState: {
      status,
      reason: null,
      source: null,
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: null,
      dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
      dataQualityReasons: [],
      isReliable: true,
      ...overrides.operationalState,
    },
    bookingContext: {
      activeBooking: null,
      reservedBooking: null,
      nextBooking: null,
      futureBookingCount: 0,
      ...overrides.bookingContext,
    },
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: NOW.toISOString(),
    badge: 0,
    odometer: 10000,
    fuel: 72,
    battery: 100,
    speed: 0,
    coolant: 90,
    brakes: 90,
    tires: 90,
    engineOil: 90,
    isElectric: false,
    hvBatteryCapacityKwh: null,
    lat: 51.31,
    lng: 9.48,
    isFresh: true,
    onlineStatus: 'ONLINE',
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    ...overrides,
  } as VehicleData;
}

function collectSurfaceStates(
  vehicle: VehicleData,
  rentalHealth: VehicleHealthResponse | null = null,
) {
  const header = resolveVehicleDetailHeaderReadinessChip(vehicle, rentalHealth, 'de');
  const fleet = resolveFleetVehicleDisplayState(vehicle, { rentalHealth, locale: 'de', now: NOW.getTime() });
  const visual = deriveFleetVisualState(vehicle, { rentalHealth });
  const crossSurface = resolveCrossSurfaceRentalReadiness(vehicle, {
    rentalHealth,
    now: NOW.getTime(),
  });
  const runtime = buildVehicleRuntimeStates({
    fleetVehicles: [vehicle],
    healthMap: rentalHealth ? new Map([[vehicle.id, rentalHealth]]) : undefined,
    now: NOW,
  })[0];
  const dashboard = buildDashboardRuntimeModel({
    locale: 'de',
    fleetVehicles: [vehicle],
    healthMap: rentalHealth ? new Map([[vehicle.id, rentalHealth]]) : undefined,
    now: NOW,
  });

  return { header, fleet, visual, crossSurface, runtime, dashboard };
}

describe('vehicle runtime state — cross-surface consistency', () => {
  it('available clean vehicle is ready across fleet, dashboard, and cross-surface resolver', () => {
    const vehicle = fleetVehicle();
    const surfaces = collectSurfaceStates(vehicle);

    expect(surfaces.crossSurface.isReadyToRent).toBe(true);
    expect(surfaces.fleet.rentalDisplay.status).toBe('ready');
    expect(surfaces.runtime.isReadyToRent).toBe(true);
    expect(surfaces.runtime.rentalReadiness).toBe('ready');
    expect(surfaces.header.statusBadge.label).toBe('Verfügbar');
    expect(surfaces.dashboard.slices['ready-to-rent'].count).toBe(1);
  });

  it('needs cleaning blocks readiness but keeps operational status available', () => {
    const vehicle = fleetVehicle({ cleaningStatus: 'Needs Cleaning' });
    const surfaces = collectSurfaceStates(vehicle);

    expect(surfaces.crossSurface.isReadyToRent).toBe(false);
    expect(surfaces.crossSurface.isCleaningBlocked).toBe(true);
    expect(surfaces.fleet.rentalDisplay.status).toBe('not_ready');
    expect(surfaces.runtime.isReadyToRent).toBe(false);
    expect(surfaces.runtime.isMaintenance).toBe(false);
    expect(surfaces.runtime.isBlocked).toBe(false);
    expect(surfaces.header.statusBadge.label).toBe('Verfügbar');
  });

  it('health warning alone does not block rental readiness', () => {
    const rentalHealth = health({
      overall_state: 'warning',
      modules: {
        ...health().modules,
        tires: mod('warning', 'Monitor tread'),
      },
    });
    const vehicle = fleetVehicle();
    const surfaces = collectSurfaceStates(vehicle, rentalHealth);

    expect(surfaces.crossSurface.isReadyToRent).toBe(true);
    expect(surfaces.crossSurface.isHealthWarningOnly).toBe(true);
    expect(surfaces.fleet.rentalDisplay.status).toBe('ready');
    expect(surfaces.runtime.isReadyToRent).toBe(true);
    expect(surfaces.runtime.isCritical).toBe(false);
    expect(surfaces.runtime.isMaintenance).toBe(false);
  });

  it('service-only overdue critical does not hard-block rental readiness', () => {
    const rentalHealth = health({
      overall_state: 'critical',
      rental_blocked: false,
      modules: {
        ...health().modules,
        service_compliance: mod('critical', 'Service overdue'),
      },
    });
    const vehicle = fleetVehicle();
    const surfaces = collectSurfaceStates(vehicle, rentalHealth);

    expect(surfaces.crossSurface.isReadyToRent).toBe(true);
    expect(surfaces.fleet.rentalDisplay.status).toBe('ready');
    expect(surfaces.runtime.isReadyToRent).toBe(true);
    expect(surfaces.runtime.isBlocked).toBe(false);
    expect(surfaces.fleet.rentalDisplay.label).toMatch(/Aktion nötig|Action needed/);
  });

  it('TÜV hard blocker keeps fleet and dashboard blocked with operational badge unchanged', () => {
    const rentalHealth = health({
      rental_blocked: true,
      blocking_reasons: ['TÜV expired'],
      overall_state: 'critical',
    });
    const vehicle = fleetVehicle();
    const surfaces = collectSurfaceStates(vehicle, rentalHealth);

    expect(surfaces.crossSurface.isReadyToRent).toBe(false);
    expect(surfaces.crossSurface.isHardBlocked).toBe(true);
    expect(surfaces.fleet.rentalDisplay.status).toBe('blocked');
    expect(surfaces.runtime.isReadyToRent).toBe(false);
    expect(surfaces.runtime.isBlocked).toBe(true);
    expect(surfaces.header.statusBadge.label).toBe('Verfügbar');
  });

  it('no_signal telemetry blocks readiness consistently with offline gate', () => {
    const vehicle = fleetVehicle({
      lastSignal: '',
      signalAgeMs: undefined,
      onlineStatus: 'OFFLINE',
      isFresh: false,
    });
    const surfaces = collectSurfaceStates(vehicle);

    expect(deriveRuntimeTelemetryState(vehicle, NOW)).toBe('offline');
    expect(surfaces.crossSurface.isTelemetryBlocked).toBe(true);
    expect(surfaces.crossSurface.isReadyToRent).toBe(false);
    expect(surfaces.fleet.rentalDisplay.status).toBe('not_ready');
    expect(surfaces.runtime.isReadyToRent).toBe(false);
    expect(surfaces.runtime.telemetryState).toBe('offline');
  });

  it('unknown operational status stays unknown and never becomes available', () => {
    const vehicle = fleetVehicle({
      status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
        reason: 'TELEMETRY_STALE',
        source: null,
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: null,
        dataQualityState: VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE,
        dataQualityReasons: ['no_signal'],
        isReliable: false,
      },
    });
    const surfaces = collectSurfaceStates(vehicle);

    expect(surfaces.crossSurface.readiness).toBe('unknown');
    expect(surfaces.crossSurface.isReadyToRent).toBe(false);
    expect(surfaces.header.statusBadge.label).toMatch(/Unbekannt|Status nicht verfügbar/);
    expect(surfaces.fleet.statusBadge.label).toMatch(/Unbekannt|Status nicht verfügbar/);
    expect(
      crossSurfaceRentalReadinessToFleetAvailability(surfaces.crossSurface.readiness),
    ).toBe('not_ready');
    expect(surfaces.runtime.operationalStatus).toBe('unknown');
    expect(surfaces.runtime.isReadyToRent).toBe(false);
  });

  it('critical health module blocks readiness without forcing maintenance operational status', () => {
    const rentalHealth = health({
      rental_blocked: true,
      blocking_reasons: ['Active fault code P0420'],
      modules: {
        ...health().modules,
        error_codes: mod('critical', '1 active fault code'),
      },
    });
    const vehicle = fleetVehicle();
    const surfaces = collectSurfaceStates(vehicle, rentalHealth);

    expect(surfaces.runtime.isMaintenance).toBe(false);
    expect(surfaces.runtime.operationalStatus).toBe('available');
    expect(surfaces.runtime.isReadyToRent).toBe(false);
    expect(surfaces.runtime.isBlocked).toBe(true);
    expect(surfaces.fleet.rentalDisplay.status).toBe('blocked');
    expect(surfaces.visual.readiness).toBe('blocked');
  });

  it('fleet visual readiness aligns with cross-surface resolver for offline available vehicle', () => {
    const vehicle = fleetVehicle({
      lastSignal: hoursAgo(72),
      signalAgeMs: 72 * 3_600_000,
      onlineStatus: 'OFFLINE',
      isFresh: false,
    });
    const crossSurface = resolveCrossSurfaceRentalReadiness(vehicle, { now: NOW.getTime() });
    const visual = deriveFleetVisualState(vehicle);

    expect(crossSurface.isReadyToRent).toBe(false);
    expect(visual.readiness).toBe('offline');
    expect(visual.isReady).toBe(false);
  });
});
