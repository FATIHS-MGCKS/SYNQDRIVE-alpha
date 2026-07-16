import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../../rental/data/vehicles';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
} from '../../rental/lib/vehicle-operational-state';
import { deriveVehicleOperatorStatuses } from './operatorStatus';

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: 'veh-1',
    license: 'KS FH 660E',
    make: 'Tesla',
    model: 'Model 3',
    year: 2024,
    station: 'Kassel',
    stationId: 'st-1',
    fuelType: 'Electric',
    status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    operationalState: {
      status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
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
      reservedBooking: null,
      nextBooking: null,
      futureBookingCount: 0,
    },
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: new Date().toISOString(),
    badge: 0,
    odometer: 10000,
    fuel: 80,
    battery: 72,
    speed: 0,
    coolant: 90,
    brakes: 90,
    tires: 90,
    engineOil: 90,
    isElectric: true,
    hvBatteryCapacityKwh: 75,
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    ...overrides,
  } as VehicleData;
}

describe('deriveVehicleOperatorStatuses — operational consistency', () => {
  it('shows Bereit for reliable Available vehicle', () => {
    const badges = deriveVehicleOperatorStatuses(vehicle());
    expect(badges.some((b) => b.kind === 'ready')).toBe(true);
  });

  it('shows Vermietet for Active Rented', () => {
    const badges = deriveVehicleOperatorStatuses(
      vehicle({
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
      }),
    );
    expect(badges.some((b) => b.kind === 'rented')).toBe(true);
  });

  it('shows Reserviert for Reserved pickup window', () => {
    const badges = deriveVehicleOperatorStatuses(
      vehicle({
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
      }),
    );
    expect(badges.some((b) => b.kind === 'reserved')).toBe(true);
  });

  it('uses neutral Status nicht verfügbar for unreliable operational state', () => {
    const badges = deriveVehicleOperatorStatuses(
      vehicle({
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
    );
    expect(badges).toHaveLength(1);
    expect(badges[0]?.label).toBe('Status nicht verfügbar');
    expect(badges[0]?.tone).toBe('neutral');
  });
});
