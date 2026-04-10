import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { InsightCandidate, InsightDetector, DetectorContext, InsightType, InsightSeverity, InsightEntityScope } from '../insight.types';

@Injectable()
export class TightHandoverDetector implements InsightDetector {
  readonly type = InsightType.TIGHT_HANDOVER;

  constructor(private readonly prisma: PrismaService) {}

  async detect(ctx: DetectorContext): Promise<InsightCandidate[]> {
    const horizon = new Date(ctx.now.getTime() + 48 * 3600_000);

    const bookings = await this.prisma.booking.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ['CONFIRMED', 'ACTIVE'] },
        startDate: { lte: horizon },
        endDate: { gte: ctx.now },
      },
      orderBy: { startDate: 'asc' },
      select: {
        id: true, vehicleId: true, startDate: true, endDate: true,
        pickupStationId: true, returnStationId: true,
        vehicle: { select: { licensePlate: true, make: true, model: true, stationId: true } },
      },
    });

    const byVehicle = new Map<string, typeof bookings>();
    for (const b of bookings) {
      const arr = byVehicle.get(b.vehicleId) ?? [];
      arr.push(b);
      byVehicle.set(b.vehicleId, arr);
    }

    const candidates: InsightCandidate[] = [];
    const bufferMs = ctx.policy.handoverBufferMin * 60_000;

    for (const [vehicleId, vBookings] of byVehicle) {
      if (vBookings.length < 2) continue;
      const sorted = vBookings.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        const gapMs = next.startDate.getTime() - current.endDate.getTime();

        if (gapMs >= bufferMs || gapMs < 0) continue;

        const gapMin = Math.round(gapMs / 60_000);
        const label = current.vehicle?.licensePlate || `${current.vehicle?.make ?? ''} ${current.vehicle?.model ?? ''}`.trim() || vehicleId.slice(0, 8);
        const severity = gapMin < 30 ? InsightSeverity.CRITICAL : InsightSeverity.WARNING;
        const hoursUntilNext = Math.max(0, Math.round((next.startDate.getTime() - ctx.now.getTime()) / 3600_000));

        candidates.push({
          type: this.type,
          severity,
          priority: severity === InsightSeverity.CRITICAL ? 95 : 80,
          title: 'Tight Handover',
          message: `${label}: only ${gapMin} min between return and next pickup${hoursUntilNext <= 6 ? ' (today)' : ''}.`,
          actionLabel: 'View bookings',
          actionType: 'navigate_bookings',
          entityScope: InsightEntityScope.VEHICLE,
          entityIds: [vehicleId],
          timeContext: {
            returnAt: current.endDate.toISOString(),
            nextPickupAt: next.startDate.toISOString(),
            ...(current.returnStationId ? { returnStationId: current.returnStationId } : {}),
            ...(next.pickupStationId ? { pickupStationId: next.pickupStationId } : {}),
          },
          metrics: {
            gapMinutes: gapMin,
            bufferRequired: ctx.policy.handoverBufferMin,
            hoursUntilNextPickup: hoursUntilNext,
          },
          reasons: [
            `Gap between bookings is ${gapMin} min, below ${ctx.policy.handoverBufferMin} min buffer`,
            ...(current.returnStationId !== next.pickupStationId && current.returnStationId && next.pickupStationId
              ? ['Return and pickup are at different stations']
              : []),
          ],
          confidence: 1.0,
          dedupeKey: `tight_handover:${vehicleId}:${current.id}:${next.id}`,
          expiresAt: next.startDate,
        });
      }
    }
    return candidates;
  }
}
