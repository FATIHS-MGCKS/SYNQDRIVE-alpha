import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFleetMapStore } from '../../stores/useFleetMapStore';
import type { FleetMapVehicle } from '../../stores/useFleetMapStore';
import {
  derivePickupOptimisticPatch,
  deriveReturnOptimisticPatch,
  deriveReserveOptimisticPatch,
  deriveReleaseOptimisticPatch,
} from './optimistic';
import {
  invalidateVehicleOperationalState,
  invalidateVehicleOperationalAfterBookingChange,
} from './invalidate';
import {
  registerVehicleOperationalInvalidationHandler,
  resetVehicleOperationalInvalidationHandlers,
} from './registry';
import { vehicleOperationalQueryKeys } from './keys';
import { VEHICLE_DATA_QUALITY_STATE, VEHICLE_OPERATIONAL_STATUS } from '../vehicle-operational-state';

function makeVehicle(overrides: Partial<FleetMapVehicle> = {}): FleetMapVehicle {
  const status = overrides.status ?? VEHICLE_OPERATIONAL_STATUS.RESERVED;
  const operationalState =
    overrides.operationalState ??
    ({
      status,
      reason: null,
      source: null,
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: null,
      dataQualityState:
        overrides.dataQualityState ?? VEHICLE_DATA_QUALITY_STATE.RELIABLE,
      dataQualityReasons: overrides.dataQualityReasons ?? [],
      isReliable: overrides.isReliable ?? true,
    } as FleetMapVehicle['operationalState']);

  const bookingContext =
    overrides.bookingContext ??
    ({
      activeBooking: null,
      reservedBooking: overrides.reservedBookingId
        ? {
            bookingId: overrides.reservedBookingId ?? 'bk-1',
            customerName: overrides.reservedCustomerName ?? 'Max',
            pickupAt: overrides.reservedPickupAt ?? '2026-07-15T10:00:00.000Z',
            returnAt: overrides.reservedReturnAt ?? null,
            pickupStationName: overrides.reservedPickupStationName ?? 'Berlin',
            returnStationName: null,
            isOverdue: overrides.reservedIsOverdue ?? false,
          }
        : null,
      nextBooking: null,
      futureBookingCount: 0,
    } as FleetMapVehicle['bookingContext']);

  return {
    id: 'veh-1',
    license: 'M-AB 123',
    make: 'VW',
    model: 'Golf',
    year: 2024,
    station: 'Berlin',
    homeStationId: 'st-1',
    currentStationId: 'st-1',
    expectedStationId: null,
    fuelType: 'Petrol',
    status,
    rawVehicleStatus: overrides.rawVehicleStatus ?? 'Reserved',
    operationalState,
    bookingContext,
    dataQualityReasons: operationalState.dataQualityReasons,
    dataQualityState: operationalState.dataQualityState,
    isReliable: operationalState.isReliable,
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: true,
    lastSignal: '',
    badge: 0,
    odometer: 10000,
    fuel: 80,
    fuelLevel: 80,
    battery: 0,
    speed: 0,
    coolant: 0,
    brakes: 0,
    tires: 0,
    engineOil: 0,
    odometerKm: 10000,
    fuelPercent: 80,
    evSoc: null,
    isElectric: false,
    hvBatteryCapacityKwh: null,
    leasingRate: '€ 0,00',
    insuranceCost: '€ 0,00',
    taxCost: '€ 0,00',
    totalMonthlyCost: '€ 0,00',
    imageUrl: null,
    reservedBookingId: 'bk-1',
    reservedCustomerName: 'Max',
    reservedPickupAt: '2026-07-15T10:00:00.000Z',
    reservedPickupStationName: 'Berlin',
    reservedIsOverdue: false,
    activeBookingId: null,
    activeCustomerName: null,
    activeReturnAt: null,
    activeReturnStationName: null,
    activeKmIncluded: null,
    activeKmDriven: null,
    activeIsOverdue: false,
    maintenanceReason: null,
    maintenanceReasonCode: null,
    maintenanceUrgency: null,
    stationId: 'st-1',
    stationName: 'Berlin',
    heading: null,
    lastSeenAt: null,
    ...overrides,
  };
}

describe('vehicle-operational-query optimistic patches', () => {
  it('pickup promotes Reserved to Active Rented', () => {
    const patch = derivePickupOptimisticPatch(makeVehicle(), {
      bookingId: 'bk-1',
      customerName: 'Max',
    });
    expect(patch?.status).toBe(VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED);
    expect(patch?.activeBookingId).toBe('bk-1');
  });

  it('pickup does not patch Unknown vehicles', () => {
    const patch = derivePickupOptimisticPatch(
      makeVehicle({
        status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
        dataQualityState: 'UNAVAILABLE',
        isReliable: false,
      }),
    );
    expect(patch).toBeNull();
  });

  it('return derives Available from Active Rented only', () => {
    const patch = deriveReturnOptimisticPatch(
      makeVehicle({
        status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
        activeBookingId: 'bk-1',
      }),
    );
    expect(patch?.status).toBe(VEHICLE_OPERATIONAL_STATUS.AVAILABLE);
    expect(patch?.activeBookingId).toBeNull();
  });

  it('return never assumes Available from Unknown', () => {
    const patch = deriveReturnOptimisticPatch(
      makeVehicle({
        status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
        dataQualityState: 'UNAVAILABLE',
        isReliable: false,
      }),
    );
    expect(patch).toBeNull();
  });

  it('reserve patches only reliable Available', () => {
    expect(
      deriveReserveOptimisticPatch(
        makeVehicle({ status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE }),
      )?.status,
    ).toBe(VEHICLE_OPERATIONAL_STATUS.RESERVED);
    expect(
      deriveReserveOptimisticPatch(
        makeVehicle({ status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN }),
      ),
    ).toBeNull();
  });

  it('release patches Reserved to Available', () => {
    expect(
      deriveReleaseOptimisticPatch(
        makeVehicle({ status: VEHICLE_OPERATIONAL_STATUS.RESERVED }),
      )?.status,
    ).toBe(VEHICLE_OPERATIONAL_STATUS.AVAILABLE);
  });
});

describe('invalidateVehicleOperationalState', () => {
  beforeEach(() => {
    resetVehicleOperationalInvalidationHandlers();
    useFleetMapStore.setState({
      vehicles: [makeVehicle()],
      loading: false,
      error: null,
      lastFetchedAt: null,
    });
  });

  it('pickup applies optimistic Active Rented then refetches fleet without manual reload', async () => {
    const fleetRefetch = vi.fn().mockResolvedValue(undefined);
    registerVehicleOperationalInvalidationHandler(
      vehicleOperationalQueryKeys.fleetMap('org-1'),
      fleetRefetch,
    );

    await invalidateVehicleOperationalState({
      orgId: 'org-1',
      vehicleIds: ['veh-1'],
      reason: 'handover-pickup',
      optimistic: 'pickup',
      bookingContext: { bookingId: 'bk-1', customerName: 'Max' },
    });

    expect(useFleetMapStore.getState().vehicles[0]?.status).toBe(
      VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
    );
    expect(fleetRefetch).toHaveBeenCalledTimes(1);
  });

  it('return applies optimistic Available when reliable Active Rented', async () => {
    useFleetMapStore.setState({
      vehicles: [
        makeVehicle({
          status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
          activeBookingId: 'bk-1',
        }),
      ],
    });

    await invalidateVehicleOperationalState({
      orgId: 'org-1',
      vehicleIds: ['veh-1'],
      reason: 'handover-return',
      optimistic: 'return',
    });

    expect(useFleetMapStore.getState().vehicles[0]?.status).toBe(
      VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    );
  });

  it('cancel releases Reserved vehicles optimistically', async () => {
    await invalidateVehicleOperationalAfterBookingChange({
      orgId: 'org-1',
      vehicleId: 'veh-1',
      reason: 'booking-cancelled',
    });

    expect(useFleetMapStore.getState().vehicles[0]?.status).toBe(
      VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    );
  });

  it('vehicle swap invalidates both previous and next vehicle detail keys', async () => {
    const touchedKeys: string[] = [];
    registerVehicleOperationalInvalidationHandler(
      vehicleOperationalQueryKeys.org('org-1'),
      (ctx) => {
        touchedKeys.push(...ctx.allVehicleIds);
      },
    );

    await invalidateVehicleOperationalAfterBookingChange({
      orgId: 'org-1',
      vehicleId: 'veh-2',
      previousVehicleId: 'veh-1',
      reason: 'booking-updated',
    });

    expect(touchedKeys).toEqual(expect.arrayContaining(['veh-1', 'veh-2']));
  });

  it('rolls back optimistic patch when refetch handler fails', async () => {
    registerVehicleOperationalInvalidationHandler(
      vehicleOperationalQueryKeys.fleetMap('org-1'),
      () => {
        throw new Error('network');
      },
    );

    await invalidateVehicleOperationalState({
      orgId: 'org-1',
      vehicleIds: ['veh-1'],
      reason: 'handover-pickup',
      optimistic: 'pickup',
    });

    expect(useFleetMapStore.getState().vehicles[0]?.status).toBe(
      VEHICLE_OPERATIONAL_STATUS.RESERVED,
    );
  });

  it('fans out to fleet and dashboard handlers in parallel', async () => {
    const fleet = vi.fn().mockResolvedValue(undefined);
    const dashboard = vi.fn().mockResolvedValue(undefined);

    registerVehicleOperationalInvalidationHandler(
      vehicleOperationalQueryKeys.fleetMap('org-1'),
      fleet,
    );
    registerVehicleOperationalInvalidationHandler(
      vehicleOperationalQueryKeys.dashboardTodayBookings('org-1'),
      dashboard,
    );

    await invalidateVehicleOperationalState({
      orgId: 'org-1',
      vehicleIds: ['veh-1'],
      reason: 'handover-return',
      optimistic: 'return',
    });

    expect(fleet).toHaveBeenCalledTimes(1);
    expect(dashboard).toHaveBeenCalledTimes(1);
  });
});

describe('vehicleOperationalQueryKeys', () => {
  it('builds stable hierarchical keys', () => {
    expect(vehicleOperationalQueryKeys.fleetMap('org-1')).toEqual([
      'vehicle-operational',
      'org-1',
      'fleet-map',
    ]);
    expect(vehicleOperationalQueryKeys.vehicleDetail('org-1', 'veh-1')).toEqual([
      'vehicle-operational',
      'org-1',
      'vehicle',
      'veh-1',
    ]);
  });
});
