import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { InsightCandidate, InsightDetector, DetectorContext, InsightType, InsightSeverity, InsightEntityScope } from '../insight.types';

@Injectable()
export class StationShortageDetector implements InsightDetector {
  readonly type = InsightType.STATION_SHORTAGE;

  constructor(private readonly prisma: PrismaService) {}

  async detect(ctx: DetectorContext): Promise<InsightCandidate[]> {
    const stations = await this.prisma.station.findMany({
      where: { organizationId: ctx.organizationId, status: 'ACTIVE' },
      select: { id: true, name: true },
    });

    if (stations.length === 0) return [];

    const stationIds = stations.map((s) => s.id);
    const horizon = new Date(ctx.now.getTime() + 24 * 3600_000);

    const [vehicleCounts, bookedCounts] = await Promise.all([
      this.prisma.vehicle.groupBy({
        by: ['homeStationId'],
        where: {
          organizationId: ctx.organizationId,
          homeStationId: { in: stationIds },
          status: { not: 'OUT_OF_SERVICE' },
        },
        _count: { _all: true },
      }),
      this.prisma.booking.groupBy({
        by: ['vehicleId'],
        where: {
          organizationId: ctx.organizationId,
          status: { in: ['CONFIRMED', 'ACTIVE'] },
          startDate: { lte: horizon },
          endDate: { gte: ctx.now },
          vehicle: { homeStationId: { in: stationIds } },
        },
        _count: { _all: true },
      }),
    ]);

    const vehiclesByStation = new Map(
      vehicleCounts.map((row) => [row.homeStationId, row._count._all]),
    );

    const bookedVehicleIds = new Set(bookedCounts.map((row) => row.vehicleId));
    const bookedByStation = new Map<string, number>();
    if (bookedVehicleIds.size > 0) {
      const bookedVehicles = await this.prisma.vehicle.findMany({
        where: { id: { in: [...bookedVehicleIds] }, homeStationId: { in: stationIds } },
        select: { id: true, homeStationId: true },
      });
      for (const vehicle of bookedVehicles) {
        if (!vehicle.homeStationId) continue;
        bookedByStation.set(
          vehicle.homeStationId,
          (bookedByStation.get(vehicle.homeStationId) ?? 0) + 1,
        );
      }
    }

    const candidates: InsightCandidate[] = [];
    const threshold = ctx.policy.stationShortageThreshold;

    for (const station of stations) {
      const totalVehicles = vehiclesByStation.get(station.id) ?? 0;
      const bookedOut = bookedByStation.get(station.id) ?? 0;
      const available = totalVehicles - bookedOut;

      if (available <= threshold && totalVehicles > 0) {
        const severity = available <= 0 ? InsightSeverity.CRITICAL : InsightSeverity.WARNING;
        candidates.push({
          type: this.type,
          severity,
          priority: severity === InsightSeverity.CRITICAL ? 90 : 75,
          title: 'Station Shortage',
          message: available <= 0
            ? `${station.name} has no available vehicles in the next 24h.`
            : `${station.name} has only ${available} vehicle${available !== 1 ? 's' : ''} available.`,
          actionLabel: 'View station',
          actionType: 'navigate_station',
          entityScope: InsightEntityScope.STATION,
          entityIds: [station.id],
          timeContext: { horizonUntil: horizon.toISOString() },
          metrics: { totalVehicles, bookedOut, available, stationName: station.name },
          reasons: [`${available} of ${totalVehicles} vehicles available at ${station.name} within 24h`],
          confidence: 1.0,
          dedupeKey: `station_shortage:${station.id}`,
          expiresAt: horizon,
        });
      }
    }
    return candidates;
  }
}
