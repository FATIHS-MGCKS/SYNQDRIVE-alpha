import type { VehicleStationTransferStatus } from '@prisma/client';
import type { StationCapacityBookingProjection } from './station-capacity-policy';
import type { StationCapacityVehicleSnapshot } from './station-capacity-policy';

/** Concurrent operations within ±window around the evaluated instant count toward projection. */
export const STATION_CAPACITY_EVALUATION_WINDOW_MS = 30 * 60 * 1000;

export const STATION_CAPACITY_ACTIVE_BOOKING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'ACTIVE',
] as const;

export const STATION_CAPACITY_ACTIVE_TRANSFER_STATUSES: VehicleStationTransferStatus[] = [
  'PLANNED',
  'READY',
  'IN_TRANSIT',
  'OVERDUE',
];

export interface StationCapacityProjectionDb {
  booking: {
    count: (args: {
      where: Record<string, unknown>;
    }) => Promise<number>;
  };
  vehicleStationTransfer: {
    count: (args: {
      where: Record<string, unknown>;
    }) => Promise<number>;
  };
  vehicle: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: Record<string, true>;
    }) => Promise<StationCapacityVehicleSnapshot[]>;
  };
}

export function buildStationCapacityEvaluationWindow(at: Date): { from: Date; to: Date } {
  return {
    from: new Date(at.getTime() - STATION_CAPACITY_EVALUATION_WINDOW_MS),
    to: new Date(at.getTime() + STATION_CAPACITY_EVALUATION_WINDOW_MS),
  };
}

export function buildConcurrentCapacityProjection(input: {
  pickupDepartures: number;
  returnArrivals: number;
  transferArrivals: number;
  transferDepartures: number;
}): StationCapacityBookingProjection {
  return {
    concurrentPickupDepartures: input.pickupDepartures,
    concurrentReturnArrivals: input.returnArrivals,
    concurrentTransferArrivals: input.transferArrivals,
    concurrentTransferDepartures: input.transferDepartures,
  };
}

export async function loadStationCapacityVehicles(
  db: StationCapacityProjectionDb,
  organizationId: string,
  stationId: string,
): Promise<StationCapacityVehicleSnapshot[]> {
  return db.vehicle.findMany({
    where: {
      organizationId,
      OR: [
        { homeStationId: stationId },
        { currentStationId: stationId },
        { expectedStationId: stationId },
      ],
    },
    select: {
      id: true,
      homeStationId: true,
      currentStationId: true,
      expectedStationId: true,
      status: true,
    },
  });
}

export async function loadConcurrentCapacityProjection(
  db: StationCapacityProjectionDb,
  organizationId: string,
  stationId: string,
  at: Date,
  options: {
    excludeVehicleId?: string;
    excludeTransferId?: string;
  } = {},
): Promise<StationCapacityBookingProjection> {
  const { from, to } = buildStationCapacityEvaluationWindow(at);
  const vehicleFilter = options.excludeVehicleId
    ? { vehicleId: { not: options.excludeVehicleId } }
    : {};
  const transferFilter = options.excludeTransferId
    ? { id: { not: options.excludeTransferId } }
    : {};

  const [pickupDepartures, returnArrivals, transferArrivals, transferDepartures] =
    await Promise.all([
      db.booking.count({
        where: {
          organizationId,
          pickupStationId: stationId,
          status: { in: [...STATION_CAPACITY_ACTIVE_BOOKING_STATUSES] },
          startDate: { gte: from, lte: to },
          ...vehicleFilter,
        },
      }),
      db.booking.count({
        where: {
          organizationId,
          returnStationId: stationId,
          status: { in: [...STATION_CAPACITY_ACTIVE_BOOKING_STATUSES] },
          endDate: { gte: from, lte: to },
          ...vehicleFilter,
        },
      }),
      db.vehicleStationTransfer.count({
        where: {
          organizationId,
          toStationId: stationId,
          status: { in: STATION_CAPACITY_ACTIVE_TRANSFER_STATUSES },
          OR: [
            { plannedAt: { gte: from, lte: to } },
            { expectedArrivalAt: { gte: from, lte: to } },
          ],
          ...vehicleFilter,
          ...transferFilter,
        },
      }),
      db.vehicleStationTransfer.count({
        where: {
          organizationId,
          fromStationId: stationId,
          status: { in: STATION_CAPACITY_ACTIVE_TRANSFER_STATUSES },
          plannedAt: { gte: from, lte: to },
          ...vehicleFilter,
          ...transferFilter,
        },
      }),
    ]);

  return buildConcurrentCapacityProjection({
    pickupDepartures,
    returnArrivals,
    transferArrivals,
    transferDepartures,
  });
}
