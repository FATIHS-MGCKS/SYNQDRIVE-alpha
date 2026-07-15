import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../../../data/vehicles';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
} from '../../../lib/vehicle-operational-state';
import { buildVehicleRuntimeStates } from './vehicleRuntimeStateBuilder';
import {
  deriveIsReadyForRenting,
  reasonBlocksReadyForRenting,
  RENTAL_READINESS_NEXT_BOOKING_INFO_SOURCE,
} from './rentalReadiness';
import { createRuntimeReason } from './dashboardRuntimeReasons';

const NOW = new Date('2026-07-15T12:00:00.000Z');

function twoWeeksFromNowIso(): string {
  return new Date(NOW.getTime() + 14 * 24 * 60 * 60_000).toISOString();
}

function operationalVehicle(
  status: (typeof VEHICLE_OPERATIONAL_STATUS)[keyof typeof VEHICLE_OPERATIONAL_STATUS],
  extra: Partial<VehicleData> = {},
): VehicleData {
  return {
    id: extra.id ?? 'v1',
    license: extra.license ?? 'M-AB 123',
    model: 'Golf',
    year: 2024,
    station: 'Berlin',
    fuelType: 'Petrol',
    status,
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
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    operationalState: {
      status,
      reason: null,
      source: 'fleet-read-model',
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: NOW.toISOString(),
      dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
      dataQualityReasons: [],
      isReliable: true,
      ...extra.operationalState,
    },
    ...extra,
  };
}

describe('deriveIsReadyForRenting', () => {
  it('Available without booking → Ready', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [operationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE)],
      now: NOW,
    });
    expect(state?.operationalStatus).toBe('available');
    expect(state?.isReadyToRent).toBe(true);
    expect(state?.rentalReadiness).toBe('ready');
  });

  it('Available with booking in two weeks → Ready (nextBooking is info only)', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [
        operationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
          bookingContext: {
            activeBooking: null,
            reservedBooking: null,
            nextBooking: {
              bookingId: 'bk-future',
              customerName: 'Future Customer',
              pickupAt: twoWeeksFromNowIso(),
              returnAt: new Date(NOW.getTime() + 16 * 24 * 60 * 60_000).toISOString(),
              pickupStationName: 'Berlin',
              returnStationName: 'Berlin',
              isOverdue: false,
            },
            futureBookingCount: 1,
          },
        }),
      ],
      now: NOW,
      locale: 'de',
    });
    expect(state?.isReadyToRent).toBe(true);
    expect(state?.readyReasons.length).toBeGreaterThan(0);
    expect(
      state?.readyReasons.some((r) => r.source === RENTAL_READINESS_NEXT_BOOKING_INFO_SOURCE),
    ).toBe(true);
    expect(reasonBlocksReadyForRenting(
      createRuntimeReason({
        source: RENTAL_READINESS_NEXT_BOOKING_INFO_SOURCE,
        category: 'handover',
        severity: 'info',
        title: 'Next',
      }),
    )).toBe(false);
  });

  it('Reserved today → Not Ready', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [
        operationalVehicle(VEHICLE_OPERATIONAL_STATUS.RESERVED, {
          bookingContext: {
            activeBooking: null,
            reservedBooking: {
              bookingId: 'bk-res',
              customerName: 'Pickup Today',
              pickupAt: NOW.toISOString(),
              returnAt: new Date(NOW.getTime() + 24 * 60 * 60_000).toISOString(),
              pickupStationName: 'Berlin',
              returnStationName: 'Berlin',
              isOverdue: false,
            },
            nextBooking: null,
            futureBookingCount: 0,
          },
        }),
      ],
      now: NOW,
    });
    expect(state?.operationalStatus).toBe('reserved');
    expect(state?.isReadyToRent).toBe(false);
    expect(state?.rentalReadiness).not.toBe('ready');
  });

  it('Active Rented → Not Ready', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [
        operationalVehicle(VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED, {
          bookingContext: {
            activeBooking: {
              bookingId: 'bk-active',
              customerName: 'Renter',
              pickupAt: new Date(NOW.getTime() - 24 * 60 * 60_000).toISOString(),
              returnAt: new Date(NOW.getTime() + 24 * 60 * 60_000).toISOString(),
              pickupStationName: 'Berlin',
              returnStationName: 'Berlin',
              isOverdue: false,
            },
            reservedBooking: null,
            nextBooking: null,
            futureBookingCount: 0,
          },
        }),
      ],
      now: NOW,
    });
    expect(state?.operationalStatus).toBe('active_rented');
    expect(state?.isReadyToRent).toBe(false);
  });

  it('Unknown → Not Ready', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [operationalVehicle(VEHICLE_OPERATIONAL_STATUS.UNKNOWN)],
      now: NOW,
    });
    expect(state?.operationalStatus).toBe('unknown');
    expect(state?.isReadyToRent).toBe(false);
  });

  it('future booking plus maintenance → Not Ready due to maintenance', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [
        operationalVehicle(VEHICLE_OPERATIONAL_STATUS.MAINTENANCE, {
          operationalState: {
            status: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
            reason: 'SCHEDULED_SERVICE',
            source: 'fleet-read-model',
            effectiveFrom: null,
            effectiveUntil: null,
            derivedAt: NOW.toISOString(),
            dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
            dataQualityReasons: [],
            isReliable: true,
          },
          bookingContext: {
            activeBooking: null,
            reservedBooking: null,
            nextBooking: {
              bookingId: 'bk-future',
              customerName: 'Future',
              pickupAt: twoWeeksFromNowIso(),
              returnAt: null,
              pickupStationName: 'Berlin',
              returnStationName: null,
              isOverdue: false,
            },
            futureBookingCount: 1,
          },
        }),
      ],
      now: NOW,
    });
    expect(state?.isMaintenance).toBe(true);
    expect(state?.isReadyToRent).toBe(false);
    expect(state?.isBlocked).toBe(true);
  });

  it('requires backend dataQualityState RELIABLE', () => {
    const ready = deriveIsReadyForRenting({
      operationalBlock: {
        canonicalStatus: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
        backendDataQualityState: VEHICLE_DATA_QUALITY_STATE.DEGRADED,
        isReliable: true,
      },
      operationalStatus: 'available',
      cleaningStatus: 'Clean',
      blockLevel: 'none',
      reasons: [],
      telemetryState: 'live',
      nextBooking: null,
    });
    expect(ready).toBe(false);
  });
});
