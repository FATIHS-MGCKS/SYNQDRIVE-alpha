import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { TireHealthService } from '../../vehicle-intelligence/tires/tire-health.service';
import { isAlertableStatus } from '../../vehicle-intelligence/tires/tire-status';
import {
  DetectorContext,
  InsightCandidate,
  InsightDetector,
  InsightEntityScope,
  InsightSeverity,
  InsightType,
} from '../insight.types';

/**
 * Surfaces vehicles whose tires are at risk by reading the canonical
 * {@link TireHealthService.getSummary} read model — no second threshold set and
 * no parallel status re-computation. WATCH → INFO insight; WARNING/CRITICAL →
 * vehicle alert. Pure estimates never escalate to CRITICAL.
 */
@Injectable()
export class TireCriticalDetector implements InsightDetector {
  readonly type = InsightType.TIRE_CRITICAL;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tireHealth: TireHealthService,
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
      const summary = await this.tireHealth.getSummary(v.id);
      if (!summary) continue;

      const overall = summary.overallStatus;
      const hasMeasurement = summary.displayMode === 'MEASURED';
      const label = v.licensePlate || `${v.make} ${v.model}`;

      if (overall === 'WATCH') {
        candidates.push({
          type: this.type,
          severity: InsightSeverity.INFO,
          priority: 40,
          title: 'Reifen beobachten',
          message: `${label}: Reifenzustand im Beobachtungsbereich — planmäßige Prüfung empfohlen.`,
          actionLabel: 'Fahrzeug prüfen',
          actionType: 'navigate_vehicle',
          entityScope: InsightEntityScope.VEHICLE,
          entityIds: [v.id],
          metrics: {
            overallStatus: overall,
            confidence: summary.confidence,
            measured: hasMeasurement,
          },
          reasons: ['Reifenzustand WATCH'],
          confidence: hasMeasurement ? 0.75 : 0.5,
          dedupeKey: `tire_critical:${v.id}`,
          groupKey: v.homeStationId ? `tire_critical:${v.homeStationId}` : 'tire_critical_fleet',
        });
        continue;
      }

      if (!isAlertableStatus(overall)) continue;

      let severity: InsightSeverity =
        overall === 'CRITICAL' ? InsightSeverity.CRITICAL : InsightSeverity.WARNING;
      if (severity === InsightSeverity.CRITICAL && !hasMeasurement) {
        severity = InsightSeverity.WARNING;
      }

      const primaryAlert =
        summary.alerts.find((a) => a.severity === 'critical') ??
        summary.alerts.find((a) => a.severity === 'warning') ??
        null;
      const treadTxt =
        summary.lowestTreadMm != null
          ? `${summary.lowestTreadMm.toFixed(1)} mm${summary.lowestTreadPosition ? ` (${summary.lowestTreadPosition})` : ''}`
          : 'unbekannt';

      const title =
        severity === InsightSeverity.CRITICAL
          ? 'Reifen kritisch — Austausch nötig'
          : 'Reifen beobachten — Austausch planen';
      const message =
        primaryAlert?.message ??
        (severity === InsightSeverity.CRITICAL
          ? `Profiltiefe bei ${treadTxt} — Reifen umgehend austauschen.`
          : `Profiltiefe bei ${treadTxt} — Austausch zeitnah einplanen.`);

      const reasons: string[] = [primaryAlert?.message ?? `Reifenzustand ${overall}`];
      reasons.push(hasMeasurement ? 'Basis: gemessene Profiltiefe' : 'Basis: geschätzte Profiltiefe');
      if (summary.measurementAgeDays != null) {
        reasons.push(`Letzte Messung ${summary.measurementAgeDays} Tage her`);
      } else {
        reasons.push('Keine Messung hinterlegt');
      }

      candidates.push({
        type: this.type,
        severity,
        priority: severity === InsightSeverity.CRITICAL ? 84 : 62,
        title,
        message: `${label}: ${message}`,
        actionLabel: 'Fahrzeug prüfen',
        actionType: 'navigate_vehicle',
        entityScope: InsightEntityScope.VEHICLE,
        entityIds: [v.id],
        timeContext: summary.lastMeasurementAt
          ? { observedAt: summary.lastMeasurementAt }
          : undefined,
        metrics: {
          overallStatus: overall,
          lowestTreadMm: summary.lowestTreadMm ?? 'unknown',
          lowestTreadPosition: summary.lowestTreadPosition ?? 'unknown',
          measured: hasMeasurement,
          confidence: summary.confidence,
        },
        reasons,
        confidence: hasMeasurement ? 0.92 : 0.6,
        dedupeKey: `tire_critical:${v.id}`,
        groupKey: v.homeStationId ? `tire_critical:${v.homeStationId}` : 'tire_critical_fleet',
      });
    }

    return candidates;
  }
}
