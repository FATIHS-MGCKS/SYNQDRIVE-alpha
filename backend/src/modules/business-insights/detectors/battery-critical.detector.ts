import { Injectable } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  classifyHvSoh,
  classifyLvEstimatedHealth,
  classifyRestingVoltage,
  selectBestBatterySpec,
  specUsedForRestingThresholds,
  type BatteryHealthStatus,
} from '../../vehicle-intelligence/battery-health/battery-status';
import {
  effectiveLvEstimatedHealthStatusForDecisions,
  evaluateLegacyPublicationSafety,
} from '../../vehicle-intelligence/battery-health/battery-legacy-publication-safety';
import { effectiveCrankStatusForDecisions } from '../../vehicle-intelligence/battery-health/battery-crank-policy';
import { isLegacyHvDegradationModel } from '../../vehicle-intelligence/battery-health/soh-publication';
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
  private static readonly HV_PROVIDER_FRESH_MS = 45 * 24 * 60 * 60 * 1000;
  private static readonly HV_REPORTED_FRESH_MS = 365 * 24 * 60 * 60 * 1000;
  private static readonly HV_REPORTED_SOURCES: BatteryEvidenceSourceType[] = [
    BatteryEvidenceSourceType.DOCUMENT_CONFIRMED,
    BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
    BatteryEvidenceSourceType.MANUAL_REPORT,
  ];

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
        homeStationId: true,
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

    const [snapshots, featuresRows, specRows, hvCurrentRows, hvEvidenceRows] = await Promise.all([
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
          maturityConfidence: true,
          vOff60m: true,
          vOff6h: true,
          rest60mCapturedAt: true,
          rest6hCapturedAt: true,
          crankDrop: true,
          crankObservationCount: true,
          crankAt: true,
          scoredAt: true,
          lastPublishedAt: true,
        },
      }),
      // Battery specs — best spec per vehicle for chemistry-aware voltage bands.
      this.prisma.vehicleBatterySpec.findMany({
        where: { vehicleId: { in: vehicleIds } },
        select: {
          vehicleId: true,
          batteryType: true,
          batteryVolt: true,
          sourceConfidence: true,
          createdAt: true,
        },
      }),
      // HV publication state (capacity/energy-based SOH).
      this.prisma.hvBatteryHealthCurrent.findMany({
        where: { vehicleId: { in: vehicleIds } },
        select: {
          vehicleId: true,
          publishedSohPct: true,
          publicationState: true,
          publicationMethod: true,
        },
      }),
      // Workshop / document / manual / provider HV SOH — same evidence basis as
      // CanonicalBatteryHealthService (no age/km fallback).
      this.prisma.batteryEvidence.findMany({
        where: {
          vehicleId: { in: vehicleIds },
          OR: [
            {
              scope: BatteryEvidenceScope.HV,
              valueType: BatteryEvidenceValueType.SOH_PERCENT,
              sourceType: {
                in: [
                  BatteryEvidenceSourceType.PROVIDER_REPORTED,
                  ...BatteryCriticalDetector.HV_REPORTED_SOURCES,
                ],
              },
            },
            {
              scope: BatteryEvidenceScope.LV,
              valueType: BatteryEvidenceValueType.SOH_PERCENT,
            },
          ],
        },
        orderBy: { observedAt: 'desc' },
        select: {
          vehicleId: true,
          scope: true,
          sourceType: true,
          valueType: true,
          numericValue: true,
          observedAt: true,
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
      {
        publishedSohPct: number | null;
        publicationState: string | null;
        maturityConfidence: string | null;
        vOff60m: number | null;
        vOff6h: number | null;
        rest60mCapturedAt: Date | null;
        rest6hCapturedAt: Date | null;
        crankDrop: number | null;
        crankObservationCount: number;
        crankAt: Date | null;
        scoredAt: Date | null;
        lastPublishedAt: Date | null;
      }
    >();
    for (const f of featuresRows) {
      featuresByVehicle.set(f.vehicleId, {
        publishedSohPct: f.publishedSohPct ?? null,
        publicationState: (f.publicationState as string | null) ?? null,
        maturityConfidence: (f.maturityConfidence as string | null) ?? null,
        vOff60m: f.vOff60m ?? null,
        vOff6h: f.vOff6h ?? null,
        rest60mCapturedAt: f.rest60mCapturedAt ?? null,
        rest6hCapturedAt: f.rest6hCapturedAt ?? null,
        crankDrop: f.crankDrop ?? null,
        crankObservationCount: f.crankObservationCount ?? 0,
        crankAt: f.crankAt ?? null,
        scoredAt: f.scoredAt ?? null,
        lastPublishedAt: f.lastPublishedAt ?? null,
      });
    }

    const specsByVehicle = new Map<string, typeof specRows>();
    for (const spec of specRows) {
      const list = specsByVehicle.get(spec.vehicleId) ?? [];
      list.push(spec);
      specsByVehicle.set(spec.vehicleId, list);
    }

    const batterySpecByVehicle = new Map<
      string,
      { batteryType: string | null; specProvided: boolean }
    >();
    for (const [vehicleId, vehicleSpecs] of specsByVehicle) {
      const best = selectBestBatterySpec(vehicleSpecs);
      batterySpecByVehicle.set(vehicleId, {
        batteryType: best?.batteryType ?? null,
        specProvided: specUsedForRestingThresholds(best),
      });
    }

    const hvCurrentByVehicle = new Map<
      string,
      {
        publishedSohPct: number | null;
        publicationState: string | null;
        publicationMethod: string | null;
      }
    >();
    for (const h of hvCurrentRows) {
      hvCurrentByVehicle.set(h.vehicleId, {
        publishedSohPct: h.publishedSohPct ?? null,
        publicationState: (h.publicationState as string | null) ?? null,
        publicationMethod: (h.publicationMethod as string | null) ?? null,
      });
    }

    const hvProviderEvidenceByVehicle = new Map<
      string,
      { numericValue: number; observedAt: Date }
    >();
    const hvReportedEvidenceByVehicle = new Map<
      string,
      { numericValue: number; observedAt: Date }
    >();
    const lvSohEvidenceByVehicle = new Map<
      string,
      Array<{ valueType: string; sourceType: string }>
    >();
    for (const row of hvEvidenceRows) {
      if (row.scope === BatteryEvidenceScope.LV) {
        const list = lvSohEvidenceByVehicle.get(row.vehicleId) ?? [];
        if (list.length < 25) {
          list.push({ valueType: row.valueType, sourceType: row.sourceType });
          lvSohEvidenceByVehicle.set(row.vehicleId, list);
        }
        continue;
      }
      if (row.sourceType === BatteryEvidenceSourceType.PROVIDER_REPORTED) {
        if (!hvProviderEvidenceByVehicle.has(row.vehicleId)) {
          hvProviderEvidenceByVehicle.set(row.vehicleId, {
            numericValue: row.numericValue,
            observedAt: row.observedAt,
          });
        }
        continue;
      }
      if (
        BatteryCriticalDetector.HV_REPORTED_SOURCES.includes(row.sourceType) &&
        !hvReportedEvidenceByVehicle.has(row.vehicleId)
      ) {
        hvReportedEvidenceByVehicle.set(row.vehicleId, {
          numericValue: row.numericValue,
          observedAt: row.observedAt,
        });
      }
    }

    const candidates: InsightCandidate[] = [];

    for (const v of vehicles) {
      const restingSamples = restingByVehicle.get(v.id) ?? [];
      const features = featuresByVehicle.get(v.id);
      const batterySpec = batterySpecByVehicle.get(v.id) ?? {
        batteryType: null,
        specProvided: false,
      };

      // ── LV resting voltage ───────────────────────────────────────────────
      const latestResting = restingSamples[0] ?? null;
      const restingClass = latestResting
        ? classifyRestingVoltage(latestResting.restingVoltage, batterySpec.batteryType, {
            specProvided: batterySpec.specProvided,
          })
        : null;
      const restingStatus = restingClass?.status ?? 'UNKNOWN';
      const secondResting = restingSamples[1] ?? null;
      const secondRestingBelowWarning = secondResting
        ? ['WARNING', 'CRITICAL'].includes(
            classifyRestingVoltage(secondResting.restingVoltage, batterySpec.batteryType, {
              specProvided: batterySpec.specProvided,
            }).status,
          )
        : false;

      // ── LV estimated health (only once published and safety-qualified) ───
      let estHealthStatus: BatteryHealthStatus = 'UNKNOWN';
      if (
        features &&
        features.publicationState !== BatteryCriticalDetector.INITIAL_CALIBRATION &&
        features.publishedSohPct != null
      ) {
        const legacySafety = evaluateLegacyPublicationSafety({
          publicationState: features.publicationState,
          publishedSohPct: features.publishedSohPct,
          maturityConfidence: features.maturityConfidence,
          vOff60m: features.vOff60m,
          vOff6h: features.vOff6h,
          rest60mCapturedAt: features.rest60mCapturedAt,
          rest6hCapturedAt: features.rest6hCapturedAt,
          crankDrop: features.crankDrop,
          crankObservationCount: features.crankObservationCount,
          crankAt: features.crankAt,
          scoredAt: features.scoredAt,
          lastPublishedAt: features.lastPublishedAt,
          batteryTypeRaw: batterySpec.batteryType,
          lvEvidenceRecent: lvSohEvidenceByVehicle.get(v.id) ?? [],
        });
        estHealthStatus = effectiveLvEstimatedHealthStatusForDecisions(
          classifyLvEstimatedHealth(features.publishedSohPct),
          legacySafety,
        );
      }

      // ── LV crank drop (legacy path — disabled by default) ─────────────────
      const crankStatus = effectiveCrankStatusForDecisions(features?.crankDrop ?? null);
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
        const providerEvidence = hvProviderEvidenceByVehicle.get(v.id);
        const reportedEvidence = hvReportedEvidenceByVehicle.get(v.id);
        const providerSohFromState = v.latestState?.tractionBatterySohPercent ?? null;
        const providerSoh = providerEvidence?.numericValue ?? providerSohFromState;
        const providerObservedAt =
          providerEvidence?.observedAt ?? v.latestState?.lastSeenAt ?? null;
        const providerFresh =
          providerSoh != null &&
          providerObservedAt != null &&
          ctx.now.getTime() - providerObservedAt.getTime() <=
            BatteryCriticalDetector.HV_PROVIDER_FRESH_MS;

        const reportedSoh = reportedEvidence?.numericValue ?? null;
        const reportedFresh =
          reportedSoh != null &&
          reportedEvidence != null &&
          ctx.now.getTime() - reportedEvidence.observedAt.getTime() <=
            BatteryCriticalDetector.HV_REPORTED_FRESH_MS;

        const capacitySoh =
          hvCurrent &&
          !isLegacyHvDegradationModel(hvCurrent.publicationMethod) &&
          hvCurrent.publicationState !== BatteryCriticalDetector.INITIAL_CALIBRATION
            ? hvCurrent.publishedSohPct
            : null;

        const hvSoh = providerFresh
          ? providerSoh
          : reportedFresh
            ? reportedSoh
            : capacitySoh ?? null;
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
        groupKey: v.homeStationId
          ? `battery_critical:${v.homeStationId}`
          : 'battery_critical_fleet',
      });
    }

    return candidates;
  }
}
