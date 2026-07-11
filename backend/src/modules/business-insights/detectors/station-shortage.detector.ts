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

    const horizon = new Date(ctx.now.getTime() + 24 * 3600_000);
    const candidates: InsightCandidate[] = [];

    for (const station of stations) {
      const totalVehicles = await this.prisma.vehicle.count({
        where: { organizationId: ctx.organizationId, homeStationId: station.id, status: { not: 'OUT_OF_SERVICE' } },
      });

      const bookedOut = await this.prisma.booking.count({
        where: {
          organizationId: ctx.organizationId,
          vehicle: { homeStationId: station.id },
          status: { in: ['CONFIRMED', 'ACTIVE'] },
          startDate: { lte: horizon },
          endDate: { gte: ctx.now },
        },
      });

      const available = totalVehicles - bookedOut;
      const threshold = ctx.policy.stationShortageThreshold;

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
