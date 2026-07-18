import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import { ACTIVE_STATION_KPI_BOOKING_STATUSES } from '@shared/stations/station-kpis.contract';
import {
  getStationOperationsTimelineContractMetadata,
  normalizeStationOperationsTimelinePageSize,
  resolveDefaultTimelineWindow,
  resolveStationOperationsTimeline,
  type StationOperationsTimelineHandoverRow,
  type StationOperationsTimelineReadModel,
} from '@shared/stations/station-operations-timeline.resolver';
import { StationOperationsTimelineSortOrder } from '@shared/stations/station-operations-timeline.contract';
import { parseStationInstant } from '@shared/stations/station-timezone.util';
import { ACTIVE_VEHICLE_STATION_TRANSFER_STATUSES } from './vehicle-station-transfer.types';
import type { ListStationOperationsTimelineQueryDto } from './dto/list-station-operations-timeline-query.dto';
import { STATION_OPERATIONS_TIMELINE_QUERY_DEFAULTS } from './dto/list-station-operations-timeline-query.dto';

@Injectable()
export class StationOperationsTimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccessScope: StationAccessScopeService,
  ) {}

  getContractMetadata() {
    return getStationOperationsTimelineContractMetadata();
  }

  async resolveForStation(
    organizationId: string,
    stationId: string,
    query: ListStationOperationsTimelineQueryDto = {},
    scope?: StationScopeContext,
  ): Promise<StationOperationsTimelineReadModel> {
    const access = this.stationAccessScope.resolveFromContextOrEmpty(organizationId, scope);
    const evaluatedAt = query.at ?? new Date().toISOString();
    const station = await this.stationAccessScope.requireReadableStation(access, stationId, {
      select: {
        id: true,
        organizationId: true,
        timezone: true,
      },
    });

    const timezone = station.timezone?.trim() || 'Europe/Berlin';
    const defaultWindow = resolveDefaultTimelineWindow(
      timezone,
      evaluatedAt,
      STATION_OPERATIONS_TIMELINE_QUERY_DEFAULTS.rangeDays,
    );
    const fromUtc = query.from ? parseStationInstant(query.from) : defaultWindow.fromUtc;
    const toUtc = query.to ? parseStationInstant(query.to) : defaultWindow.toUtc;
    const { pageSize } = normalizeStationOperationsTimelinePageSize(query.pageSize);
    const page = query.page != null && query.page > 0 ? query.page : 1;
    const sortOrder = query.sortOrder ?? StationOperationsTimelineSortOrder.ASC;
    const scopeApplied = access.mode !== STATION_SCOPE_MODE.ALL_STATIONS;

    const bookingTimeOr: Prisma.BookingWhereInput[] = [
      {
        pickupStationId: stationId,
        startDate: { gte: fromUtc, lte: toUtc },
      },
      {
        returnStationId: stationId,
        endDate: { gte: fromUtc, lte: toUtc },
      },
      {
        returnStationId: stationId,
        status: 'ACTIVE',
        endDate: { lt: new Date(evaluatedAt), gte: fromUtc },
      },
      {
        pickupStationId: stationId,
        status: { in: ['PENDING', 'CONFIRMED', 'ACTIVE'] },
        startDate: { lt: new Date(evaluatedAt), gte: fromUtc },
      },
    ];

    const [bookings, transfers, tasks, handovers] = await Promise.all([
      this.prisma.booking.findMany({
        where: this.stationAccessScope.buildStationBookingsWhere(access, stationId, {
          status: {
            in: [...ACTIVE_STATION_KPI_BOOKING_STATUSES, 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
          },
          AND: [{ OR: bookingTimeOr }],
        }),
        select: {
          id: true,
          status: true,
          vehicleId: true,
          pickupStationId: true,
          returnStationId: true,
          isOneWayRental: true,
          startDate: true,
          endDate: true,
          stationBookingRulesSnapshot: true,
          vehicle: {
            select: {
              licensePlate: true,
              vehicleName: true,
              make: true,
              model: true,
            },
          },
        },
      }),
      this.prisma.vehicleStationTransfer.findMany({
        where: {
          organizationId,
          status: { in: ACTIVE_VEHICLE_STATION_TRANSFER_STATUSES },
          OR: [{ fromStationId: stationId }, { toStationId: stationId }],
          AND: [
            {
              OR: [
                { plannedAt: { gte: fromUtc, lte: toUtc } },
                { expectedArrivalAt: { gte: fromUtc, lte: toUtc } },
                { startedAt: { gte: fromUtc, lte: toUtc } },
              ],
            },
          ],
        },
        select: {
          id: true,
          vehicleId: true,
          fromStationId: true,
          toStationId: true,
          status: true,
          plannedAt: true,
          expectedArrivalAt: true,
          startedAt: true,
          completedAt: true,
          sourceBookingId: true,
          vehicle: {
            select: {
              licensePlate: true,
              vehicleName: true,
              make: true,
              model: true,
            },
          },
        },
      }),
      this.loadStationTasks(access, stationId, fromUtc, toUtc),
      this.prisma.bookingHandoverProtocol.findMany({
        where: {
          organizationId,
          actualStationId: stationId,
          performedAt: { gte: fromUtc, lte: toUtc },
        },
        select: {
          id: true,
          bookingId: true,
          vehicleId: true,
          kind: true,
          performedAt: true,
          actualStationId: true,
          stationRulesSnapshot: true,
          vehicle: {
            select: {
              licensePlate: true,
              vehicleName: true,
              make: true,
              model: true,
            },
          },
        },
      }),
    ]);

    const completedHandoverKindsByBookingId = await this.loadCompletedHandoverKinds(
      organizationId,
      bookings.map((booking) => booking.id),
    );

    return resolveStationOperationsTimeline({
      organizationId,
      stationId,
      timezone,
      evaluatedAt,
      fromUtc,
      toUtc,
      sortOrder,
      page,
      pageSize,
      scopeApplied,
      bookings,
      transfers,
      tasks,
      handovers: handovers as StationOperationsTimelineHandoverRow[],
      completedHandoverKindsByBookingId,
    });
  }

  private async loadStationTasks(
    access: ReturnType<StationAccessScopeService['resolveFromContextOrEmpty']>,
    stationId: string,
    fromUtc: Date,
    toUtc: Date,
  ) {
    const [vehicles, bookings] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: this.stationAccessScope.buildStationLinkedVehicleWhere(access, stationId),
        select: { id: true },
      }),
      this.prisma.booking.findMany({
        where: this.stationAccessScope.buildStationBookingsWhere(access, stationId),
        select: { id: true },
      }),
    ]);

    const vehicleIds = vehicles.map((vehicle) => vehicle.id);
    const bookingIds = bookings.map((booking) => booking.id);
    const orFilters: Prisma.OrgTaskWhereInput[] = [
      { metadata: { path: ['stationId'], equals: stationId } },
    ];
    if (vehicleIds.length > 0) {
      orFilters.push({ vehicleId: { in: vehicleIds } });
    }
    if (bookingIds.length > 0) {
      orFilters.push({ bookingId: { in: bookingIds } });
    }

    const tasks = await this.prisma.orgTask.findMany({
      where: {
        organizationId: access.orgId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        OR: [
          { dueDate: { gte: fromUtc, lte: toUtc } },
          { activatesAt: { gte: fromUtc, lte: toUtc } },
        ],
        AND: [{ OR: orFilters }],
      },
      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        vehicleId: true,
        bookingId: true,
        dueDate: true,
        activatesAt: true,
        metadata: true,
      },
    });

    const taskVehicleIds = [
      ...new Set(tasks.map((task) => task.vehicleId).filter((id): id is string => id != null)),
    ];
    const vehicleRows =
      taskVehicleIds.length === 0
        ? []
        : await this.prisma.vehicle.findMany({
            where: { organizationId: access.orgId, id: { in: taskVehicleIds } },
            select: {
              id: true,
              licensePlate: true,
              vehicleName: true,
              make: true,
              model: true,
            },
          });
    const vehicleById = new Map(vehicleRows.map((vehicle) => [vehicle.id, vehicle]));

    return tasks.map((task) => ({
      ...task,
      vehicle: task.vehicleId ? vehicleById.get(task.vehicleId) ?? null : null,
    }));
  }

  private async loadCompletedHandoverKinds(
    organizationId: string,
    bookingIds: string[],
  ): Promise<Map<string, Set<'PICKUP' | 'RETURN'>>> {
    if (bookingIds.length === 0) {
      return new Map();
    }

    const handovers = await this.prisma.bookingHandoverProtocol.findMany({
      where: {
        organizationId,
        bookingId: { in: bookingIds },
      },
      select: {
        bookingId: true,
        kind: true,
      },
    });

    const map = new Map<string, Set<'PICKUP' | 'RETURN'>>();
    for (const handover of handovers) {
      const kinds = map.get(handover.bookingId) ?? new Set<'PICKUP' | 'RETURN'>();
      kinds.add(handover.kind);
      map.set(handover.bookingId, kinds);
    }
    return map;
  }
}
