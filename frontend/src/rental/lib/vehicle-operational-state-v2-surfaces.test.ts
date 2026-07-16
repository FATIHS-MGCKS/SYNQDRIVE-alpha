import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../data/vehicles';
import {
  applyFleetCommandFilters,
  computeCommandTabCounts,
  resolveFleetCommandTabForVehicle,
} from './fleet-command-filters';
import { buildFleetVehicleContexts } from './fleet-operator-panel';
import { deriveFleetVisualState } from './fleetVisualState';
import { resolveFleetVehicleDisplayState } from './fleetVehicleDisplay';
import { buildDashboardRuntimeModel } from '../components/dashboard/runtime/dashboardSliceBuilder';
import {
  verifyReadyToRentKpiDrawerConsistency,
  verifyUnknownExcludedFromAvailable,
} from '../components/dashboard/runtime/runtimeSliceConsistency';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
  normalizeVehicleOperationalStatus,
} from './vehicle-operational-state';

const futurePickup = new Date(Date.now() + 14 * 24 * 60 * 60_000).toISOString();
const todayPickup = new Date().toISOString();

function fleetVehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  const status = overrides.status ?? VEHICLE_OPERATIONAL_STATUS.AVAILABLE;
  return {
    id: overrides.id ?? 'v1',
    license: overrides.license ?? 'KS-AB 1',
    make: 'VW',
    model: 'Touran',
    year: 2024,
    station: 'Kassel',
    stationId: 'st-1',
    stationName: 'Kassel',
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
    lastSignal: new Date().toISOString(),
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
    isFresh: true,
    onlineStatus: 'ONLINE',
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    lat: 51.31,
    lng: 9.48,
    ...overrides,
  } as VehicleData;
}

describe('Vehicle Operational State V2 — cross-surface consistency', () => {
  const fleet = [
    fleetVehicle({ id: 'avail', license: 'AVL-1' }),
    fleetVehicle({
      id: 'future',
      license: 'FUT-1',
      bookingContext: {
        activeBooking: null,
        reservedBooking: null,
        nextBooking: {
          bookingId: 'bk-future',
          customerName: 'Zukunft Kunde',
          pickupAt: futurePickup,
          returnAt: null,
          pickupStationName: null,
          returnStationName: null,
          isOverdue: false,
        },
        futureBookingCount: 1,
      },
    }),
    fleetVehicle({
      id: 'reserved',
      license: 'RSV-1',
      status: VEHICLE_OPERATIONAL_STATUS.RESERVED,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.RESERVED,
        reason: null,
        source: null,
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: null,
        dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
        dataQualityReasons: [],
        isReliable: true,
      },
      bookingContext: {
        activeBooking: null,
        reservedBooking: {
          bookingId: 'bk-today',
          customerName: 'Heute Kunde',
          pickupAt: todayPickup,
          returnAt: null,
          pickupStationName: 'Kassel',
          returnStationName: null,
          isOverdue: false,
        },
        nextBooking: null,
        futureBookingCount: 0,
      },
    }),
    fleetVehicle({
      id: 'rented',
      license: 'RNT-1',
      status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
        reason: null,
        source: null,
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: null,
        dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
        dataQualityReasons: [],
        isReliable: true,
      },
      bookingContext: {
        activeBooking: {
          bookingId: 'bk-active',
          customerName: 'Mieter',
          pickupAt: todayPickup,
          returnAt: null,
          pickupStationName: null,
          returnStationName: 'Kassel',
          isOverdue: false,
        },
        reservedBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
      },
    }),
    fleetVehicle({
      id: 'unknown',
      license: 'UNK-1',
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
    }),
  ];

  const contexts = buildFleetVehicleContexts(fleet, () => null);

  it('fleet list: future booking stays in Available tab with supplement', () => {
    const future = fleet.find((v) => v.id === 'future')!;
    expect(resolveFleetCommandTabForVehicle(future)).toBe('Available');
    const display = resolveFleetVehicleDisplayState(future, { locale: 'de', compact: true });
    expect(display.statusBadge.label).toBe('Verfügbar');
    expect(display.bookingSupplement?.short).toContain('Nächste Buchung');
  });

  it('fleet list: Reserved on pickup day', () => {
    const reserved = fleet.find((v) => v.id === 'reserved')!;
    expect(resolveFleetCommandTabForVehicle(reserved)).toBe('Reserved');
    expect(resolveFleetVehicleDisplayState(reserved, { locale: 'de' }).statusBadge.label).toBe(
      'Reserviert',
    );
  });

  it('fleet list: Active Rented after pickup', () => {
    const rented = fleet.find((v) => v.id === 'rented')!;
    expect(resolveFleetCommandTabForVehicle(rented)).toBe('Active');
    expect(resolveFleetVehicleDisplayState(rented, { locale: 'de' }).statusBadge.label).toBe(
      'Aktiv vermietet',
    );
  });

  it('fleet list + map: visual state matches list tab for each vehicle', () => {
    for (const v of fleet) {
      const tab = resolveFleetCommandTabForVehicle(v);
      const visual = deriveFleetVisualState({
        status: v.status,
        operationalState: v.operationalState,
        bookingContext: v.bookingContext,
        lat: v.lat,
        lng: v.lng,
        healthStatus: v.healthStatus,
        onlineStatus: v.onlineStatus,
        lastSignal: v.lastSignal,
        isFresh: v.isFresh,
        activeIsOverdue: false,
        reservedIsOverdue: false,
        maintenanceUrgency: null,
        maintenanceReasonCode: null,
      });
      if (tab === 'Available') expect(visual.rentalStatus).toBe('available');
      if (tab === 'Reserved') expect(visual.rentalStatus).toBe('reserved');
      if (tab === 'Active') expect(visual.rentalStatus).toBe('active_rented');
      if (tab === 'Unknown') expect(visual.rentalStatus).toBe('unknown');
    }
  });

  it('fleet map: UNKNOWN uses neutral chip tone', () => {
    const unknown = fleet.find((v) => v.id === 'unknown')!;
    const visual = deriveFleetVisualState({
      status: unknown.status,
      operationalState: unknown.operationalState,
      bookingContext: unknown.bookingContext,
      lat: unknown.lat,
      lng: unknown.lng,
      healthStatus: unknown.healthStatus,
      onlineStatus: 'OFFLINE',
      lastSignal: null,
      isFresh: false,
      activeIsOverdue: false,
      reservedIsOverdue: false,
      maintenanceUrgency: null,
      maintenanceReasonCode: null,
    });
    expect(visual.chipTone).toBe('muted');
    expect(visual.mapTone).toBe('unknown');
  });

  it('tab counts align with filtered fleet list', () => {
    const counts = computeCommandTabCounts(contexts);
    expect(counts.Available).toBe(applyFleetCommandFilters(contexts, { tab: 'Available', searchQuery: '' }).length);
    expect(counts.Reserved).toBe(applyFleetCommandFilters(contexts, { tab: 'Reserved', searchQuery: '' }).length);
    expect(counts.Active).toBe(applyFleetCommandFilters(contexts, { tab: 'Active', searchQuery: '' }).length);
    expect(counts.Unknown).toBe(1);
  });

  it('dashboard runtime: ready-to-rent and unknown exclusion', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'de',
      fleetVehicles: fleet,
      blockedVehicleIds: new Set(),
      now: new Date(),
    });
    expect(verifyUnknownExcludedFromAvailable(runtime)).toBe(true);
    const readyChecks = verifyReadyToRentKpiDrawerConsistency(runtime);
    for (const check of readyChecks) {
      expect(check.kpiCount).toBe(check.drawerCount);
    }
    expect(runtime.slices['ready-to-rent'].count).toBeGreaterThanOrEqual(2);
  });

  it('safe fallback: null/unknown/degraded/unavailable never become Available', () => {
    expect(normalizeVehicleOperationalStatus(null).status).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
    expect(
      normalizeVehicleOperationalStatus({
        status: '???',
        dataQualityState: VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE,
      }).status,
    ).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
    expect(
      normalizeVehicleOperationalStatus({
        status: 'Available',
        dataQualityState: VEHICLE_DATA_QUALITY_STATE.DEGRADED,
        isReliable: false,
      }).status,
    ).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
  });
});
