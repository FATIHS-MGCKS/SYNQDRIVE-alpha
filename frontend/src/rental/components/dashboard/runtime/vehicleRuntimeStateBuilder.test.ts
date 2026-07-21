import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../../../data/vehicles';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
} from '../../../lib/vehicle-operational-state';
import {
  buildVehicleRuntimeStates,
  resolveVehicleRuntimeOperationalBlock,
} from './vehicleRuntimeStateBuilder';

const NOW = new Date('2026-07-15T12:00:00.000Z');

const BOOKING_REF = {
  bookingId: 'bk-1',
  customerName: 'Max Mustermann',
  pickupAt: '2026-07-15T08:00:00.000Z',
  returnAt: '2026-07-16T08:00:00.000Z',
  pickupStationName: 'Berlin',
  returnStationName: 'Berlin',
  isOverdue: false,
};

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v1',
    license: overrides.license ?? 'M-AB 123',
    make: overrides.make ?? 'VW',
    model: overrides.model ?? 'Golf',
    year: overrides.year ?? 2024,
    station: overrides.station ?? 'Berlin',
    stationId: overrides.stationId ?? 'st-1',
    fuelType: overrides.fuelType ?? 'Petrol',
    status: overrides.status ?? VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    cleaningStatus: overrides.cleaningStatus ?? 'Clean',
    healthStatus: overrides.healthStatus ?? 'Good Health',
    online: overrides.online ?? true,
    lastSignal: overrides.lastSignal ?? NOW.toISOString(),
    badge: overrides.badge ?? 0,
    odometer: overrides.odometer ?? 10000,
    fuel: overrides.fuel ?? 72,
    battery: overrides.battery ?? 100,
    speed: overrides.speed ?? 0,
    coolant: overrides.coolant ?? 90,
    brakes: overrides.brakes ?? 90,
    tires: overrides.tires ?? 90,
    engineOil: overrides.engineOil ?? 90,
    isElectric: overrides.isElectric ?? false,
    hvBatteryCapacityKwh: overrides.hvBatteryCapacityKwh ?? null,
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    ...overrides,
  };
}

function operationalVehicle(
  status: (typeof VEHICLE_OPERATIONAL_STATUS)[keyof typeof VEHICLE_OPERATIONAL_STATUS],
  extra: Partial<VehicleData> = {},
): VehicleData {
  return vehicle({
    status,
    operationalState: {
      status,
      reason: extra.operationalState?.reason ?? null,
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
  });
}

describe('resolveVehicleRuntimeOperationalBlock', () => {
  it('keeps future nextBooking available — nextBooking alone does not change status', () => {
    const v = operationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      bookingContext: {
        activeBooking: null,
        reservedBooking: null,
        nextBooking: { ...BOOKING_REF, bookingId: 'bk-next' },
        futureBookingCount: 1,
      },
    });

    const block = resolveVehicleRuntimeOperationalBlock(v);
    expect(block.operationalStatus).toBe('available');
    expect(block.canonicalStatus).toBe(VEHICLE_OPERATIONAL_STATUS.AVAILABLE);
    expect(block.bookingContext.nextBooking?.bookingId).toBe('bk-next');
    expect(block.bookingContext.reservedBooking).toBeNull();
    expect(block.payloadInconsistent).toBe(false);
  });

  it('maps pickup reservation window to reserved when backend confirms RESERVED', () => {
    const v = operationalVehicle(VEHICLE_OPERATIONAL_STATUS.RESERVED, {
      bookingContext: {
        activeBooking: null,
        reservedBooking: BOOKING_REF,
        nextBooking: null,
        futureBookingCount: 0,
      },
    });

    const block = resolveVehicleRuntimeOperationalBlock(v);
    expect(block.operationalStatus).toBe('reserved');
    expect(block.bookingContext.reservedBooking?.bookingId).toBe('bk-1');
  });

  it('maps active rental to active_rented when backend confirms ACTIVE_RENTED', () => {
    const v = operationalVehicle(VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED, {
      bookingContext: {
        activeBooking: BOOKING_REF,
        reservedBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
      },
    });

    const block = resolveVehicleRuntimeOperationalBlock(v);
    expect(block.operationalStatus).toBe('active_rented');
    expect(block.bookingContext.activeBooking?.bookingId).toBe('bk-1');
  });

  it('keeps UNKNOWN as unknown and never available', () => {
    const v = operationalVehicle(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);

    const block = resolveVehicleRuntimeOperationalBlock(v);
    expect(block.operationalStatus).toBe('unknown');
    expect(block.canonicalStatus).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);

    const [state] = buildVehicleRuntimeStates({ fleetVehicles: [v], now: NOW });
    expect(state?.isAvailable).toBe(false);
    expect(state?.isReadyToRent).toBe(false);
    expect(state?.operationalStatus).toBe('unknown');
  });

  it('maps maintenance and blocked to runtime maintenance/unavailable', () => {
    const maintenance = resolveVehicleRuntimeOperationalBlock(
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
      }),
    );
    expect(maintenance.operationalStatus).toBe('maintenance');
    expect(maintenance.operationalReason).toBe('SCHEDULED_SERVICE');

    const blocked = resolveVehicleRuntimeOperationalBlock(
      operationalVehicle(VEHICLE_OPERATIONAL_STATUS.BLOCKED, {
        operationalState: {
          status: VEHICLE_OPERATIONAL_STATUS.BLOCKED,
          reason: 'OPERATIONAL_BLOCK',
          source: 'fleet-read-model',
          effectiveFrom: null,
          effectiveUntil: null,
          derivedAt: NOW.toISOString(),
          dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
          dataQualityReasons: [],
          isReliable: true,
        },
      }),
    );
    expect(blocked.operationalStatus).toBe('unavailable');
    expect(blocked.operationalReason).toBe('OPERATIONAL_BLOCK');
  });

  it('diagnoses inconsistent legacy payload without assuming available', () => {
    const v = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
        reason: null,
        source: 'legacy',
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: null,
        dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
        dataQualityReasons: [],
        isReliable: true,
      },
      activeBookingId: 'bk-conflict',
    });

    const block = resolveVehicleRuntimeOperationalBlock(v);
    expect(block.operationalStatus).toBe('unknown');
    expect(block.payloadInconsistent).toBe(true);

    const [state] = buildVehicleRuntimeStates({ fleetVehicles: [v], now: NOW, locale: 'de' });
    expect(state?.isAvailable).toBe(false);
    expect(state?.isReadyToRent).toBe(false);
    expect(
      state?.notReadyReasons.some((reason) => reason.source === 'vehicle-runtime:payload-inconsistent'),
    ).toBe(true);
  });

  it('uses rawVehicleStatus only as diagnostic info', () => {
    const v = operationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, {
      rawVehicleStatus: 'RENTED',
    });

    const block = resolveVehicleRuntimeOperationalBlock(v);
    expect(block.operationalStatus).toBe('available');
    expect(block.rawVehicleStatus).toBe('RENTED');

    const [state] = buildVehicleRuntimeStates({ fleetVehicles: [v], now: NOW, locale: 'en' });
    expect(state?.operationalStatus).toBe('available');
    expect(
      state?.warningReasons.some((reason) => reason.source === 'vehicle-runtime:raw-status-diagnostic'),
    ).toBe(true);
  });
});

describe('buildVehicleRuntimeStates readiness rules', () => {
  it('preserves ready-to-rent when operationally available and clean', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [operationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE)],
      now: NOW,
    });
    expect(state?.isReadyToRent).toBe(true);
    expect(state?.rentalReadiness).toBe('ready');
    expect(state?.isAvailable).toBe(true);
  });

  it('preserves not-ready for dirty available vehicle without blocking', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [
        operationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, { cleaningStatus: 'Needs Cleaning' }),
      ],
      now: NOW,
    });
    expect(state?.isReadyToRent).toBe(false);
    expect(state?.isBlocked).toBe(false);
    expect(state?.warningReasons.some((reason) => reason.category === 'cleaning')).toBe(true);
  });

  it('preserves maintenance hard block', () => {
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [operationalVehicle(VEHICLE_OPERATIONAL_STATUS.MAINTENANCE)],
      now: NOW,
    });
    expect(state?.isMaintenance).toBe(true);
    expect(state?.isBlocked).toBe(true);
    expect(state?.blockReasons.some((reason) => reason.source === 'vehicle-status:maintenance')).toBe(
      true,
    );
  });

  it('blocks ready-to-rent when open service case blocks rental', () => {
    const vehicle = operationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE);
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [vehicle],
      rentalBlockingServiceCases: new Map([
        [vehicle.id, { id: 'case-1', title: 'Getriebe-Reparatur' }],
      ]),
      now: NOW,
    });
    expect(state?.isReadyToRent).toBe(false);
    expect(state?.isBlocked).toBe(true);
    expect(
      state?.blockReasons.some((reason) => reason.source === 'service-case:case-1'),
    ).toBe(true);
  });
});
