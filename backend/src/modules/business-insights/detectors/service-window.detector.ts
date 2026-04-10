import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { InsightCandidate, InsightDetector, DetectorContext, InsightType, InsightSeverity, InsightEntityScope } from '../insight.types';

@Injectable()
export class ServiceWindowDetector implements InsightDetector {
  readonly type = InsightType.SERVICE_WINDOW;

  constructor(private readonly prisma: PrismaService) {}

  async detect(ctx: DetectorContext): Promise<InsightCandidate[]> {
    const horizon = new Date(ctx.now.getTime() + 72 * 3600_000);
    const minWindowMs = ctx.policy.serviceWindowMinHours * 3600_000;

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ['AVAILABLE', 'RENTED'] },
      },
      select: { id: true, licensePlate: true, make: true, model: true, nextServiceDueDate: true, cleaningStatus: true, healthStatus: true },
    });

    const needsAttention = vehicles.filter(
      (v) => v.cleaningStatus !== 'CLEAN' || v.healthStatus !== 'GOOD' || (v.nextServiceDueDate && v.nextServiceDueDate <= horizon),
    );

    const candidates: InsightCandidate[] = [];

    for (const v of needsAttention) {
      const bookings = await this.prisma.booking.findMany({
        where: {
          vehicleId: v.id,
          organizationId: ctx.organizationId,
          status: { in: ['CONFIRMED', 'ACTIVE'] },
          startDate: { lte: horizon },
          endDate: { gte: ctx.now },
        },
        orderBy: { startDate: 'asc' },
        select: { startDate: true, endDate: true },
      });

      const gaps = this.findGaps(ctx.now, horizon, bookings);
      const usableGap = gaps.find((g) => g.durationMs >= minWindowMs);

      if (usableGap) {
        const hours = Math.round(usableGap.durationMs / 3600_000);
        const label = v.licensePlate || `${v.make} ${v.model}`;
        const reasons: string[] = [];
        if (v.cleaningStatus !== 'CLEAN') reasons.push(`Cleaning: ${v.cleaningStatus}`);
        if (v.healthStatus !== 'GOOD') reasons.push(`Health: ${v.healthStatus}`);
        if (v.nextServiceDueDate && v.nextServiceDueDate <= horizon) reasons.push('Service due soon');

        candidates.push({
          type: this.type,
          severity: InsightSeverity.OPPORTUNITY,
          priority: 55,
          title: 'Service Window Available',
          message: `${label} has a ${hours}h free window — ${reasons[0]?.toLowerCase() || 'good time for service'}.`,
          actionLabel: 'Schedule service',
          actionType: 'navigate_vehicle',
          entityScope: InsightEntityScope.VEHICLE,
          entityIds: [v.id],
          timeContext: { windowStart: usableGap.start.toISOString(), windowEnd: usableGap.end.toISOString() },
          metrics: { windowHours: hours },
          reasons,
          confidence: 0.9,
          dedupeKey: `service_window:${v.id}`,
          groupKey: 'service_windows',
        });
      }
    }
    return candidates;
  }

  private findGaps(from: Date, to: Date, bookings: { startDate: Date; endDate: Date }[]) {
    const gaps: { start: Date; end: Date; durationMs: number }[] = [];
    let cursor = from;
    for (const b of bookings) {
      if (b.startDate > cursor) {
        const gapMs = b.startDate.getTime() - cursor.getTime();
        gaps.push({ start: new Date(cursor), end: b.startDate, durationMs: gapMs });
      }
      if (b.endDate > cursor) cursor = b.endDate;
    }
    if (cursor < to) {
      gaps.push({ start: new Date(cursor), end: to, durationMs: to.getTime() - cursor.getTime() });
    }
    return gaps;
  }
}
