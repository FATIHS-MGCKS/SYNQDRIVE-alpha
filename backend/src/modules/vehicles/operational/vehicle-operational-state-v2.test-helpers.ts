import { VehicleStatus } from '@prisma/client';
import { VehiclesService } from '../vehicles.service';

/** Lean VehiclesService for operational-state unit/integration specs. */
export function makeOperationalVehiclesService(deps: {
  prisma?: Record<string, unknown>;
  redis?: { get?: jest.Mock; set?: jest.Mock };
} = {}): VehiclesService {
  const stub = (): unknown => ({});
  const prisma = deps.prisma ?? {};
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    ...deps.redis,
  };
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
    { getFleetSummariesForVehicles: jest.fn().mockResolvedValue(new Map()) },
    stub(),
    stub(),
    undefined,
  );
}

export const EMPTY_BOOKING = VehiclesService.EMPTY_BOOKING_CONTEXT;

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

export const FLEET_STATUS_FIELDS = [
  'status',
  'reservedBookingId',
  'activeBookingId',
  'reservedPickupAt',
  'activeReturnAt',
  'maintenanceReasonCode',
] as const;
