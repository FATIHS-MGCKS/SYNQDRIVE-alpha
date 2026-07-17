import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { BrakeHealthService } from '../../vehicle-intelligence/brakes/brake-health.service';
import { isAlertableCondition } from '../../vehicle-intelligence/brakes/brake-status';
import {
  DetectorContext,
  InsightCandidate,
  InsightDetector,
  InsightEntityScope,
  InsightSeverity,
  InsightType,
} from '../insight.types';

/**
 * Surfaces vehicles whose brakes are at risk by reading the canonical
 * {@link BrakeHealthService.getSummary} read model — no parallel threshold logic.
 */
@Injectable()
export class BrakeCriticalDetector implements InsightDetector {
  readonly type = InsightType.BRAKE_CRITICAL;

  constructor(
    private readonly prisma: PrismaService,
    private readonly brakeHealth: BrakeHealthService,
  ) {}

  async detect(ctx: DetectorContext): Promise<InsightCandidate[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ['AVAILABLE', 'RENTED', 'IN_SERVICE', 'RESERVED'] },
      },
      select: { id: true, make: true, model: true, licensePlate: true, homeStationId: true },
    });
    if (vehicles.length === 0) return [];

    const candidates: InsightCandidate[] = [];

    for (const v of vehicles) {
      const summary = await this.brakeHealth.getSummary(v.id);
      if (!summary) continue;

      const overall = summary.overallCondition;
      const hasRealSignal = summary.dataBasis === 'MEASURED' || summary.openAlerts.some(
        (a) =>
          a.category === 'SAFETY' ||
          a.code === 'BRAKE_PAD_CRITICAL' ||
          a.code === 'BRAKE_DISC_CRITICAL' ||
          a.code === 'BRAKE_SYSTEM_DTC',
      );
      const label = v.licensePlate || `${v.make} ${v.model}`;

      if (overall === 'WATCH') {
        candidates.push({
          type: this.type,
          severity: InsightSeverity.INFO,
          priority: 38,
          title: 'Bremsen beobachten',
          message: `${label}: Bremszustand im Beobachtungsbereich — planmäßige Prüfung empfohlen.`,
          actionLabel: 'Fahrzeug prüfen',
          actionType: 'navigate_vehicle',
          entityScope: InsightEntityScope.VEHICLE,
          entityIds: [v.id],
          metrics: { overallCondition: overall },
          reasons: ['Bremszustand WATCH'],
          confidence: hasRealSignal ? 0.75 : 0.5,
          dedupeKey: `brake_critical:${v.id}`,
          groupKey: v.homeStationId ? `brake_critical:${v.homeStationId}` : 'brake_critical_fleet',
        });
        continue;
      }

      if (!isAlertableCondition(overall)) continue;

      let severity: InsightSeverity =
        overall === 'CRITICAL' ? InsightSeverity.CRITICAL : InsightSeverity.WARNING;
      if (severity === InsightSeverity.CRITICAL && !hasRealSignal) {
        severity = InsightSeverity.WARNING;
      }

      const minRemaining = [
        summary.estimatedFrontRemainingKmMin,
        summary.estimatedRearRemainingKmMin,
      ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      const minRemainingKm = minRemaining.length > 0 ? Math.min(...minRemaining) : null;
      const { title, message, reason, priority } = this.buildCopy({
        overall,
        severity,
        hasRealSignal,
        minRemaining: minRemainingKm,
      });

      const reasons: string[] = [reason];
      reasons.push(
        hasRealSignal
          ? 'Basis: gemessene/dokumentierte Bremswerte'
          : 'Basis: geschätzter Bremszustand',
      );

      candidates.push({
        type: this.type,
        severity,
        priority,
        title,
        message: `${label}: ${message}`,
        actionLabel: 'Fahrzeug prüfen',
        actionType: 'navigate_vehicle',
        entityScope: InsightEntityScope.VEHICLE,
        entityIds: [v.id],
        metrics: {
          overallCondition: overall,
          minRemainingKm: minRemainingKm ?? 'unknown',
          realSignal: hasRealSignal,
        },
        reasons,
        confidence: hasRealSignal ? 0.9 : 0.6,
        dedupeKey: `brake_critical:${v.id}`,
        groupKey: v.homeStationId ? `brake_critical:${v.homeStationId}` : 'brake_critical_fleet',
      });
    }

    return candidates;
  }

  private buildCopy(args: {
    overall: string;
    severity: InsightSeverity;
    hasRealSignal: boolean;
    minRemaining: number | null;
  }): { title: string; message: string; reason: string; priority: number } {
    const remainingTxt =
      args.minRemaining != null
        ? `~${Math.round(args.minRemaining).toLocaleString('de-DE')} km Restnutzung`
        : null;

    if (args.overall === 'CRITICAL' && args.severity === InsightSeverity.CRITICAL) {
      return {
        title: 'Bremsen kritisch — Prüfung nötig',
        message:
          'Sicherheitsrelevanter Bremszustand (gemessen/dokumentiert) — Bremsen umgehend in der Werkstatt prüfen/erneuern lassen.',
        reason: 'Bremszustand kritisch (belegt)',
        priority: 84,
      };
    }
    return {
      title: 'Bremsen beobachten — Service planen',
      message: remainingTxt
        ? `Bremszustand WARNUNG (${remainingTxt}) — Bremsenservice zeitnah einplanen.`
        : 'Bremszustand WARNUNG — Bremsenservice zeitnah einplanen.',
      reason: 'Bremszustand niedrig',
      priority: 62,
    };
  }
}
