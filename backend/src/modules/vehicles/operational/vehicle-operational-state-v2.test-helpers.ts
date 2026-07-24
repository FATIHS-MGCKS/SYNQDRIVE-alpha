import { VehicleStatus } from '@prisma/client';
import { VehiclesService } from '../vehicles.service';
import { FleetMapCacheService } from '../fleet-map-cache.service';

export function makeGpsPositionAccessStub() {
  return {
    assertVehicleGpsAccess: jest.fn().mockResolvedValue(undefined),
    assertOrgFleetGpsAccess: jest.fn().mockResolvedValue(undefined),
    assertSystemGpsIngest: jest.fn().mockResolvedValue(undefined),
  };
}

/** Lean VehiclesService for operational-state unit/integration specs. */
export function makeOperationalVehiclesService(deps: {
  prisma?: Record<string, unknown>;
  redis?: { get?: jest.Mock; set?: jest.Mock; del?: jest.Mock };
  gpsPositionAccess?: ReturnType<typeof makeGpsPositionAccessStub>;
} = {}): VehiclesService {
  const stub = (): unknown => ({});
  const prisma = deps.prisma ?? {};
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    ...deps.redis,
  };
  const fleetMapCache = new FleetMapCacheService(redis as never);
  const connectivityRuntimeProjection = {
    projectForVehicles: jest.fn().mockResolvedValue(new Map()),
  };
  const gpsPositionAccess = deps.gpsPositionAccess ?? makeGpsPositionAccessStub();
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const vehicleDetailAudit = { record: jest.fn() };
  return new (VehiclesService as unknown as {
    new (...args: unknown[]): VehiclesService;
  })(
    prisma,
    redis,
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    gpsPositionAccess,
    stub(),
    connectivityRuntimeProjection,
    stub(),
    stub(),
    fleetMapCache,
    audit,
    vehicleDetailAudit,
    undefined,
    undefined,
    undefined,
  );
}

export const EMPTY_BOOKING = VehiclesService.EMPTY_BOOKING_CONTEXT;

export function makeOperationalPrismaMocks(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    organization: {
      findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Berlin' }),
    },
    station: { findMany: jest.fn().mockResolvedValue([]) },
    bookingHandoverProtocol: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleTripDetectionState: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

export function makeVehicleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'veh-1',
    licensePlate: 'KS FH 660E',
    vehicleName: 'Tesla Model 3',
    make: 'Tesla',
    model: 'Model 3',
    year: 2024,
    status: VehicleStatus.AVAILABLE,
    fuelType: 'ELECTRIC',
    healthStatus: 'GOOD',
    cleaningStatus: 'CLEAN',
    imageUrl: null,
    tankCapacityLiters: null,
    homeStationId: 'st-1',
    currentStationId: null,
    expectedStationId: null,
    homeStation: { id: 'st-1', name: 'Kassel' },
    mileageKm: 12000,
    leasingRateCents: 0,
    insuranceCostCents: 0,
    taxCostCents: 0,
    hvBatteryCapacityKwh: 75,
    latestState: null,
    ...overrides,
  };
}

export function makeBookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bk-1',
    vehicleId: 'veh-1',
    status: 'CONFIRMED',
    startDate: new Date('2026-07-10T08:00:00.000Z'),
    endDate: new Date('2026-07-12T08:00:00.000Z'),
    kmIncluded: 500,
    kmDriven: null,
    pickupStationId: 'st-1',
    returnStationId: 'st-1',
    customer: { firstName: 'Max', lastName: 'Mustermann', company: null },
    ...overrides,
  };
}

/** V2 supplement contract — used in tests until backend emits bookingContext DTOs. */
export function buildFutureBookingSupplement(
  bookings: Array<{
    id: string;
    status: string;
    startDate: Date;
    endDate: Date;
    cancelledAt?: Date | null;
  }>,
  now: Date,
): { nextBookingId: string | null; futureBookingCount: number } {
  const future = bookings
    .filter(
      (b) =>
        !b.cancelledAt &&
        (b.status === 'PENDING' || b.status === 'CONFIRMED') &&
        b.startDate.getTime() > now.getTime() &&
        b.endDate.getTime() >= now.getTime(),
    )
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  return {
    nextBookingId: future[0]?.id ?? null,
    futureBookingCount: future.length,
  };
}
