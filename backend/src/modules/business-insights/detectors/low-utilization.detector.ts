import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { buildDailyRateMetrics, buildLostRevenueMetrics } from '@synq/money/money-insight-metrics';
import { majorUnitsNumberToMinor } from '@synq/money/money.util';
import { InsightCandidate, InsightDetector, DetectorContext, InsightType, InsightSeverity, InsightEntityScope } from '../insight.types';

@Injectable()
export class LowUtilizationDetector implements InsightDetector {
  readonly type = InsightType.LOW_UTILIZATION;

  constructor(private readonly prisma: PrismaService) {}

  async detect(ctx: DetectorContext): Promise<InsightCandidate[]> {
    const lookbackDays = ctx.policy.lowUtilizationDays;
    const lookbackStart = new Date(ctx.now.getTime() - lookbackDays * 86400_000);
    const lookAhead = new Date(ctx.now.getTime() + 7 * 86400_000);

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ['AVAILABLE', 'RENTED'] },
      },
      select: {
        id: true, make: true, model: true, licensePlate: true,
        dailyRateEur: true, homeStationId: true,
      },
    });

    if (vehicles.length === 0) return [];

    const vehicleIds = vehicles.map((v) => v.id);

    const recentBookings = await this.prisma.booking.groupBy({
      by: ['vehicleId'],
      where: {
        vehicleId: { in: vehicleIds },
        organizationId: ctx.organizationId,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        endDate: { gte: lookbackStart },
        startDate: { lte: ctx.now },
      },
      _count: { id: true },
    });

    const upcomingBookings = await this.prisma.booking.groupBy({
      by: ['vehicleId'],
      where: {
        vehicleId: { in: vehicleIds },
        organizationId: ctx.organizationId,
        status: { in: ['CONFIRMED', 'PENDING'] },
        startDate: { gte: ctx.now, lte: lookAhead },
      },
      _count: { id: true },
    });

    const recentMap = new Map(recentBookings.map((r) => [r.vehicleId, r._count.id]));
    const upcomingMap = new Map(upcomingBookings.map((u) => [u.vehicleId, u._count.id]));

    const candidates: InsightCandidate[] = [];

    for (const v of vehicles) {
      const recent = recentMap.get(v.id) ?? 0;
      const upcoming = upcomingMap.get(v.id) ?? 0;

      if (recent > 0 || upcoming > 0) continue;

      const dailyRateEur = v.dailyRateEur ?? 0;
      const dailyRateAmountMinor = majorUnitsNumberToMinor(dailyRateEur, 'EUR');
      const lostRevenueAmountMinor = dailyRateAmountMinor * lookbackDays;
      const label = v.licensePlate || `${v.make} ${v.model}`;

      candidates.push({
        type: this.type,
        severity: InsightSeverity.OPPORTUNITY,
        priority: 40 + Math.min(Math.round(lostRevenueAmountMinor / 1000), 20),
        title: 'Low Utilization',
        message: `${label} idle for ${lookbackDays}+ days, no upcoming bookings.`,
        actionLabel: 'Review vehicle',
        actionType: 'navigate_vehicle',
        entityScope: InsightEntityScope.VEHICLE,
        entityIds: [v.id],
        metrics: {
          idleDays: lookbackDays,
          entityLabel: label,
          ...buildLostRevenueMetrics(lostRevenueAmountMinor, 'EUR'),
          ...buildDailyRateMetrics(dailyRateAmountMinor, 'EUR'),
        },
        reasons: [`No bookings in past ${lookbackDays} days`, 'No upcoming bookings in next 7 days'],
        confidence: 1.0,
        dedupeKey: `low_utilization:${v.id}`,
        groupKey: v.homeStationId ? `low_util:${v.homeStationId}` : 'low_utilization_fleet',
      });
    }
    return candidates;
  }
}
