import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { CanonicalBatteryHealthService } from '../../vehicle-intelligence/battery-health/canonical-battery-health.service';
import { evaluateBatteryAlerts } from '../../vehicle-intelligence/battery-health/battery-alert.policy';
import {
  DetectorContext,
  InsightCandidate,
  InsightDetector,
  InsightEntityScope,
  InsightType,
} from '../insight.types';

/**
 * Surfaces battery alerts only from reliable evidence (warning light, safety DTC,
 * stable qualified LV publication, workshop/manual findings). Proxy, shadow,
 * legacy scores, and missing data never alert.
 */
@Injectable()
export class BatteryCriticalDetector implements InsightDetector {
  readonly type = InsightType.BATTERY_CRITICAL;

  constructor(
    private readonly prisma: PrismaService,
    private readonly canonicalBatteryHealth: CanonicalBatteryHealthService,
  ) {}

  async detect(ctx: DetectorContext): Promise<InsightCandidate[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ['AVAILABLE', 'RENTED', 'IN_SERVICE', 'RESERVED'] },
      },
      select: {
        id: true,
        make: true,
        model: true,
        licensePlate: true,
        homeStationId: true,
      },
    });

    if (vehicles.length === 0) return [];

    const candidates: InsightCandidate[] = [];

    for (const v of vehicles) {
      const summary = await this.canonicalBatteryHealth
        .getSummary(v.id)
        .catch(() => null);
      if (!summary) continue;

      const alerts = evaluateBatteryAlerts({
        summary,
        vehicle: v,
        now: ctx.now,
      });
      if (alerts.length === 0) continue;

      for (const alert of alerts) {
        const reasons = [alert.cause];
        if (alert.freshness.decisionFresh) {
          reasons.push('Evidenz fresh');
        } else if (alert.freshness.ageMs != null) {
          const ageH = Math.round(alert.freshness.ageMs / 3_600_000);
          reasons.push(ageH < 1 ? 'Messwert aktuell' : `Messwert ${ageH} h alt`);
        }
        reasons.push(`Evidenzstärke: ${alert.evidenceTier}`);

        candidates.push({
          type: this.type,
          severity: alert.severity,
          priority: alert.priority,
          title: alert.title,
          message: alert.message,
          actionLabel: alert.recommendedAction,
          actionType: 'navigate_vehicle',
          entityScope: InsightEntityScope.VEHICLE,
          entityIds: [v.id],
          timeContext: alert.observedAt
            ? { observedAt: alert.observedAt.toISOString() }
            : undefined,
          metrics: {
            ...alert.metrics,
            ruleId: alert.ruleId,
            evidenceTier: alert.evidenceTier,
            freshness: alert.freshness,
            autoResolveWhen: alert.autoResolveWhen,
            recommendedAction: alert.recommendedAction,
            policyVersion: alert.policyVersion,
            legacyDedupeKey: `battery_critical:${v.id}`,
          },
          reasons,
          confidence: alert.freshness.decisionFresh ? 0.95 : 0.75,
          dedupeKey: alert.dedupeKey,
          groupKey: v.homeStationId
            ? `battery_critical:${v.homeStationId}`
            : 'battery_critical_fleet',
        });
      }
    }

    return candidates;
  }
}
