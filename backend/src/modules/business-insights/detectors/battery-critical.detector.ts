import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  classifyCrankDrop,
  classifyHvSoh,
  classifyLvEstimatedHealth,
  classifyRestingVoltage,
  type BatteryHealthStatus,
} from '../../vehicle-intelligence/battery-health/battery-status';
import {
  DetectorContext,
  InsightCandidate,
  InsightDetector,
  InsightEntityScope,
  InsightSeverity,
  InsightType,
} from '../insight.types';

/**
 * Surfaces vehicles whose battery is at risk, using the SAME classification
 * rules as CanonicalBatteryHealthService (`battery-status.ts`) — there is no
 * second set of thresholds. A vehicle alert is only produced for WARNING or
 * CRITICAL; WATCH stays visible in the Battery module / Vehicle Health /
 * Fleet Condition but never raises an alert.
 *
 * LV (12 V) alert grounds (V4.8 Battery overhaul):
 *   · Resting-voltage status WARNING/CRITICAL — battery-spec aware bands
 *     (lead-acid / AGM / EFB; lithium is UNSUPPORTED → no false alert).
 *     Only a genuine resting voltage is used, never a live charging voltage.
 *   · Estimated Battery Health WARNING/CRITICAL — from the V2 publication
 *     pipeline (stabilized, hysteresis-gated; never a raw outlier sample).
 *   · Bad crank drop — escalates a low resting voltage to CRITICAL.
 *
 * HV (traction) alert grounds:
 *   · HV SOH WARNING/CRITICAL only when a reliable SOH basis exists
 *     (provider / capacity measurement). Never on unavailable/unknown SOH and
 *     never from an age/km fallback (that model has been removed).
 *
 * Spam protection:
 *   · A resting-voltage WARNING requires TWO consecutive qualified resting
 *     measurements below the band — a single dip does not alert.
 *   · A resting-voltage CRITICAL fires immediately (depleted battery is an
 *     urgent operational risk), as does WARNING-voltage + bad crank drop.
 *   · Estimated-health values are already stabilized by the pipeline.
 *   · The dedupeKey is preserved so the existing dedup/resolution system
 *     collapses repeats.
 */
@Injectable()
export class BatteryCriticalDetector implements InsightDetector {
  readonly type = InsightType.BATTERY_CRITICAL;

  private static readonly FRESHNESS_WINDOW_MS = 72 * 60 * 60 * 1000;
  private static readonly INITIAL_CALIBRATION = 'INITIAL_CALIBRATION';

  constructor(private readonly prisma: PrismaService) {}

  async detect(ctx: DetectorContext): Promise<InsightCandidate[]> {
    const freshnessCutoff = new Date(
      ctx.now.getTime() - BatteryCriticalDetector.FRESHNESS_WINDOW_MS,
    );

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
        fuelType: true,
        latestState: {
          select: {
            tractionBatterySohPercent: true,
            lastSeenAt: true,
          },
        },
      },
    });

    if (vehicles.length === 0) return [];

    const vehicleIds = vehicles.map((v) => v.id);

    const [snapshots, featuresRows, specRows, hvCurrentRows] = await Promise.all([
      // Resting-voltage history within the freshness window. We keep the two
      // most recent QUALIFIED resting samples per vehicle for the
      // two-consecutive spam guard.
      this.prisma.batteryHealthSnapshot.findMany({
        where: {
          vehicleId: { in: vehicleIds },
          recordedAt: { gte: freshnessCutoff },
        },
        orderBy: { recordedAt: 'desc' },
        select: {
          vehicleId: true,
          restingVoltage: true,
          voltageV: true,
          engineRunning: true,
          recordedAt: true,
        },
      }),
      // V2 publication pipeline — single source of truth for the LV estimated
      // health score + crank drop.
      this.prisma.batteryFeatures.findMany({
        where: { vehicleId: { in: vehicleIds } },
        select: {
          vehicleId: true,
          publishedSohPct: true,
          publicationState: true,
          crankDrop: true,
        },
      }),
      // Battery spec (latest per vehicle) for chemistry-aware voltage bands.
      this.prisma.vehicleBatterySpec.findMany({
        where: { vehicleId: { in: vehicleIds } },
        orderBy: { createdAt: 'desc' },
        select: { vehicleId: true, batteryType: true, createdAt: true },
      }),
      // HV publication state (capacity/energy-based SOH).
      this.prisma.hvBatteryHealthCurrent.findMany({
        where: { vehicleId: { in: vehicleIds } },
        select: {
          vehicleId: true,
          publishedSohPct: true,
          publicationState: true,
        },
      }),
    ]);

    // Two most-recent qualified resting samples per vehicle.
    const restingByVehicle = new Map<
      string,
      Array<{ restingVoltage: number; recordedAt: Date }>
    >();
    for (const s of snapshots) {
      const resting =
        s.restingVoltage ?? (s.engineRunning === false ? s.voltageV : null);
      if (resting == null) continue;
      const list = restingByVehicle.get(s.vehicleId) ?? [];
      if (list.length < 2) {
        list.push({ restingVoltage: resting, recordedAt: s.recordedAt });
        restingByVehicle.set(s.vehicleId, list);
      }
    }

    const featuresByVehicle = new Map<
      string,
      { publishedSohPct: number | null; publicationState: string | null; crankDrop: number | null }
    >();
    for (const f of featuresRows) {
      featuresByVehicle.set(f.vehicleId, {
        publishedSohPct: f.publishedSohPct ?? null,
        publicationState: (f.publicationState as string | null) ?? null,
        crankDrop: f.crankDrop ?? null,
      });
    }

    const batteryTypeByVehicle = new Map<string, string | null>();
    for (const spec of specRows) {
      if (!batteryTypeByVehicle.has(spec.vehicleId)) {
        batteryTypeByVehicle.set(spec.vehicleId, spec.batteryType ?? null);
      }
    }

    const hvCurrentByVehicle = new Map<
      string,
      { publishedSohPct: number | null; publicationState: string | null }
    >();
    for (const h of hvCurrentRows) {
      hvCurrentByVehicle.set(h.vehicleId, {
        publishedSohPct: h.publishedSohPct ?? null,
        publicationState: (h.publicationState as string | null) ?? null,
      });
    }

    const candidates: InsightCandidate[] = [];

    for (const v of vehicles) {
      const restingSamples = restingByVehicle.get(v.id) ?? [];
      const features = featuresByVehicle.get(v.id);
      const batteryType = batteryTypeByVehicle.get(v.id) ?? null;

      // ── LV resting voltage ───────────────────────────────────────────────
      const latestResting = restingSamples[0] ?? null;
      const restingClass = latestResting
        ? classifyRestingVoltage(latestResting.restingVoltage, batteryType)
        : null;
      const restingStatus = restingClass?.status ?? 'UNKNOWN';
      const secondResting = restingSamples[1] ?? null;
      const secondRestingBelowWarning = secondResting
        ? ['WARNING', 'CRITICAL'].includes(
            classifyRestingVoltage(secondResting.restingVoltage, batteryType).status,
          )
        : false;

      // ── LV estimated health (only once published) ─────────────────────────
      let estHealthStatus: BatteryHealthStatus = 'UNKNOWN';
      if (
        features &&
        features.publicationState !== BatteryCriticalDetector.INITIAL_CALIBRATION &&
        features.publishedSohPct != null
      ) {
        estHealthStatus = classifyLvEstimatedHealth(features.publishedSohPct);
      }

      // ── LV crank drop ─────────────────────────────────────────────────────
      const crankStatus = classifyCrankDrop(features?.crankDrop ?? null);
      const crankBad = crankStatus === 'WARNING' || crankStatus === 'CRITICAL';

      // ── LV severity decision ──────────────────────────────────────────────
      let severity: InsightSeverity | null = null;
      let reason: string | null = null;
      let title = 'Batterie kritisch';
      let message = '';
      let priority = 60;
      const label = v.licensePlate || `${v.make} ${v.model}`;

      if (
        restingStatus === 'CRITICAL' ||
        (restingStatus === 'WARNING' && crankBad)
      ) {
        const vtxt = latestResting!.restingVoltage.toFixed(2);
        severity = InsightSeverity.CRITICAL;
        reason = `Ruhespannung ${vtxt} V kritisch`;
        title = 'Batterie kritisch — Starthilfe empfohlen';
        message = `Ruhespannung bei ${vtxt} V — Batterie entladen, Starthilfe oder Austausch empfohlen. Startschwierigkeiten wahrscheinlich.`;
        priority = 85;
      } else if (estHealthStatus === 'CRITICAL') {
        severity = InsightSeverity.CRITICAL;
        reason = 'Geschätzte Batteriegesundheit kritisch';
        title = 'Batterie kritisch — Gesundheit niedrig';
        message =
          'Geschätzte 12V-Batteriegesundheit kritisch — Austausch empfohlen. Startschwierigkeiten wahrscheinlich.';
        priority = 80;
      } else if (restingStatus === 'WARNING' && secondRestingBelowWarning) {
        const vtxt = latestResting!.restingVoltage.toFixed(2);
        severity = InsightSeverity.WARNING;
        reason = `Ruhespannung ${vtxt} V niedrig (2 Messungen)`;
        title = 'Batterie kritisch beobachten';
        message = `Ruhespannung bei ${vtxt} V über zwei Messungen — Startschwierigkeiten möglich. Ladezustand und Lichtmaschine prüfen.`;
        priority = 65;
      } else if (estHealthStatus === 'WARNING' || crankStatus === 'CRITICAL') {
        severity = InsightSeverity.WARNING;
        reason =
          crankStatus === 'CRITICAL'
            ? 'Schlechtes Startverhalten (Crank Drop)'
            : 'Geschätzte Batteriegesundheit niedrig';
        title = 'Batterie kritisch beobachten';
        message =
          crankStatus === 'CRITICAL'
            ? 'Hoher Spannungseinbruch beim Start — Batterie beobachten, Startschwierigkeiten möglich.'
            : 'Geschätzte 12V-Batteriegesundheit niedrig — Batterie beobachten, Startschwierigkeiten möglich.';
        priority = 60;
      }

      // ── HV SOH (EV only, reliable data only) ──────────────────────────────
      const isEv = v.fuelType === 'ELECTRIC' || v.fuelType === 'PLUGIN_HYBRID';
      if (!severity && isEv) {
        const hvCurrent = hvCurrentByVehicle.get(v.id);
        const providerSoh = v.latestState?.tractionBatterySohPercent ?? null;
        const capacitySoh =
          hvCurrent &&
          hvCurrent.publicationState !== BatteryCriticalDetector.INITIAL_CALIBRATION
            ? hvCurrent.publishedSohPct
            : null;
        const hvSoh = providerSoh ?? capacitySoh ?? null;
        const hvStatus = classifyHvSoh(hvSoh);
        if (hvSoh != null && (hvStatus === 'WARNING' || hvStatus === 'CRITICAL')) {
          severity =
            hvStatus === 'CRITICAL'
              ? InsightSeverity.CRITICAL
              : InsightSeverity.WARNING;
          reason = `HV-SOH ${Math.round(hvSoh)} %`;
          title =
            hvStatus === 'CRITICAL'
              ? 'Traktionsbatterie kritisch'
              : 'Traktionsbatterie beobachten';
          message = `HV-Batteriegesundheit bei ${Math.round(hvSoh)} % — Diagnose der Traktionsbatterie empfohlen.`;
          priority = hvStatus === 'CRITICAL' ? 82 : 62;
        }
      }

      if (!severity) continue;

      const observedAt = latestResting?.recordedAt ?? v.latestState?.lastSeenAt ?? null;
      const reasons: string[] = [reason!];
      if (observedAt) {
        const ageH = Math.round(
          (ctx.now.getTime() - observedAt.getTime()) / 3_600_000,
        );
        reasons.push(ageH < 1 ? 'Messwert aktuell' : `Messwert ${ageH} h alt`);
      }
      reasons.push('Startschwierigkeiten möglich');

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
        timeContext: observedAt
          ? { observedAt: observedAt.toISOString() }
          : undefined,
        metrics: {
          restingVoltageV: latestResting?.restingVoltage ?? 'unknown',
          restingStatus,
          estimatedHealthStatus: estHealthStatus,
          crankDropStatus: crankStatus,
        },
        reasons,
        confidence: latestResting != null ? 0.95 : 0.8,
        dedupeKey: `battery_critical:${v.id}`,
        groupKey: v.stationId
          ? `battery_critical:${v.stationId}`
          : 'battery_critical_fleet',
      });
    }

    return candidates;
  }
}
