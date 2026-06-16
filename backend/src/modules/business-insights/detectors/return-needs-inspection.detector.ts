import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { InsightCandidate, InsightDetector, DetectorContext, InsightType, InsightSeverity, InsightEntityScope } from '../insight.types';

@Injectable()
export class ReturnNeedsInspectionDetector implements InsightDetector {
  readonly type = InsightType.RETURN_NEEDS_INSPECTION;

  constructor(private readonly prisma: PrismaService) {}

  async detect(ctx: DetectorContext): Promise<InsightCandidate[]> {
    const lookAhead = new Date(ctx.now.getTime() + 24 * 3600_000);

    const returning = await this.prisma.booking.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: 'ACTIVE',
        endDate: { gte: ctx.now, lte: lookAhead },
      },
      select: { id: true, vehicleId: true, endDate: true, startDate: true, kmDriven: true, kmIncluded: true },
    });

    const candidates: InsightCandidate[] = [];

    for (const b of returning) {
      const rentalDays = Math.ceil((b.endDate.getTime() - b.startDate.getTime()) / 86400_000);
      const reasons: string[] = [];

      if (rentalDays >= 14) reasons.push(`Long rental (${rentalDays} days)`);
      if (b.kmDriven != null && b.kmIncluded != null && b.kmDriven > b.kmIncluded) {
        reasons.push(`Km exceeded: ${b.kmDriven} driven vs ${b.kmIncluded} included`);
      }

      const analysis = await this.prisma.rentalDrivingAnalysis.findUnique({
        where: { bookingId: b.id },
        select: { riskLevel: true, abuseDetectionCount: true, drivingScore: true, payload: true },
      });

      if (analysis) {
        const payload = (analysis.payload ?? {}) as {
          vehicleStressSummary?: {
            drivingStressScore?: number | null;
            stressLevel?: string | null;
          };
        };
        const stressScore =
          payload.vehicleStressSummary?.drivingStressScore ?? analysis.drivingScore ?? null;
        const stressLevel = payload.vehicleStressSummary?.stressLevel?.toLowerCase() ?? null;

        const riskLevel = analysis.riskLevel?.toLowerCase() ?? null;
        if (riskLevel === 'high_stress' || riskLevel === 'high') {
          reasons.push(`High vehicle stress profile: ${riskLevel}`);
        }
        if (analysis.abuseDetectionCount != null && analysis.abuseDetectionCount > 0) {
          reasons.push(`${analysis.abuseDetectionCount} abuse events detected`);
        }
        if (stressScore != null && stressScore >= 76) {
          reasons.push(`Critical vehicle stress: ${stressScore}`);
        } else if (stressLevel === 'critical' || stressLevel === 'high') {
          reasons.push(`Elevated vehicle stress: ${stressLevel}`);
        }
      }

      if (reasons.length === 0) continue;

      const severity = reasons.length >= 3 ? InsightSeverity.WARNING : InsightSeverity.INFO;
      candidates.push({
        type: this.type,
        severity,
        priority: severity === InsightSeverity.WARNING ? 70 : 50,
        title: 'Return Needs Attention',
        message: `Vehicle returning ${this.humanDelta(b.endDate, ctx.now)} — ${reasons[0].toLowerCase()}.`,
        actionLabel: 'Review return',
        actionType: 'navigate_booking',
        entityScope: InsightEntityScope.VEHICLE,
        entityIds: [b.vehicleId],
        timeContext: { returnAt: b.endDate.toISOString() },
        metrics: { rentalDays, reasonCount: reasons.length },
        reasons,
        confidence: 0.85,
        dedupeKey: `return_inspection:${b.id}`,
        expiresAt: b.endDate,
      });
    }
    return candidates;
  }

  private humanDelta(target: Date, now: Date): string {
    const h = Math.round((target.getTime() - now.getTime()) / 3600_000);
    if (h < 1) return 'soon';
    if (h < 24) return `in ${h}h`;
    return `in ${Math.round(h / 24)}d`;
  }
}
