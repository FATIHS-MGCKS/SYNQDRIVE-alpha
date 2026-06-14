import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  aggregateTireStatus,
  classifyMeasurementOverdue,
  classifyRemainingKmStatus,
  classifySeasonStatus,
  classifyTireAgeYears,
  classifyTreadStatus,
  dotAgeYears,
  isAlertableStatus,
  type TireStatus,
} from '../../vehicle-intelligence/tires/tire-status';
import {
  DetectorContext,
  InsightCandidate,
  InsightDetector,
  InsightEntityScope,
  InsightSeverity,
  InsightType,
} from '../insight.types';

/**
 * Surfaces vehicles whose tires are at risk, using the SAME classification
 * rules as TireHealthService (`tire-status.ts`) — there is no second set of
 * tire thresholds. A vehicle alert is only produced for WARNING or CRITICAL;
 * WATCH stays visible in the Tire module / Vehicle Health / Fleet Condition but
 * never raises an alert.
 *
 * Read model (no expensive per-vehicle re-computation):
 *   · The lowest tread is read from the most recent real measurement when one
 *     exists, otherwise from the latest persisted health snapshot (which is the
 *     calibrated estimate written by TireHealthService.recalculate()).
 *   · remaining-km, season and DOT-age signals are read from the persisted
 *     active setup. Tread, remaining-km, season-mismatch and tire-age are
 *     aggregated (CRITICAL wins) into one honest status.
 *
 * Honesty / spam protection:
 *   · CRITICAL is only emitted as CRITICAL when it is backed by a real
 *     measurement. A pure estimate (no measurement on record) is capped at
 *     WARNING so an estimate never masquerades as a confirmed "replace now".
 *   · The dedupeKey is preserved so the existing dedup/resolution system
 *     collapses repeats.
 */
@Injectable()
export class TireCriticalDetector implements InsightDetector {
  readonly type = InsightType.TIRE_CRITICAL;

  constructor(private readonly prisma: PrismaService) {}

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
        stationId: true,
      },
    });
    if (vehicles.length === 0) return [];

    const vehicleIds = vehicles.map((v) => v.id);

    const setups = await this.prisma.vehicleTireSetup.findMany({
      where: { vehicleId: { in: vehicleIds }, status: 'ACTIVE', removedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        vehicleId: true,
        tireSeason: true,
        overallRemainingKm: true,
        confidenceLabel: true,
        dotCodeFront: true,
        dotCodeRear: true,
        measurements: {
          orderBy: { measuredAt: 'desc' },
          take: 1,
          select: {
            frontLeftMm: true,
            frontRightMm: true,
            rearLeftMm: true,
            rearRightMm: true,
            measuredAt: true,
          },
        },
        snapshots: {
          orderBy: { snapshotDate: 'desc' },
          take: 1,
          select: { estimatedTreadMm: true, snapshotDate: true },
        },
      },
    });

    // Most recent active setup per vehicle.
    const setupByVehicle = new Map<string, (typeof setups)[number]>();
    for (const s of setups) {
      if (!setupByVehicle.has(s.vehicleId)) setupByVehicle.set(s.vehicleId, s);
    }

    const candidates: InsightCandidate[] = [];

    for (const v of vehicles) {
      const setup = setupByVehicle.get(v.id);
      if (!setup) continue; // No active tire set → UNKNOWN, never an alert.

      const season = setup.tireSeason as string | null;
      const measurement = setup.measurements[0] ?? null;
      const measuredVals = measurement
        ? [measurement.frontLeftMm, measurement.frontRightMm, measurement.rearLeftMm, measurement.rearRightMm].filter(
            (x): x is number => x != null,
          )
        : [];
      const hasMeasurement = measuredVals.length > 0;

      // Lowest tread: a real measurement is truth; otherwise the calibrated
      // snapshot estimate.
      const measuredLowest = hasMeasurement ? Math.min(...measuredVals) : null;
      const lowest = measurement
        ? this.lowestPositionFromMeasurement(measurement)
        : null;
      const snapshotLowest = setup.snapshots[0]?.estimatedTreadMm ?? null;
      const lowestTreadMm = measuredLowest ?? snapshotLowest;

      const measurementAgeDays = measurement?.measuredAt
        ? Math.floor((ctx.now.getTime() - new Date(measurement.measuredAt).getTime()) / 86400000)
        : null;

      // ── Sub-statuses ──
      const treadStatus = classifyTreadStatus(lowestTreadMm, season);
      const remainingKmStatus = classifyRemainingKmStatus(setup.overallRemainingKm);
      const seasonResult = classifySeasonStatus(season, ctx.now);
      const dotAges = [dotAgeYears(setup.dotCodeFront, ctx.now), dotAgeYears(setup.dotCodeRear, ctx.now)].filter(
        (x): x is number => x != null,
      );
      const maxAgeYears = dotAges.length > 0 ? Math.max(...dotAges) : null;
      const ageStatus = classifyTireAgeYears(maxAgeYears);

      const overall = aggregateTireStatus(
        treadStatus,
        remainingKmStatus,
        seasonResult.status,
        ageStatus,
      );

      if (!isAlertableStatus(overall)) continue;

      // Honest severity: never claim a confirmed "replace now" from a pure
      // estimate. A CRITICAL estimate without a measurement is capped at WARNING.
      let severity: InsightSeverity =
        overall === 'CRITICAL' ? InsightSeverity.CRITICAL : InsightSeverity.WARNING;
      if (severity === InsightSeverity.CRITICAL && !hasMeasurement) {
        severity = InsightSeverity.WARNING;
      }

      const label = v.licensePlate || `${v.make} ${v.model}`;
      const { title, message, reason, priority } = this.buildCopy({
        overall,
        severity,
        treadStatus,
        remainingKmStatus,
        seasonResult,
        ageStatus,
        ageYears: maxAgeYears,
        lowestTreadMm,
        lowestPosition: lowest?.label ?? null,
        hasMeasurement,
      });

      const reasons: string[] = [reason];
      reasons.push(hasMeasurement ? 'Basis: gemessene Profiltiefe' : 'Basis: geschätzte Profiltiefe');
      if (measurementAgeDays != null) {
        reasons.push(
          classifyMeasurementOverdue(measurementAgeDays)
            ? `Letzte Messung ${measurementAgeDays} Tage her (überfällig)`
            : `Letzte Messung ${measurementAgeDays} Tage her`,
        );
      } else {
        reasons.push('Keine Messung hinterlegt');
      }

      const observedAt = measurement?.measuredAt ?? setup.snapshots[0]?.snapshotDate ?? null;

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
        timeContext: observedAt ? { observedAt: new Date(observedAt).toISOString() } : undefined,
        metrics: {
          overallStatus: overall,
          treadStatus,
          remainingKmStatus,
          seasonStatus: seasonResult.status,
          ageStatus,
          lowestTreadMm: lowestTreadMm != null ? Math.round(lowestTreadMm * 10) / 10 : 'unknown',
          lowestTreadPosition: lowest?.label ?? 'unknown',
          measured: hasMeasurement,
          confidenceLabel: setup.confidenceLabel ?? 'unknown',
        },
        reasons,
        confidence: hasMeasurement ? 0.92 : 0.6,
        dedupeKey: `tire_critical:${v.id}`,
        groupKey: v.stationId ? `tire_critical:${v.stationId}` : 'tire_critical_fleet',
      });
    }

    return candidates;
  }

  private buildCopy(args: {
    overall: TireStatus;
    severity: InsightSeverity;
    treadStatus: TireStatus;
    remainingKmStatus: TireStatus;
    seasonResult: { status: TireStatus; mismatch: boolean; expectedSeason: string };
    ageStatus: TireStatus;
    ageYears: number | null;
    lowestTreadMm: number | null;
    lowestPosition: string | null;
    hasMeasurement: boolean;
  }): { title: string; message: string; reason: string; priority: number } {
    const treadTxt =
      args.lowestTreadMm != null
        ? `${(Math.round(args.lowestTreadMm * 10) / 10).toFixed(1)} mm${args.lowestPosition ? ` (${args.lowestPosition})` : ''}`
        : 'unbekannt';

    // Tread drives the strongest, safety-relevant message.
    if (args.treadStatus === 'CRITICAL') {
      const replaceNow = args.severity === InsightSeverity.CRITICAL;
      return {
        title: replaceNow ? 'Reifen kritisch — Austausch nötig' : 'Reifen kritisch beobachten',
        message: replaceNow
          ? `Profiltiefe bei ${treadTxt} — am/unter gesetzlichem Minimum (1,6 mm). Reifen umgehend austauschen.`
          : `Geschätzte Profiltiefe bei ${treadTxt} — nahe gesetzlichem Minimum. Profiltiefe messen und Austausch einplanen.`,
        reason: `Profiltiefe ${treadTxt} kritisch`,
        priority: replaceNow ? 84 : 66,
      };
    }
    if (args.treadStatus === 'WARNING' || args.remainingKmStatus === 'WARNING') {
      return {
        title: 'Reifen beobachten — Austausch planen',
        message: `Profiltiefe bei ${treadTxt} — Austausch zeitnah einplanen.`,
        reason: `Profiltiefe ${treadTxt} niedrig`,
        priority: 62,
      };
    }
    if (args.seasonResult.mismatch && args.seasonResult.status === 'WARNING') {
      return {
        title: 'Reifen — falsche Saison',
        message: 'Sommerreifen in der Winterperiode montiert — reduzierter Grip bei Kälte/Nässe/Schnee. Winter-/Ganzjahresreifen empfohlen.',
        reason: 'Sommerreifen im Winter',
        priority: 60,
      };
    }
    if (args.ageStatus === 'WARNING') {
      return {
        title: 'Reifen — Alter kritisch',
        message: `Reifen ~${Math.round(args.ageYears ?? 0)} Jahre alt (DOT) — Austausch unabhängig vom Profil empfohlen.`,
        reason: `Reifenalter ~${Math.round(args.ageYears ?? 0)} Jahre`,
        priority: 58,
      };
    }
    return {
      title: 'Reifen beobachten',
      message: `Reifenzustand auffällig (${treadTxt}) — Prüfung empfohlen.`,
      reason: 'Reifenzustand auffällig',
      priority: 55,
    };
  }

  private lowestPositionFromMeasurement(m: {
    frontLeftMm: number | null;
    frontRightMm: number | null;
    rearLeftMm: number | null;
    rearRightMm: number | null;
  }): { mm: number; label: string } | null {
    const entries: Array<{ mm: number; label: string }> = [];
    if (m.frontLeftMm != null) entries.push({ mm: m.frontLeftMm, label: 'front left' });
    if (m.frontRightMm != null) entries.push({ mm: m.frontRightMm, label: 'front right' });
    if (m.rearLeftMm != null) entries.push({ mm: m.rearLeftMm, label: 'rear left' });
    if (m.rearRightMm != null) entries.push({ mm: m.rearRightMm, label: 'rear right' });
    if (entries.length === 0) return null;
    return entries.reduce((min, e) => (e.mm < min.mm ? e : min), entries[0]);
  }
}
