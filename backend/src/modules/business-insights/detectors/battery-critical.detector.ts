import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { CanonicalBatteryHealthService } from '../../vehicle-intelligence/battery-health/canonical-battery-health.service';
import { resolveBatteryAlertCandidate } from '../../vehicle-intelligence/battery-health/canonical-battery';
import {
  DetectorContext,
  InsightCandidate,
  InsightDetector,
  InsightEntityScope,
  InsightType,
} from '../insight.types';

/**
 * Surfaces vehicles whose battery is at risk by reading
 * {@link CanonicalBatteryHealthService.getSummary} — no parallel Prisma
 * classification, voltage bands, or freshness derivation in this consumer.
 * WATCH never raises an alert; WARNING/CRITICAL on LV or HV do.
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

      const alert = resolveBatteryAlertCandidate(summary, v, ctx.now);
      if (!alert) continue;

      const reasons: string[] = [alert.reason];
      if (alert.observedAt) {
        const ageH = Math.round(
          (ctx.now.getTime() - alert.observedAt.getTime()) / 3_600_000,
        );
        reasons.push(ageH < 1 ? 'Messwert aktuell' : `Messwert ${ageH} h alt`);
      }
      reasons.push('Startschwierigkeiten möglich');

      candidates.push({
        type: this.type,
        severity: alert.severity,
        priority: alert.priority,
        title: alert.title,
        message: alert.message,
        actionLabel: 'Fahrzeug prüfen',
        actionType: 'navigate_vehicle',
        entityScope: InsightEntityScope.VEHICLE,
        entityIds: [v.id],
        timeContext: alert.observedAt
          ? { observedAt: alert.observedAt.toISOString() }
          : undefined,
        metrics: alert.metrics,
        reasons,
        confidence: alert.metrics.restingVoltageV !== 'unknown' ? 0.95 : 0.8,
        dedupeKey: `battery_critical:${v.id}`,
        groupKey: v.homeStationId
          ? `battery_critical:${v.homeStationId}`
          : 'battery_critical_fleet',
      });
    }

    return candidates;
  }
}
