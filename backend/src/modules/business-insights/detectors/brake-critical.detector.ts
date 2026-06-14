import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  aggregateBrakeCondition,
  classifyDiscConditionLabel,
  classifyDtcSeverity,
  classifyEstimatedCondition,
  classifyFluidStatus,
  classifyMeasuredThickness,
  isAlertableCondition,
  type BrakeCondition,
} from '../../vehicle-intelligence/brakes/brake-status';
import { BRAKE_HEALTH_CONFIG } from '../../vehicle-intelligence/brakes/brake-health.config';
import {
  DetectorContext,
  InsightCandidate,
  InsightDetector,
  InsightEntityScope,
  InsightSeverity,
  InsightType,
} from '../insight.types';

/**
 * Surfaces vehicles whose brakes are at risk, using the SAME classification
 * rules as BrakeHealthService (`brake-status.ts`) — there is no second set of
 * brake thresholds. A vehicle alert is only produced for WARNING or CRITICAL;
 * WATCH stays visible in the Brake module / Vehicle Health / Fleet Condition but
 * never raises an alert.
 *
 * Honesty / spam protection (hard rules):
 *   · A purely ESTIMATED condition can never exceed WARNING — many harsh
 *     brakings + high usage at most produce a WARNING alert.
 *   · CRITICAL is only emitted when backed by a real safety signal: a
 *     measured/documented critical pad thickness, a brake-system DTC, a critical
 *     brake-fluid state, or a confirmed immediate-replacement document.
 *   · The dedupeKey is preserved so the existing dedup/resolution system
 *     collapses repeats.
 */
@Injectable()
export class BrakeCriticalDetector implements InsightDetector {
  readonly type = InsightType.BRAKE_CRITICAL;
  private readonly cfg = BRAKE_HEALTH_CONFIG;

  constructor(private readonly prisma: PrismaService) {}

  async detect(ctx: DetectorContext): Promise<InsightCandidate[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ['AVAILABLE', 'RENTED', 'IN_SERVICE', 'RESERVED'] },
      },
      select: { id: true, make: true, model: true, licensePlate: true, stationId: true },
    });
    if (vehicles.length === 0) return [];

    const vehicleIds = vehicles.map((v) => v.id);

    const currents = await this.prisma.brakeHealthCurrent.findMany({
      where: { vehicleId: { in: vehicleIds } },
      select: {
        vehicleId: true,
        isInitialized: true,
        anchorServiceDate: true,
        confidenceScore: true,
        frontPadHealthPct: true,
        frontDiscHealthPct: true,
        rearPadHealthPct: true,
        rearDiscHealthPct: true,
        frontPadRemainingKm: true,
        frontDiscRemainingKm: true,
        rearPadRemainingKm: true,
        rearDiscRemainingKm: true,
      },
    });
    const currentByVehicle = new Map(currents.map((c) => [c.vehicleId, c]));

    const evidence = await this.prisma.brakeEvidence.findMany({
      where: { vehicleId: { in: vehicleIds } },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        vehicleId: true,
        source: true,
        axle: true,
        measuredPadMm: true,
        discCondition: true,
        brakeFluidStatus: true,
        dtcSeverity: true,
        immediateReplacement: true,
        measuredAt: true,
        createdAt: true,
      },
    });
    const evidenceByVehicle = new Map<string, typeof evidence>();
    for (const e of evidence) {
      const list = evidenceByVehicle.get(e.vehicleId) ?? [];
      list.push(e);
      evidenceByVehicle.set(e.vehicleId, list);
    }

    const candidates: InsightCandidate[] = [];

    for (const v of vehicles) {
      const current = currentByVehicle.get(v.id);
      const rows = evidenceByVehicle.get(v.id) ?? [];
      const anchorMs = current?.anchorServiceDate
        ? new Date(current.anchorServiceDate).getTime()
        : 0;
      const fresh = rows.filter((e) => {
        const t = e.measuredAt ? new Date(e.measuredAt).getTime() : new Date(e.createdAt).getTime();
        return t >= anchorMs;
      });

      const initialized = !!current?.isInitialized;

      const axleMin = (a?: number | null, b?: number | null): number | null => {
        const vals = [a, b].filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
        return vals.length ? Math.min(...vals) : null;
      };

      const frontHealth = initialized ? axleMin(current?.frontPadHealthPct, current?.frontDiscHealthPct) : null;
      const rearHealth = initialized ? axleMin(current?.rearPadHealthPct, current?.rearDiscHealthPct) : null;
      const frontRemaining = initialized ? axleMin(current?.frontPadRemainingKm, current?.frontDiscRemainingKm) : null;
      const rearRemaining = initialized ? axleMin(current?.rearPadRemainingKm, current?.rearDiscRemainingKm) : null;

      let frontCond: BrakeCondition = initialized
        ? classifyEstimatedCondition(frontHealth, frontRemaining)
        : 'UNKNOWN';
      let rearCond: BrakeCondition = initialized
        ? classifyEstimatedCondition(rearHealth, rearRemaining)
        : 'UNKNOWN';

      // Fresh measured thickness can escalate to a real CRITICAL.
      let hasRealSignal = false;
      const frontMeas = fresh.find(
        (e) => (e.axle === 'FRONT' || e.axle === 'UNKNOWN') && e.measuredPadMm != null,
      );
      if (frontMeas?.measuredPadMm != null) {
        frontCond = aggregateBrakeCondition(
          frontCond,
          classifyMeasuredThickness(frontMeas.measuredPadMm, this.cfg.pad.criticalMm, this.cfg.pad.warningMm),
        );
        hasRealSignal = true;
      }
      const rearMeas = fresh.find(
        (e) => (e.axle === 'REAR' || e.axle === 'UNKNOWN') && e.measuredPadMm != null,
      );
      if (rearMeas?.measuredPadMm != null) {
        rearCond = aggregateBrakeCondition(
          rearCond,
          classifyMeasuredThickness(rearMeas.measuredPadMm, this.cfg.pad.criticalMm, this.cfg.pad.warningMm),
        );
        hasRealSignal = true;
      }

      // System safety signals (fluid / disc / DTC / immediate replacement).
      let safety: BrakeCondition = 'UNKNOWN';
      for (const e of fresh) {
        if (e.brakeFluidStatus) safety = aggregateBrakeCondition(safety, classifyFluidStatus(e.brakeFluidStatus));
        if (e.discCondition) safety = aggregateBrakeCondition(safety, classifyDiscConditionLabel(e.discCondition));
        if (e.dtcSeverity) safety = aggregateBrakeCondition(safety, classifyDtcSeverity(e.dtcSeverity));
        if (e.immediateReplacement === true) safety = aggregateBrakeCondition(safety, 'CRITICAL');
      }
      if (safety !== 'UNKNOWN') hasRealSignal = true;
      frontCond = aggregateBrakeCondition(frontCond, safety);
      rearCond = aggregateBrakeCondition(rearCond, safety);

      const overall = aggregateBrakeCondition(frontCond, rearCond);
      if (!isAlertableCondition(overall)) continue;

      // Honesty guard: a CRITICAL not backed by a real signal is capped at WARNING.
      let severity: InsightSeverity =
        overall === 'CRITICAL' ? InsightSeverity.CRITICAL : InsightSeverity.WARNING;
      if (severity === InsightSeverity.CRITICAL && !hasRealSignal) {
        severity = InsightSeverity.WARNING;
      }

      const label = v.licensePlate || `${v.make} ${v.model}`;
      const minRemaining = axleMin(frontRemaining, rearRemaining);
      const { title, message, reason, priority } = this.buildCopy({
        overall,
        severity,
        hasRealSignal,
        minRemaining,
      });

      const reasons: string[] = [reason];
      reasons.push(hasRealSignal ? 'Basis: gemessene/dokumentierte Bremswerte' : 'Basis: geschätzter Bremszustand');

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
          frontCondition: frontCond,
          rearCondition: rearCond,
          minRemainingKm: minRemaining ?? 'unknown',
          realSignal: hasRealSignal,
        },
        reasons,
        confidence: hasRealSignal ? 0.9 : 0.6,
        dedupeKey: `brake_critical:${v.id}`,
        groupKey: v.stationId ? `brake_critical:${v.stationId}` : 'brake_critical_fleet',
      });
    }

    return candidates;
  }

  private buildCopy(args: {
    overall: BrakeCondition;
    severity: InsightSeverity;
    hasRealSignal: boolean;
    minRemaining: number | null;
  }): { title: string; message: string; reason: string; priority: number } {
    const remainingTxt =
      args.minRemaining != null ? `~${Math.round(args.minRemaining).toLocaleString('de-DE')} km Restnutzung` : null;

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
