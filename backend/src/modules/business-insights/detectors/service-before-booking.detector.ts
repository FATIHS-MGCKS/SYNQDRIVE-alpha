import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { InsightCandidate, InsightDetector, DetectorContext, InsightType, InsightSeverity, InsightEntityScope } from '../insight.types';

@Injectable()
export class ServiceBeforeBookingDetector implements InsightDetector {
  readonly type = InsightType.SERVICE_BEFORE_BOOKING;

  constructor(private readonly prisma: PrismaService) {}

  async detect(ctx: DetectorContext): Promise<InsightCandidate[]> {
    const horizon = new Date(ctx.now.getTime() + ctx.policy.serviceBeforeBookingHours * 3600_000);

    const upcoming = await this.prisma.booking.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ['CONFIRMED', 'PENDING'] },
        startDate: { gte: ctx.now, lte: horizon },
      },
      select: { id: true, vehicleId: true, startDate: true },
      orderBy: { startDate: 'asc' },
    });

    const seen = new Set<string>();
    const candidates: InsightCandidate[] = [];

    for (const b of upcoming) {
      if (seen.has(b.vehicleId)) continue;
      seen.add(b.vehicleId);

      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: b.vehicleId },
        select: {
          id: true, licensePlate: true, make: true, model: true,
          cleaningStatus: true, healthStatus: true, nextServiceDueDate: true,
        },
      });
      if (!vehicle) continue;

      const reasons: string[] = [];
      if (vehicle.cleaningStatus && vehicle.cleaningStatus !== 'CLEAN') {
        reasons.push(`Cleaning status: ${vehicle.cleaningStatus}`);
      }
      if (vehicle.healthStatus && vehicle.healthStatus !== 'GOOD') {
        reasons.push(`Health status: ${vehicle.healthStatus}`);
      }
      if (vehicle.nextServiceDueDate && vehicle.nextServiceDueDate <= b.startDate) {
        reasons.push('Service due before pickup');
      }

      const activeDtc = await this.prisma.vehicleDtcEvent.count({
        where: { vehicleId: vehicle.id, isActive: true },
      });
      if (activeDtc > 0) reasons.push(`${activeDtc} active error code${activeDtc > 1 ? 's' : ''}`);

      if (reasons.length === 0) continue;

      const hoursUntil = Math.round((b.startDate.getTime() - ctx.now.getTime()) / 3600_000);
      const label = vehicle.licensePlate || `${vehicle.make} ${vehicle.model}`;
      const severity = hoursUntil < 6 ? InsightSeverity.CRITICAL : hoursUntil < 24 ? InsightSeverity.WARNING : InsightSeverity.INFO;

      candidates.push({
        type: this.type,
        severity,
        priority: severity === InsightSeverity.CRITICAL ? 88 : severity === InsightSeverity.WARNING ? 72 : 50,
        title: 'Check Before Rental',
        message: `${label} needs attention before pickup in ${hoursUntil}h — ${reasons[0].toLowerCase()}.`,
        actionLabel: 'Review vehicle',
        actionType: 'navigate_vehicle',
        entityScope: InsightEntityScope.VEHICLE,
        entityIds: [vehicle.id],
        timeContext: { pickupAt: b.startDate.toISOString() },
        metrics: { hoursUntilPickup: hoursUntil, issueCount: reasons.length },
        reasons,
        confidence: 0.95,
        dedupeKey: `service_before_booking:${vehicle.id}:${b.id}`,
        expiresAt: b.startDate,
      });
    }
    return candidates;
  }
}
