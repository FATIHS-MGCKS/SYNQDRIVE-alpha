import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import type { ResolvedEvaluationsAnalyticsFilters } from '@synq/evaluations-insights/evaluations-analytics-filters.contract';
import {
  resolveStationBookingScope,
  resolveVehicleScopeConstraint,
} from '@synq/evaluations-insights/evaluations-analytics-filters';
import type { EvaluationsUtilizationSnapshot } from '@synq/evaluations-insights/evaluations-utilization-model.contract';
import {
  computeVehicleUtilization,
  mapBookingStatus,
} from '@synq/evaluations-insights/evaluations-utilization-model';
import {
  detectOverlappingBlockingBookings,
  utilizationPercent,
  type UtilizationBookingInterval,
} from '@synq/evaluations-insights/evaluations-utilization-intervals';

const TELEMETRY_STALE_MS = 24 * 60 * 60 * 1000;
const STATION_SHORTAGE_THRESHOLD = 1;

@Injectable()
export class EvaluationsUtilizationSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehiclesService: VehiclesService,
  ) {}

  async loadSnapshot(
    resolved: ResolvedEvaluationsAnalyticsFilters,
  ): Promise<EvaluationsUtilizationSnapshot> {
    const periodFromMs = new Date(resolved.period.from).getTime();
    const periodToMs = new Date(resolved.period.to).getTime();
    const range = { fromMs: periodFromMs, toMs: periodToMs };
    const now = new Date(resolved.period.to);

    const vehicleAndFilters: Array<Record<string, unknown>> = [
      { organizationId: resolved.organizationId },
    ];
    const stationScope = resolveStationBookingScope(resolved);
    if (stationScope.mode === 'scoped') {
      vehicleAndFilters.push({
        OR: [
          { homeStationId: { in: stationScope.stationIds } },
          { currentStationId: { in: stationScope.stationIds } },
        ],
      });
    } else if (stationScope.mode === 'empty') {
      vehicleAndFilters.push({ id: { in: [] as string[] } });
    }
    if (resolved.vehicleClassId) {
      vehicleAndFilters.push({ rentalCategoryId: resolved.vehicleClassId });
    }
    if (resolved.vehicleStatus) {
      vehicleAndFilters.push({ status: resolved.vehicleStatus });
    }
    const vehicleScope = resolveVehicleScopeConstraint(resolved);
    if (vehicleScope.mode === 'scoped') {
      vehicleAndFilters.push({ id: { in: vehicleScope.vehicleIds } });
    } else if (vehicleScope.mode === 'empty') {
      vehicleAndFilters.push({ id: { in: [] as string[] } });
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: { AND: vehicleAndFilters },
      select: {
        id: true,
        licensePlate: true,
        make: true,
        model: true,
        status: true,
        cleaningStatus: true,
        homeStationId: true,
        rentalCategoryId: true,
        homeStation: { select: { id: true, name: true } },
        rentalCategory: { select: { id: true, name: true } },
        latestState: { select: { online: true, lastSeenAt: true } },
      },
    });

    const vehicleIds = vehicles.map((v) => v.id);

    const [operationalCounts, operationalTokens] = await Promise.all([
      this.vehiclesService.aggregateDerivedFleetStatusCountsForVehicles(
        resolved.organizationId,
        vehicleIds,
      ),
      this.vehiclesService.deriveOperationalTokensForVehicles(
        resolved.organizationId,
        vehicleIds,
      ),
    ]);

    const operationalDenominator =
      operationalCounts.rented + operationalCounts.available + operationalCounts.reserved;

    const operationalSnapshot = {
      activeRented: operationalCounts.rented,
      reserved: operationalCounts.reserved,
      available: operationalCounts.available,
      maintenance: operationalCounts.maintenance,
      blocked: vehicles.filter((v) => v.status === 'OUT_OF_SERVICE').length,
      unknown: operationalCounts.unknown,
      operationalUtilizationPercent: utilizationPercent(
        operationalCounts.rented,
        operationalDenominator,
      ),
    };

    if (vehicleIds.length === 0) {
      return {
        periodFromMs,
        periodToMs,
        vehicles: [],
        overlappingBookingIds: [],
        stationBottlenecks: [],
        operationalSnapshot,
        maintenanceFromDowntimeWindows: 0,
        maintenanceFromSnapshotOnly: 0,
        blockedFromDowntimeWindows: 0,
        blockedFromSnapshotOnly: 0,
      };
    }

    const periodFrom = new Date(resolved.period.from);
    const periodTo = new Date(resolved.period.to);

    const [bookings, serviceCases] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          organizationId: resolved.organizationId,
          vehicleId: { in: vehicleIds },
          startDate: { lte: periodTo },
          endDate: { gte: periodFrom },
        },
        select: {
          id: true,
          vehicleId: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      }),
      this.prisma.serviceCase.findMany({
        where: {
          organizationId: resolved.organizationId,
          vehicleId: { in: vehicleIds },
          blocksRental: true,
          downtimeStart: { not: null, lte: periodTo },
          OR: [{ downtimeEnd: { gte: periodFrom } }, { downtimeEnd: null }],
        },
        select: {
          vehicleId: true,
          category: true,
          downtimeStart: true,
          downtimeEnd: true,
        },
      }),
    ]);

    const bookingIntervals: UtilizationBookingInterval[] = [];
    for (const b of bookings) {
      const mapped = mapBookingStatus(b.status);
      if (!mapped || mapped === 'cancelled' || mapped === 'no_show') continue;
      bookingIntervals.push({
        bookingId: b.id,
        vehicleId: b.vehicleId,
        status: mapped,
        startMs: b.startDate.getTime(),
        endMs: b.endDate.getTime(),
      });
    }

    const overlappingBookingIds = detectOverlappingBlockingBookings(bookingIntervals, range);

    const downtimeByVehicle = new Map<
      string,
      {
        maintenance: Array<{ startMs: number; endMs: number }>;
        blocked: Array<{ startMs: number; endMs: number }>;
        unplanned: Array<{ startMs: number; endMs: number }>;
      }
    >();

    for (const sc of serviceCases) {
      if (!sc.downtimeStart) continue;
      const startMs = sc.downtimeStart.getTime();
      const endMs = sc.downtimeEnd?.getTime() ?? periodToMs;
      const bucket = downtimeByVehicle.get(sc.vehicleId) ?? {
        maintenance: [],
        blocked: [],
        unplanned: [],
      };
      const interval = { startMs, endMs };
      if (sc.category === 'REPAIR' || sc.category === 'DIAGNOSTIC') {
        bucket.unplanned.push(interval);
      }
      bucket.maintenance.push(interval);
      downtimeByVehicle.set(sc.vehicleId, bucket);
    }

    let maintenanceFromDowntimeWindows = 0;
    let maintenanceFromSnapshotOnly = 0;
    let blockedFromDowntimeWindows = 0;
    let blockedFromSnapshotOnly = 0;

    const vehicleRows = vehicles.map((v) => {
      const capacityMs = periodToMs - periodFromMs;
      const vehicleBookings = bookingIntervals.filter((b) => b.vehicleId === v.id);
      const downtime = downtimeByVehicle.get(v.id) ?? {
        maintenance: [],
        blocked: [],
        unplanned: [],
      };

      let maintenanceIntervals = [...downtime.maintenance];
      let blockedIntervals = [...downtime.blocked];

      if (maintenanceIntervals.length === 0 && v.status === 'IN_SERVICE') {
        maintenanceIntervals = [{ startMs: periodFromMs, endMs: periodToMs }];
        maintenanceFromSnapshotOnly += 1;
      }
      if (blockedIntervals.length === 0 && v.status === 'OUT_OF_SERVICE') {
        blockedIntervals = [{ startMs: periodFromMs, endMs: periodToMs }];
        blockedFromSnapshotOnly += 1;
      }
      if (downtime.maintenance.length > 0) maintenanceFromDowntimeWindows += 1;
      if (downtime.blocked.length > 0) blockedFromDowntimeWindows += 1;

      const util = computeVehicleUtilization({
        vehicleId: v.id,
        label: v.licensePlate ?? `${v.make} ${v.model}`,
        capacityMs,
        bookings: vehicleBookings,
        range,
        maintenanceIntervals,
        blockedIntervals,
        unplannedIntervals: downtime.unplanned,
      });

      const lastSeen = v.latestState?.lastSeenAt?.getTime() ?? 0;
      const telemetryOffline =
        v.latestState != null &&
        (!v.latestState.online ||
          (lastSeen > 0 && now.getTime() - lastSeen > TELEMETRY_STALE_MS));

      const operationalToken = operationalTokens.get(v.id) ?? 'UNKNOWN';

      return {
        vehicleId: v.id,
        label: v.licensePlate ?? `${v.make} ${v.model}`,
        homeStationId: v.homeStationId,
        homeStationName: v.homeStation?.name ?? null,
        vehicleClassId: v.rentalCategoryId,
        vehicleClassName: v.rentalCategory?.name ?? null,
        prismaStatus: v.status,
        cleaningStatus: v.cleaningStatus,
        rentalBlocked: false,
        telemetryOffline,
        operationalToken,
        capacityMs,
        ...util,
      };
    });

    const stationBottlenecks = await this.computeStationBottlenecks(
      resolved.organizationId,
      vehicles,
      bookings,
      stationScope,
    );

    return {
      periodFromMs,
      periodToMs,
      vehicles: vehicleRows,
      overlappingBookingIds,
      stationBottlenecks,
      operationalSnapshot,
      maintenanceFromDowntimeWindows,
      maintenanceFromSnapshotOnly,
      blockedFromDowntimeWindows,
      blockedFromSnapshotOnly,
    };
  }

  private async computeStationBottlenecks(
    organizationId: string,
    vehicles: Array<{ id: string; homeStationId: string | null }>,
    bookings: Array<{ vehicleId: string; status: string }>,
    stationScope: ReturnType<typeof resolveStationBookingScope>,
  ): Promise<EvaluationsUtilizationSnapshot['stationBottlenecks']> {
    const stations = await this.prisma.station.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        ...(stationScope.mode === 'scoped' ? { id: { in: stationScope.stationIds } } : {}),
      },
      select: { id: true, name: true },
    });

    const vehiclesByStation = new Map<string, number>();
    for (const v of vehicles) {
      if (!v.homeStationId) continue;
      vehiclesByStation.set(v.homeStationId, (vehiclesByStation.get(v.homeStationId) ?? 0) + 1);
    }

    const bookedVehicleIds = new Set(
      bookings
        .filter((b) => ['CONFIRMED', 'ACTIVE'].includes(b.status))
        .map((b) => b.vehicleId),
    );

    const bookedByStation = new Map<string, number>();
    for (const v of vehicles) {
      if (!v.homeStationId || !bookedVehicleIds.has(v.id)) continue;
      bookedByStation.set(v.homeStationId, (bookedByStation.get(v.homeStationId) ?? 0) + 1);
    }

    const bottlenecks: EvaluationsUtilizationSnapshot['stationBottlenecks'] = [];
    for (const station of stations) {
      const totalVehicles = vehiclesByStation.get(station.id) ?? 0;
      const bookedVehicles = bookedByStation.get(station.id) ?? 0;
      const availableVehicles = totalVehicles - bookedVehicles;
      if (totalVehicles > 0 && availableVehicles <= STATION_SHORTAGE_THRESHOLD) {
        bottlenecks.push({
          stationId: station.id,
          stationName: station.name,
          totalVehicles,
          bookedVehicles,
          availableVehicles,
        });
      }
    }

    return bottlenecks;
  }
}
