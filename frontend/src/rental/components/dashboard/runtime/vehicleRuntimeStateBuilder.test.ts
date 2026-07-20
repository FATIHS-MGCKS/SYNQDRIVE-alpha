import { describe, expect, it } from 'vitest';
import type { ApiServiceCase } from '../../../../lib/api';
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
});

function serviceCase(overrides: Partial<ApiServiceCase> = {}): ApiServiceCase {
  return {
    id: overrides.id ?? 'sc-1',
    organizationId: overrides.organizationId ?? 'org-1',
    vehicleId: overrides.vehicleId ?? 'v1',
    vendorId: overrides.vendorId ?? null,
    title: overrides.title ?? 'Servicefall blockiert Vermietung',
    description: overrides.description ?? 'Werkstatt',
    category: overrides.category ?? 'REPAIR',
    status: overrides.status ?? 'IN_PROGRESS',
    priority: overrides.priority ?? 'HIGH',
    source: overrides.source ?? 'MANUAL',
    openedAt: overrides.openedAt ?? '2026-07-10T08:00:00.000Z',
    scheduledAt: overrides.scheduledAt ?? '2026-07-18T09:00:00.000Z',
    expectedReadyAt: overrides.expectedReadyAt ?? '2026-07-19T17:00:00.000Z',
    completedAt: overrides.completedAt ?? null,
    cancelledAt: overrides.cancelledAt ?? null,
    estimatedCostCents: overrides.estimatedCostCents ?? null,
    actualCostCents: overrides.actualCostCents ?? null,
    downtimeStart: overrides.downtimeStart ?? null,
    downtimeEnd: overrides.downtimeEnd ?? null,
    blocksRental: overrides.blocksRental ?? true,
    completionNotes: overrides.completionNotes ?? null,
    documentId: overrides.documentId ?? null,
    metadata: overrides.metadata ?? null,
    createdByUserId: overrides.createdByUserId ?? null,
    updatedByUserId: overrides.updatedByUserId ?? null,
    createdAt: overrides.createdAt ?? '2026-07-10T08:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-07-10T08:00:00.000Z',
    taskCount: overrides.taskCount ?? 0,
    tasks: overrides.tasks ?? [],
    comments: overrides.comments,
    attachments: overrides.attachments,
  };
}

describe('buildVehicleRuntimeStates service cases', () => {
  it('adds blocking service-case reasons without changing rental-health overall_state', () => {
    const v = operationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, { id: 'v1' });
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [v],
      now: NOW,
      serviceCases: [serviceCase({ vehicleId: 'v1', id: 'sc-block' })],
      healthMap: new Map([
        [
          'v1',
          {
            vehicle_id: 'v1',
            organization_id: 'org-1',
            overall_state: 'good',
            rental_blocked: false,
            blocking_reasons: [],
            modules: {},
            generated_at: NOW.toISOString(),
          },
        ],
      ]),
    });

    const serviceReason = state?.blockReasons.find((reason) => reason.source === 'SERVICE_CASE');
    expect(serviceReason).toMatchObject({
      reasonCode: 'SERVICE_CASE_BLOCKS_RENTAL',
      serviceCaseId: 'sc-block',
      title: 'Servicefall blockiert Vermietung',
      status: 'IN_PROGRESS',
      scheduledAt: '2026-07-18T09:00:00.000Z',
      expectedReadyAt: '2026-07-19T17:00:00.000Z',
      blocking: true,
      source: 'SERVICE_CASE',
    });
    expect(state?.healthSeverity).toBe('ok');
    expect(state?.isReadyToRent).toBe(false);
    expect(state?.isBlocked).toBe(true);
    expect(state?.blockLevel).toBe('hard_blocked');
  });

  it('ignores completed and cancelled service cases', () => {
    const v = operationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, { id: 'v1' });
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [v],
      now: NOW,
      serviceCases: [
        serviceCase({ id: 'sc-done', status: 'COMPLETED' }),
        serviceCase({ id: 'sc-cancelled', status: 'CANCELLED' }),
      ],
    });

    expect(state?.blockReasons.some((reason) => reason.source === 'SERVICE_CASE')).toBe(false);
    expect(state?.isReadyToRent).toBe(true);
  });

  it('supports multiple active blocking cases on one vehicle', () => {
    const v = operationalVehicle(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, { id: 'v1' });
    const [state] = buildVehicleRuntimeStates({
      fleetVehicles: [v],
      now: NOW,
      serviceCases: [
        serviceCase({ id: 'sc-1', title: 'Bremsen' }),
        serviceCase({ id: 'sc-2', title: 'Karosserie' }),
      ],
    });

    const serviceReasons = state?.blockReasons.filter((reason) => reason.source === 'SERVICE_CASE');
    expect(serviceReasons).toHaveLength(2);
    expect(serviceReasons?.map((reason) => reason.serviceCaseId).sort()).toEqual(['sc-1', 'sc-2']);
  });
});
