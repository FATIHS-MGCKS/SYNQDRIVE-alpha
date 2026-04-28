import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DetectorContext,
  InsightCandidate,
  InsightDetector,
  InsightEntityScope,
  InsightSeverity,
  InsightType,
} from '../insight.types';

/**
 * Surfaces vehicles whose 12V battery is at risk of causing starting problems.
 *
 * Thresholds mirror CanonicalBatteryHealthService (single source of truth):
 *   voltage < 12.0V  → CRITICAL — battery depleted, starting unlikely
 *   voltage < 12.4V  → WARNING  — starting difficulty possible
 *   SOH     < 50%    → CRITICAL — replacement recommended
 *   SOH     < 75%    → WARNING  — monitor, declining capacity
 *
 * SOH truth (V4.6.35 — no more false alarms from raw outlier samples):
 *   The detector now consumes the SAME SOH the Health Tab shows —
 *   BatteryFeatures.publishedSohPct from the V2 publication pipeline
 *   (raw → stabilized → published, with outlier suppression and hysteresis).
 *   Previously the detector read BatteryHealthSnapshot.sohPercent directly,
 *   which surfaced transient single-sample outliers (e.g. a 25 % reading
 *   between multiple 79–100 % readings) as CRITICAL alerts while the
 *   canonical service correctly reported 86 % stabilized.
 *
 *   Vehicles in INITIAL_CALIBRATION publication state are skipped for SOH
 *   classification — the value is not yet trustworthy. Voltage-based
 *   classification still runs so a genuinely flat 12 V battery is still
 *   flagged during calibration. If no V2 record exists at all, we fall
 *   back to the legacy snapshot SOH (preserves behaviour for vehicles that
 *   never entered the V2 pipeline).
 *
 * The detector reads the fleet's VehicleLatestState (populated by DIMO
 * telemetry and, for MQTT-push vehicles, High Mobility health ingestion) so
 * the dashboard reflects the same voltage the Health Tab displays. Vehicles
 * without a recent voltage sample or without a calibrated SOH are skipped —
 * we never fabricate a critical state from missing data.
 *
 * Freshness window: 72h. A stale voltage is NOT promoted into a critical
 * insight because the real-world state may have changed since the last
 * sample (engine started, alternator charged).
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
        latestState: {
          select: {
            lvBatteryVoltage: true,
            lastSeenAt: true,
          },
        },
      },
    });

    if (vehicles.length === 0) return [];

    const vehicleIds = vehicles.map((v) => v.id);

    // Latest battery health snapshot per vehicle (cheap single query). We
    // pull a small window and reduce client-side to the most recent row per
    // vehicle — keeps this detector to two DB round-trips regardless of
    // fleet size.
    const [snapshots, featuresRows] = await Promise.all([
      this.prisma.batteryHealthSnapshot.findMany({
        where: {
          vehicleId: { in: vehicleIds },
          recordedAt: { gte: freshnessCutoff },
        },
        orderBy: { recordedAt: 'desc' },
        select: {
          vehicleId: true,
          voltageV: true,
          sohPercent: true,
          recordedAt: true,
        },
      }),
      // V2 publication pipeline — single source of truth for SOH (same row
      // CanonicalBatteryHealthService reads for the Health Tab).
      this.prisma.batteryFeatures.findMany({
        where: { vehicleId: { in: vehicleIds } },
        select: {
          vehicleId: true,
          publishedSohPct: true,
          publicationState: true,
        },
      }),
    ]);

    const latestSnapshotByVehicle = new Map<
      string,
      { voltageV: number | null; sohPercent: number | null; recordedAt: Date }
    >();
    for (const s of snapshots) {
      if (!latestSnapshotByVehicle.has(s.vehicleId)) {
        latestSnapshotByVehicle.set(s.vehicleId, {
          voltageV: s.voltageV,
          sohPercent: s.sohPercent,
          recordedAt: s.recordedAt,
        });
      }
    }

    const featuresByVehicle = new Map<
      string,
      { publishedSohPct: number | null; publicationState: string | null }
    >();
    for (const f of featuresRows) {
      featuresByVehicle.set(f.vehicleId, {
        publishedSohPct: f.publishedSohPct ?? null,
        publicationState: (f.publicationState as string | null) ?? null,
      });
    }

    const candidates: InsightCandidate[] = [];

    for (const v of vehicles) {
      const snap = latestSnapshotByVehicle.get(v.id);
      const features = featuresByVehicle.get(v.id);
      const stateVoltage = v.latestState?.lvBatteryVoltage ?? null;
      const stateSeenAt = v.latestState?.lastSeenAt ?? null;
      const snapVoltage = snap?.voltageV ?? null;
      const snapSoh = snap?.sohPercent ?? null;
      const snapAt = snap?.recordedAt ?? null;

      // Prefer the fresher voltage carrier (mirrors CanonicalBatteryHealthService).
      let voltage: number | null = null;
      let observedAt: Date | null = null;
      if (snapVoltage != null && stateVoltage != null) {
        const snapNewer =
          snapAt && stateSeenAt
            ? snapAt.getTime() >= stateSeenAt.getTime()
            : snapAt != null;
        voltage = snapNewer ? snapVoltage : stateVoltage;
        observedAt = snapNewer ? snapAt : stateSeenAt;
      } else if (snapVoltage != null) {
        voltage = snapVoltage;
        observedAt = snapAt;
      } else if (stateVoltage != null) {
        voltage = stateVoltage;
        observedAt = stateSeenAt;
      }

      // Skip stale samples — a 4-day-old 11.8V reading is not actionable.
      if (observedAt && observedAt < freshnessCutoff) {
        voltage = null;
        observedAt = null;
      }

      // SOH — canonical precedence:
      //   1) V2.publishedSohPct when the pipeline has published a value
      //   2) legacy BatteryHealthSnapshot.sohPercent ONLY if the vehicle
      //      has never entered the V2 pipeline (features absent)
      //   3) otherwise SOH is intentionally unavailable (we do not want to
      //      alert on a raw sample that the pipeline has already classified
      //      as an outlier — that was the root cause of historical false
      //      alarms on WOB X 6511: snapshot=25 %, published=86 %).
      let soh: number | null;
      let sohSource: 'v2_published' | 'legacy_snapshot' | 'suppressed_calibrating' | 'suppressed_outlier' | 'unavailable' =
        'unavailable';
      if (features) {
        if (features.publicationState === BatteryCriticalDetector.INITIAL_CALIBRATION) {
          // Not enough qualified observations yet — treating this as
          // CRITICAL would fire spurious alerts on every new vehicle.
          soh = null;
          sohSource = 'suppressed_calibrating';
        } else if (features.publishedSohPct != null) {
          soh = features.publishedSohPct;
          sohSource = 'v2_published';
        } else {
          // V2 row exists but hasn't published yet (e.g. stabilizing without
          // a published value). Do NOT fall back to the raw snapshot — that
          // would re-introduce the outlier false-alarm path.
          soh = null;
          sohSource = 'suppressed_outlier';
        }
      } else if (snapSoh != null) {
        soh = snapSoh;
        sohSource = 'legacy_snapshot';
      } else {
        soh = null;
      }

      // Classify strictly using the canonical thresholds. Voltage wins over
      // SOH when voltage is definitively in the critical band because a
      // depleted 12V battery is an immediate operational risk.
      let severity: InsightSeverity | null = null;
      let reason: string | null = null;
      let title = 'Batterie kritisch';
      let message = '';
      let priority = 60;

      if (voltage != null && voltage < 12.0) {
        severity = InsightSeverity.CRITICAL;
        reason = `Spannung ${voltage.toFixed(2)} V (< 12.0 V)`;
        title = 'Batterie kritisch — Starthilfe empfohlen';
        message = `Spannung bei ${voltage.toFixed(2)} V — Batterie entladen, Starthilfe oder Austausch empfohlen. Startschwierigkeiten wahrscheinlich.`;
        priority = 85;
      } else if (soh != null && soh < 50) {
        severity = InsightSeverity.CRITICAL;
        reason = `SOH ${Math.round(soh)}% (< 50%)`;
        title = 'Batterie kritisch — SOH unter 50%';
        message = `Kapazität bei ${Math.round(soh)}% SOH — Austausch empfohlen. Startschwierigkeiten wahrscheinlich.`;
        priority = 80;
      } else if (voltage != null && voltage < 12.4) {
        severity = InsightSeverity.WARNING;
        reason = `Spannung ${voltage.toFixed(2)} V (< 12.4 V)`;
        title = 'Batterie kritisch beobachten';
        message = `Spannung bei ${voltage.toFixed(2)} V — Startschwierigkeiten möglich. Ladezustand und Lichtmaschine prüfen.`;
        priority = 65;
      } else if (soh != null && soh < 75) {
        severity = InsightSeverity.WARNING;
        reason = `SOH ${Math.round(soh)}% (< 75%)`;
        title = 'Batterie kritisch beobachten';
        message = `Kapazität bei ${Math.round(soh)}% SOH — Startschwierigkeiten möglich, Batterie beobachten.`;
        priority = 60;
      }

      if (!severity) continue;

      const label = v.licensePlate || `${v.make} ${v.model}`;
      const reasons: string[] = [reason!];
      if (observedAt) {
        const ageH = Math.round(
          (ctx.now.getTime() - observedAt.getTime()) / 3_600_000,
        );
        reasons.push(
          ageH < 1 ? 'Messwert aktuell' : `Messwert ${ageH} h alt`,
        );
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
          voltageV: voltage ?? 'unknown',
          sohPercent: soh ?? 'unknown',
          // Provenance — reveals whether the SOH came from the V2 publication
          // pipeline (trusted, stabilized) or the legacy snapshot fallback.
          sohSource,
        },
        reasons,
        confidence: voltage != null ? 0.95 : 0.8,
        dedupeKey: `battery_critical:${v.id}`,
        groupKey: v.stationId
          ? `battery_critical:${v.stationId}`
          : 'battery_critical_fleet',
      });
    }

    return candidates;
  }
}
