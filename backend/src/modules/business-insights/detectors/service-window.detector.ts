import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { ServiceComplianceService } from '../../vehicle-intelligence/service-compliance/service-compliance.service';
import {
  NEXT_SERVICE_WARNING_DAYS,
  NEXT_SERVICE_WARNING_KM,
} from '../../vehicle-intelligence/service-compliance/service-compliance.config';
import {
  InsightCandidate,
  InsightDetector,
  DetectorContext,
  InsightType,
  InsightSeverity,
  InsightEntityScope,
} from '../insight.types';

/**
 * Surfaces booking-gap opportunities when HM/OEM service is due soon/overdue.
 * Does not use legacy nextServiceDueDate or manufacturer intervals.
 */
@Injectable()
export class ServiceWindowDetector implements InsightDetector {
  readonly type = InsightType.SERVICE_WINDOW;

  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceCompliance: ServiceComplianceService,
  ) {}

  async detect(ctx: DetectorContext): Promise<InsightCandidate[]> {
    const horizon = new Date(ctx.now.getTime() + 72 * 3600_000);
    const minWindowMs = ctx.policy.serviceWindowMinHours * 3600_000;

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ['AVAILABLE', 'RENTED'] },
      },
      select: {
        id: true,
        licensePlate: true,
        make: true,
        model: true,
        cleaningStatus: true,
        healthStatus: true,
      },
    });

    const BATCH = 20;
    const serviceDueSoonIds = new Set<string>();

    for (let i = 0; i < vehicles.length; i += BATCH) {
      const batch = vehicles.slice(i, i + BATCH);
      const evaluations = await Promise.all(
        batch.map((v) => this.serviceCompliance.evaluateNextService(v.id, ctx.now).catch(() => null)),
      );
      for (let j = 0; j < batch.length; j++) {
        const ns = evaluations[j];
        if (!ns || ns.trackingStatus !== 'TRACKED') continue;
        const overdue = ns.severity === 'CRITICAL';
        const imminent =
          ns.severity === 'WARNING' &&
          !overdue &&
          ((ns.timeToNextServiceDays != null &&
            ns.timeToNextServiceDays >= 0 &&
            ns.timeToNextServiceDays <= NEXT_SERVICE_WARNING_DAYS) ||
            (ns.distanceToNextServiceKm != null &&
              ns.distanceToNextServiceKm >= 0 &&
              ns.distanceToNextServiceKm <= NEXT_SERVICE_WARNING_KM));
        if (overdue || imminent) serviceDueSoonIds.add(batch[j].id);
      }
    }

    const needsAttention = vehicles.filter(
      (v) =>
        v.cleaningStatus !== 'CLEAN' ||
        v.healthStatus !== 'GOOD' ||
        serviceDueSoonIds.has(v.id),
    );

    const candidates: InsightCandidate[] = [];
    if (needsAttention.length === 0) return candidates;

    const vehicleIds = needsAttention.map((v) => v.id);
    const allBookings = await this.prisma.booking.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        organizationId: ctx.organizationId,
        status: { in: ['CONFIRMED', 'ACTIVE'] },
        startDate: { lte: horizon },
        endDate: { gte: ctx.now },
      },
      orderBy: { startDate: 'asc' },
      select: { vehicleId: true, startDate: true, endDate: true },
    });

    const bookingsByVehicle = new Map<string, { startDate: Date; endDate: Date }[]>();
    for (const b of allBookings) {
      const list = bookingsByVehicle.get(b.vehicleId) ?? [];
      list.push({ startDate: b.startDate, endDate: b.endDate });
      bookingsByVehicle.set(b.vehicleId, list);
    }

    for (const v of needsAttention) {
      const bookings = bookingsByVehicle.get(v.id) ?? [];
      const gaps = this.findGaps(ctx.now, horizon, bookings);
      const usableGap = gaps.find((g) => g.durationMs >= minWindowMs);

      if (usableGap) {
        const hours = Math.round(usableGap.durationMs / 3600_000);
        const label = v.licensePlate || `${v.make} ${v.model}`;
        const reasons: string[] = [];
        if (v.cleaningStatus !== 'CLEAN') reasons.push(`Cleaning: ${v.cleaningStatus}`);
        if (v.healthStatus !== 'GOOD') reasons.push(`Health: ${v.healthStatus}`);
        if (serviceDueSoonIds.has(v.id)) reasons.push('Service laut HM/OEM bald fällig oder überfällig');

        candidates.push({
          type: this.type,
          severity: InsightSeverity.OPPORTUNITY,
          priority: 55,
          title: 'Servicefenster verfügbar',
          message: `${label} hat ein ${hours}h-Fenster — ${reasons[0]?.toLowerCase() || 'gute Zeit für Werkstatt'}.`,
          actionLabel: 'Service planen',
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
