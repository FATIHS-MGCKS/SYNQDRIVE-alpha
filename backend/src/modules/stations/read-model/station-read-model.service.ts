import { Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma, VehicleStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { stationsV2PartialReadTotal, stationsV2SummaryLatencySeconds } from '@modules/observability/stations-v2-prometheus.metrics';
import { StationAccessContext } from '@shared/stations/station-access.types';
import { StationAccessService } from '@shared/stations/station-access.service';
import { openingHoursIsMissing, StationOverviewStatsDto } from '../station.types';
import { stationDayBounds } from '../booking-rules/station-opening-calendar.util';

@Injectable()
export class StationReadModelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccess: StationAccessService,
  ) {}

  /** Batch summaries — fixes HTTP N+1 (N1-01, KPI-05). */
  async getSummariesForStations(
    organizationId: string,
    access: StationAccessContext,
    stationIds?: string[],
  ): Promise<Record<string, StationOverviewStatsDto>> {
    const endTimer = stationsV2SummaryLatencySeconds.startTimer({ batch: 'true' });
    try {
      const where = this.stationAccess.buildStationWhere(organizationId, access);
      if (stationIds?.length) {
        where.id = { in: stationIds };
      }

      const stations = await this.prisma.station.findMany({
        where,
        select: {
          id: true,
          capacity: true,
          latitude: true,
          longitude: true,
          openingHours: true,
          pickupEnabled: true,
          returnEnabled: true,
          timezone: true,
        },
      });

      const entries = await Promise.all(
        stations.map(async (station) => {
          const stats = await this.buildOverviewStats(organizationId, station);
          return [station.id, stats] as const;
        }),
      );
      return Object.fromEntries(entries);
    } finally {
      endTimer();
    }
  }

  async getOverviewStats(
    organizationId: string,
    stationId: string,
    access: StationAccessContext,
  ): Promise<StationOverviewStatsDto> {
    this.stationAccess.assertStationReadable(access, stationId);
    const endTimer = stationsV2SummaryLatencySeconds.startTimer({ batch: 'false' });
    try {
      const station = await this.prisma.station.findFirst({
        where: { id: stationId, organizationId },
        select: {
          id: true,
          capacity: true,
          latitude: true,
          longitude: true,
          openingHours: true,
          pickupEnabled: true,
          returnEnabled: true,
          timezone: true,
        },
      });
      if (!station) throw new NotFoundException(`Station ${stationId} not found`);
      return this.buildOverviewStats(organizationId, station);
    } finally {
      endTimer();
    }
  }

  private async buildOverviewStats(
    organizationId: string,
    station: {
      id: string;
      capacity: number | null;
      latitude: number | null;
      longitude: number | null;
      openingHours: Prisma.JsonValue;
      pickupEnabled: boolean;
      returnEnabled: boolean;
      timezone: string | null;
    },
  ): Promise<StationOverviewStatsDto> {
    const stationId = station.id;
    const homeWhere: Prisma.VehicleWhereInput = {
      organizationId,
      homeStationId: stationId,
    };
    const presentWhere: Prisma.VehicleWhereInput = {
      organizationId,
      currentStationId: stationId,
    };

    const { start: startOfToday, end: endOfToday } = stationDayBounds(station);
    const activeBookingStatuses: BookingStatus[] = ['CONFIRMED', 'ACTIVE', 'PENDING'];

    const [
      vehicleCountHome,
      vehicleCountPresent,
      availableVehicles,
      bookedVehicles,
      inServiceVehicles,
      todayPickups,
      todayReturns,
      upcomingPickups,
      upcomingReturns,
    ] = await Promise.all([
      this.prisma.vehicle.count({ where: homeWhere }),
      this.prisma.vehicle.count({ where: presentWhere }),
      this.prisma.vehicle.count({
        where: { ...homeWhere, status: VehicleStatus.AVAILABLE },
      }),
      this.prisma.booking.count({
        where: {
          organizationId,
          status: { in: activeBookingStatuses },
          OR: [{ pickupStationId: stationId }, { returnStationId: stationId }],
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
        },
      }),
      this.prisma.vehicle.count({
        where: {
          ...homeWhere,
          status: { in: [VehicleStatus.IN_SERVICE, VehicleStatus.OUT_OF_SERVICE] },
        },
      }),
      this.prisma.booking.count({
        where: {
          organizationId,
          pickupStationId: stationId,
          startDate: { gte: startOfToday, lt: endOfToday },
          status: { in: activeBookingStatuses },
        },
      }),
      this.prisma.booking.count({
        where: {
          organizationId,
          returnStationId: stationId,
          endDate: { gte: startOfToday, lt: endOfToday },
          status: { in: activeBookingStatuses },
        },
      }),
      this.prisma.booking.count({
        where: {
          organizationId,
          pickupStationId: stationId,
          startDate: { gte: endOfToday },
          status: { in: activeBookingStatuses },
        },
      }),
      this.prisma.booking.count({
        where: {
          organizationId,
          returnStationId: stationId,
          endDate: { gte: endOfToday },
          status: { in: activeBookingStatuses },
        },
      }),
    ]);

    const homeVehicleIds = (
      await this.prisma.vehicle.findMany({
        where: homeWhere,
        select: { id: true },
      })
    ).map((v) => v.id);

    const openTasks = homeVehicleIds.length
      ? await this.prisma.orgTask.count({
          where: {
            organizationId,
            status: { in: ['OPEN', 'IN_PROGRESS'] },
            vehicleId: { in: homeVehicleIds },
          },
        })
      : 0;

    const partialFields: string[] = [];
    const vehiclesWithHealthWarnings: number | null = null;
    partialFields.push('vehiclesWithHealthWarnings');

    if (partialFields.length > 0) {
      stationsV2PartialReadTotal.inc({ endpoint: 'overview-stats' });
    }

    const capacity = station.capacity;
    const capacityUsagePercent =
      capacity && capacity > 0
        ? Math.min(100, Math.round((vehicleCountHome / capacity) * 100))
        : null;

    return {
      totalVehicles: vehicleCountHome,
      vehicleCountHome,
      vehicleCountPresent,
      availableVehicles,
      bookedVehicles,
      inServiceVehicles,
      vehiclesWithHealthWarnings,
      todayPickups,
      todayReturns,
      upcomingPickups,
      upcomingReturns,
      openTasks,
      capacity,
      capacityUsagePercent,
      hasMissingCoordinates: station.latitude == null || station.longitude == null,
      hasMissingOpeningHours: openingHoursIsMissing(station.openingHours),
      hasMissingPickupReturnRules: !station.pickupEnabled && !station.returnEnabled,
      partialFields,
    };
  }
}
