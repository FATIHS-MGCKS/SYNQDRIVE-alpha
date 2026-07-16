import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  BehaviorEventCategory,
  BehaviorEventClassification,
  DrivingEventSource,
  DrivingEventType,
  HardwareType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import { isNativeExtremeAcceleration } from '../dimo-native-driving-events';
import { DRIVING_IMPACT_CONFIG as C } from './driving-impact.config';
import {
  buildDrivingImpactSourceProvenance,
  type DrivingImpactSourceProvenance,
} from './driving-impact-provenance';
import {
  buildBrakingProvenanceSummary,
  computeBrakingStatistics,
  mapHfBrakingRow,
  mapNativeDrivingEventToBrakingRow,
  reduceHealthEligibilityForBrakeProxy,
  type ClassifiedBrakingRow,
} from './driving-impact-braking-provenance';
import {
  mergeRollingProvenance,
  readTripDrivingImpactProvenance,
} from './driving-impact-provenance.reader';
import {
  capLinear,
  per100Km,
  computeLongitudinalStressScore,
  computeBrakingStressScore,
  computeStopGoStressScore,
  computeHighSpeedStressScore,
  computeThermalBrakeStressScore,
  computeDrivingStressScore,
} from './driving-impact-scorer';

// ── Public consumer DTOs ──────────────────────────────────────────────────────

/** Fields consumed by Tire Health V2 from a single trip impact row. */
export interface TripImpactForTire {
  tripId: string;
  distanceKm: number;
  citySharePct: number | null;
  highwaySharePct: number | null;
  countryRoadSharePct: number | null;
  longitudinalStressScore: number | null;
  brakingStressScore: number | null;
  stopGoStressScore: number | null;
  highSpeedStressScore: number | null;
  drivingStressScore: number | null;
}

/** Fields consumed by Brake Health V2 from a single trip impact row. */
export interface TripImpactForBrake {
  tripId: string;
  distanceKm: number;
  brakingStressScore: number | null;
  stopGoStressScore: number | null;
  highSpeedStressScore: number | null;
  thermalBrakeStressScore: number | null;
  hardBrakePer100Km: number | null;
  fullBrakingPer100Km: number | null;
  brakesPer100Km: number | null;
  stopDensity: number | null;
  highSpeedBrakeShare: number | null;
  meanBrakeEnergyPerKm: number | null;
  p95NegativeDecel: number | null;
}

/** Rolling vehicle-level fields consumed by Tire Health V2. */
export interface VehicleImpactForTire {
  vehicleId: string;
  windowDays: number;
  distanceKmWindow: number | null;
  citySharePct: number | null;
  highwaySharePct: number | null;
  countryRoadSharePct: number | null;
  longitudinalStressScore: number | null;
  brakingStressScore: number | null;
  stopGoStressScore: number | null;
  highSpeedStressScore: number | null;
  drivingStressScore: number | null;
}

/** Rolling vehicle-level fields consumed by Brake Health V2. */
export interface VehicleImpactForBrake {
  vehicleId: string;
  windowDays: number;
  distanceKmWindow: number | null;
  citySharePct: number | null;
  highwaySharePct: number | null;
  countryRoadSharePct: number | null;
  brakingStressScore: number | null;
  stopGoStressScore: number | null;
  highSpeedStressScore: number | null;
  thermalBrakeStressScore: number | null;
  hardBrakePer100Km: number | null;
  fullBrakingPer100Km: number | null;
  brakesPer100Km: number | null;
  stopDensity: number | null;
  highSpeedBrakeShare: number | null;
  meanBrakeEnergyPerKm: number | null;
  p95NegativeDecel: number | null;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class DrivingImpactService {
  private readonly logger = new Logger(DrivingImpactService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  // ── Main computation entry point ────────────────────────────────────────────

  /**
   * Compute and persist the Driving Impact snapshot for a finalized trip.
   * Should be called only after HF enrichment has completed for the trip.
   *
   * Returns true on success, false if the trip was skipped (too short,
   * missing required data, etc).
   */
  async computeForTrip(tripId: string, vehicleId: string): Promise<boolean> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        vehicleId: true,
        vehicle: { select: { organizationId: true, hardwareType: true } },
        startTime: true,
        endTime: true,
        distanceKm: true,
        citySharePercent: true,
        highwaySharePercent: true,
        countrySharePercent: true,
        hardAccelerationCount: true,
        hardBrakingCount: true,
        fullBrakingCount: true,
        kickdownCount: true,
        brakingEventCount: true,
        totalBrakingEvents: true,
        speedingExposurePct: true,
        speedingSectionCount: true,
        speedingDistanceM: true,
        speedingDurationS: true,
        avgOverSpeedKmh: true,
        maxOverSpeedKmh: true,
        drivingScore: true,
        behaviorSummaryJson: true,
      },
    });

    if (!trip) {
      this.logger.warn(`DrivingImpact: trip ${tripId} not found`);
      return false;
    }

    const distanceKm = trip.distanceKm ?? 0;

    // Guard: skip trips below the minimum reliable normalization threshold
    if (distanceKm < C.MINIMUM_RELIABLE_TRIP_KM) {
      this.logger.debug(
        `DrivingImpact: skipping trip ${tripId} — distance ${distanceKm.toFixed(2)} km < ` +
        `${C.MINIMUM_RELIABLE_TRIP_KM} km minimum`,
      );
      return false;
    }

    const organizationId = trip.vehicle?.organizationId ?? null;
    const hardwareType = trip.vehicle?.hardwareType ?? HardwareType.UNKNOWN;
    const useTelemetryDrivingEvents = hardwareType === HardwareType.LTE_R1;

    const [
      nativeEventCount,
      hfEventCount,
      evidenceBySource,
      capabilityRow,
    ] = await Promise.all([
      this.prisma.drivingEvent.count({
        where: {
          tripId,
          source: DrivingEventSource.TELEMETRY_EVENTS,
        },
      }),
      this.prisma.tripBehaviorEvent.count({ where: { tripId } }),
      this.prisma.drivingEvidence.groupBy({
        by: ['sourceType'],
        where: { tripId },
        _count: { _all: true },
      }),
      organizationId
        ? this.prisma.vehicleDrivingCapability.findFirst({
            where: {
              organizationId,
              vehicleId,
              providerSource: 'DIMO_TELEMETRY',
            },
            orderBy: { checkedAt: 'desc' },
            select: { capabilityVersion: true },
          })
        : Promise.resolve(null),
    ]);

    const behaviorSummary = parseBehaviorSummaryJson(trip.behaviorSummaryJson);
    const hfPointsTotal =
      typeof behaviorSummary.hfPointsTotal === 'number'
        ? behaviorSummary.hfPointsTotal
        : null;
    const hfPointsCleaned =
      typeof behaviorSummary.hfPointsCleaned === 'number'
        ? behaviorSummary.hfPointsCleaned
        : null;
    const measurementCoverage =
      hfPointsTotal != null && hfPointsTotal > 0 && hfPointsCleaned != null
        ? Math.round((hfPointsCleaned / hfPointsTotal) * 1000) / 1000
        : null;

    const estimatedProxyEventCount =
      (evidenceBySource.find((row) => row.sourceType === 'ESTIMATED_PROXY')?._count._all ?? 0);
    const contextOnlyEventCount =
      evidenceBySource.find((row) => row.sourceType === 'CONTEXT_SIGNAL')?._count._all ?? 0;

    // ── V3: LTE_R1 — normalized DrivingEvent rows (TELEMETRY_EVENTS source) ──
    // SMART5/UNKNOWN — HF-derived TripBehaviorEvent ACCELERATION/BRAKING rows.
    let extremeAccelCount: number;
    let extremeBrakeCount: number;
    let launchLikeCount: number;
    let classifiedBrakingRows: ClassifiedBrakingRow[];

    if (useTelemetryDrivingEvents) {
      const drivingEvents = await this.prisma.drivingEvent.findMany({
        where: { tripId, source: DrivingEventSource.TELEMETRY_EVENTS },
        select: { eventType: true, speedKmh: true, severity: true, deltaKmh: true, metadataJson: true },
      });

      extremeBrakeCount = drivingEvents.filter(
        (e) => e.eventType === DrivingEventType.EXTREME_BRAKING,
      ).length;
      extremeAccelCount = drivingEvents.filter((e) => isNativeExtremeAcceleration(e)).length;

      launchLikeCount = await this.prisma.tripBehaviorEvent.count({
        where: {
          tripId,
          eventType: { in: ['LAUNCH_CONTROL', 'LAUNCH_LIKE_START'] },
        },
      });

      classifiedBrakingRows = drivingEvents
        .filter(
          (e) =>
            e.eventType === DrivingEventType.HARSH_BRAKING ||
            e.eventType === DrivingEventType.EXTREME_BRAKING,
        )
        .map((e) => mapNativeDrivingEventToBrakingRow(e));
    } else {
      extremeAccelCount = await this.prisma.tripBehaviorEvent.count({
        where: {
          tripId,
          eventCategory: BehaviorEventCategory.ACCELERATION,
          classification: BehaviorEventClassification.EXTREME,
        },
      });

      extremeBrakeCount = await this.prisma.tripBehaviorEvent.count({
        where: {
          tripId,
          eventCategory: BehaviorEventCategory.BRAKING,
          classification: BehaviorEventClassification.EXTREME,
        },
      });

      launchLikeCount = await this.prisma.tripBehaviorEvent.count({
        where: {
          tripId,
          eventType: { in: ['LAUNCH_CONTROL', 'LAUNCH_LIKE_START'] },
        },
      });

      classifiedBrakingRows = (
        await this.prisma.tripBehaviorEvent.findMany({
        where: {
          tripId,
          eventCategory: BehaviorEventCategory.BRAKING,
        },
        select: {
          startSpeedKmh: true,
          endSpeedKmh: true,
          peakValue: true,
        },
      })
      ).map((row) => mapHfBrakingRow(row));
    }

    const brakingStats = computeBrakingStatistics(classifiedBrakingRows, distanceKm, {
      stopSpeedThresholdKmh: C.STOP_SPEED_THRESHOLD_KMH,
      highSpeedBrakeThresholdKmh: C.HIGH_SPEED_BRAKE_THRESHOLD_KMH,
    });
    const brakingProvenance = buildBrakingProvenanceSummary(brakingStats);

    const provenanceBase = buildDrivingImpactSourceProvenance({
      hardwareProfile: hardwareType,
      capabilityVersion: capabilityRow?.capabilityVersion ?? null,
      modelVersion: C.MODEL_VERSION,
      nativeEventCount,
      hfEventCount,
      estimatedProxyEventCount:
        estimatedProxyEventCount + brakingStats.proxyKinematicCount,
      contextOnlyEventCount,
      hasMeasuredRouteContext:
        trip.citySharePercent != null && trip.highwaySharePercent != null,
      measurementCoverage,
    });
    const provenance: DrivingImpactSourceProvenance = {
      ...provenanceBase,
      healthEligibility: reduceHealthEligibilityForBrakeProxy(
        provenanceBase.healthEligibility,
        brakingStats.proxyKinematicShare,
      ),
    };

    // ── Compute per-100 km rates ─────────────────────────────────────────────

    const hardAccelCount = trip.hardAccelerationCount ?? 0;
    const hardBrakeCount = trip.hardBrakingCount ?? 0;
    const fullBrakingCount = trip.fullBrakingCount ?? 0;
    const kickdownCount = trip.kickdownCount ?? 0;
    const brakesTotal = trip.totalBrakingEvents ?? trip.brakingEventCount ?? 0;

    const hardAccelPer100Km = per100Km(hardAccelCount, distanceKm);
    const extremeAccelPer100Km = per100Km(extremeAccelCount, distanceKm);
    const hardBrakePer100Km = per100Km(hardBrakeCount, distanceKm);
    const extremeBrakePer100Km = per100Km(extremeBrakeCount, distanceKm);
    const fullBrakingPer100Km = per100Km(fullBrakingCount, distanceKm);
    const kickdownPer100Km = per100Km(kickdownCount, distanceKm);
    const launchLikePer100Km = per100Km(launchLikeCount, distanceKm);
    const brakesPer100Km = per100Km(brakesTotal, distanceKm);

    // ── Braking statistics (P42: measured/reconstructed vs ESTIMATED_PROXY) ─

    const {
      p95NegativeDecel,
      p95NegativeDecelMeasured,
      p95NegativeDecelProxy,
      meanBrakeEnergyPerKm: mbe,
      meanBrakeEnergyProxyPerKm,
      stopDensity,
      highSpeedBrakeShare,
    } = brakingStats;

    const highSpeedBrakeCount = classifiedBrakingRows.filter(
      (e) => (e.startSpeedKmh ?? 0) >= C.HIGH_SPEED_BRAKE_THRESHOLD_KMH,
    ).length;
    const stopCount = classifiedBrakingRows.filter(
      (e) =>
        (e.endSpeedSource === 'RECONSTRUCTED' || e.endSpeedSource === 'MEASURED_DELTA') &&
        (e.endSpeedKmh ?? 99) < C.STOP_SPEED_THRESHOLD_KMH,
    ).length;

    // ── Usage split ───────────────────────────────────────────────────────────

    const citySharePct = trip.citySharePercent ?? null;
    const highwaySharePct = trip.highwaySharePercent ?? null;
    const countryRoadSharePct = trip.countrySharePercent ?? null;

    // ── Compute stress scores ─────────────────────────────────────────────────

    const longitudinalStressScore = computeLongitudinalStressScore({
      hardAccelPer100Km,
      extremeAccelPer100Km,
      kickdownPer100Km,
      launchLikePer100Km,
    });

    const brakingStressScore = computeBrakingStressScore({
      hardBrakePer100Km,
      extremeBrakePer100Km,
      fullBrakingPer100Km,
      brakesPer100Km,
      p95NegativeDecel,
    });

    const stopGoStressScore = computeStopGoStressScore({
      citySharePct: citySharePct ?? 0,
      stopDensity,
      brakesPer100Km,
    });

    const highSpeedStressScore = computeHighSpeedStressScore({
      highwaySharePct: highwaySharePct ?? 0,
      highSpeedBrakeShare,
    });

    const thermalBrakeStressScore = computeThermalBrakeStressScore({
      highSpeedBrakeShare,
      fullBrakingPer100Km,
      meanBrakeEnergyPerKm: mbe,
      p95NegativeDecel,
    });

    const drivingStressScore = computeDrivingStressScore({
      longitudinalStressScore,
      brakingStressScore,
      stopGoStressScore,
      highSpeedStressScore,
    });

    // Speeding/Safety score retired from rental and new impact persistence (V4.8.24).
    // Trip-level speeding metrics remain on VehicleTrip for route enrichment traceability.
    const speedingExposurePct = trip.speedingExposurePct ?? 0;
    const speedingSectionCount = trip.speedingSectionCount ?? 0;
    const avgOverSpeedKmh = trip.avgOverSpeedKmh ?? 0;
    const maxOverSpeedKmh = trip.maxOverSpeedKmh ?? 0;
    const safetyScore: number | null = null;
    // NOTE (V4.6.83): `TripDrivingImpact.speedingSeverityScore` was previously
    // populated with an ad-hoc `maxOverSpeedKmh * 1.1 + avgOverSpeedKmh * 1.4`
    // formula but never read by any consumer. The canonical speeding-centric
    // scalar is `safetyScore` (via `computeSafetyScore`). V4.6.95 fully
    // retires the column — the migration drops it; no consumer remained.

    // ── Persist TripDrivingImpact ─────────────────────────────────────────────

    await this.prisma.tripDrivingImpact.upsert({
      where: { tripId },
      create: {
        vehicleId,
        organizationId,
        tripId,
        tripStartedAt: trip.startTime,
        tripEndedAt: trip.endTime ?? null,
        distanceKm,

        citySharePct,
        highwaySharePct,
        countryRoadSharePct,

        hardAccelPer100Km,
        extremeAccelPer100Km,
        hardBrakePer100Km,
        extremeBrakePer100Km,
        fullBrakingPer100Km,
        kickdownPer100Km,
        launchLikePer100Km,

        brakesPer100Km,
        stopDensity,
        highSpeedBrakeShare,
        meanBrakeEnergyPerKm: mbe,
        p95NegativeDecel,
        p95NegativeDecelMeasured,
        p95NegativeDecelProxy,
        meanBrakeEnergyProxyPerKm,

        longitudinalStressScore,
        brakingStressScore,
        stopGoStressScore,
        highSpeedStressScore,
        thermalBrakeStressScore,
        drivingStressScore,
        safetyScore,
        speedingExposurePct,
        speedingSectionCount,

        modelVersion: C.MODEL_VERSION,
        sourceSummaryJson: {
          hardAccelCount,
          extremeAccelCount,
          hardBrakeCount,
          extremeBrakeCount,
          fullBrakingCount,
          kickdownCount,
          launchLikeCount,
          brakesTotal,
          highSpeedBrakeCount,
          stopCount,
          speedingExposurePct,
          speedingSectionCount,
          maxOverSpeedKmh,
          avgOverSpeedKmh,
          v3DrivingEventInput: useTelemetryDrivingEvents ? 'TELEMETRY_EVENTS' : 'HF_DERIVED',
          vehicleHardwareType: hardwareType,
          primarySource: provenance.primarySource,
          nativeEventCount: provenance.nativeEventCount,
          hfEventCount: provenance.hfEventCount,
          provenanceVersion: provenance.provenanceVersion,
          brakingProvenance,
        },
        ...provenanceFields(provenance),
      },
      update: {
        // Re-run is idempotent: update all computed fields if impact is recomputed
        tripStartedAt: trip.startTime,
        tripEndedAt: trip.endTime ?? null,
        distanceKm,
        citySharePct,
        highwaySharePct,
        countryRoadSharePct,
        hardAccelPer100Km,
        extremeAccelPer100Km,
        hardBrakePer100Km,
        extremeBrakePer100Km,
        fullBrakingPer100Km,
        kickdownPer100Km,
        launchLikePer100Km,
        brakesPer100Km,
        stopDensity,
        highSpeedBrakeShare,
        meanBrakeEnergyPerKm: mbe,
        p95NegativeDecel,
        p95NegativeDecelMeasured,
        p95NegativeDecelProxy,
        meanBrakeEnergyProxyPerKm,
        longitudinalStressScore,
        brakingStressScore,
        stopGoStressScore,
        highSpeedStressScore,
        thermalBrakeStressScore,
        drivingStressScore,
        safetyScore,
        speedingExposurePct,
        speedingSectionCount,
        modelVersion: C.MODEL_VERSION,
        sourceSummaryJson: {
          hardAccelCount,
          extremeAccelCount,
          hardBrakeCount,
          extremeBrakeCount,
          fullBrakingCount,
          kickdownCount,
          launchLikeCount,
          brakesTotal,
          highSpeedBrakeCount,
          stopCount,
          speedingExposurePct,
          speedingSectionCount,
          maxOverSpeedKmh,
          avgOverSpeedKmh,
          v3DrivingEventInput: useTelemetryDrivingEvents ? 'TELEMETRY_EVENTS' : 'HF_DERIVED',
          vehicleHardwareType: hardwareType,
          primarySource: provenance.primarySource,
          nativeEventCount: provenance.nativeEventCount,
          hfEventCount: provenance.hfEventCount,
          provenanceVersion: provenance.provenanceVersion,
          brakingProvenance,
        },
        ...provenanceFields(provenance),
      },
    });

    // Compatibility mirror: VehicleTrip.drivingScore stores stress (higher = more load).
    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: { drivingScore: drivingStressScore },
    });

    if (trip.drivingScore != null) {
      const drift = Math.abs(trip.drivingScore - drivingStressScore);
      const bucket =
        drift >= 20 ? 'gte20' : drift >= 10 ? 'gte10' : drift >= 5 ? 'gte5' : null;
      if (bucket) {
        this.tripMetrics?.tripScoreDrift.inc({ bucket });
      }
    }

    this.logger.log(
      `DrivingImpact persisted: trip=${tripId} vehicle=${vehicleId} ` +
      `dist=${distanceKm.toFixed(1)}km long=${longitudinalStressScore} ` +
      `brake=${brakingStressScore} stress=${drivingStressScore}`,
    );

    // ── Update rolling current aggregate ─────────────────────────────────────

    await this.updateRollingCurrent(vehicleId, organizationId);

    return true;
  }

  // ── Rolling aggregate ───────────────────────────────────────────────────────

  /**
   * Recompute VehicleDrivingImpactCurrent from the last ROLLING_WINDOW_DAYS
   * of TripDrivingImpact rows for this vehicle.
   *
   * Uses distance-weighted averaging so long trips contribute proportionally more.
   */
  private async updateRollingCurrent(
    vehicleId: string,
    organizationId: string | null,
  ): Promise<void> {
    const windowStart = new Date(
      Date.now() - C.ROLLING_WINDOW_DAYS * 24 * 60 * 60_000,
    );

    const rows = await this.prisma.tripDrivingImpact.findMany({
      where: { vehicleId, tripStartedAt: { gte: windowStart } },
      orderBy: { tripStartedAt: 'asc' },
    });

    if (rows.length === 0) return;

    const provenanceRows = rows.map((row) => readTripDrivingImpactProvenance(row));
    const rollingProvenance = mergeRollingProvenance(provenanceRows);

    const totalKm = rows.reduce((s, r) => s + r.distanceKm, 0);
    const w = (r: typeof rows[0]) => r.distanceKm / totalKm;

    const wavg = <K extends keyof typeof rows[0]>(key: K): number | null => {
      const valid = rows.filter((r) => r[key] != null);
      if (valid.length === 0) return null;
      const totalValidKm = valid.reduce((s, r) => s + r.distanceKm, 0);
      if (totalValidKm === 0) return null;
      return (
        Math.round(
          valid.reduce(
            (s, r) => s + (r[key] as number) * (r.distanceKm / totalValidKm),
            0,
          ) * 100,
        ) / 100
      );
    };

    const windowStartedAt = rows[0].tripStartedAt;
    const windowEndedAt = rows[rows.length - 1].tripEndedAt ?? rows[rows.length - 1].tripStartedAt;

    await this.prisma.vehicleDrivingImpactCurrent.upsert({
      where: { vehicleId },
      create: {
        vehicleId,
        organizationId,
        windowDays: C.ROLLING_WINDOW_DAYS,
        windowStartedAt,
        windowEndedAt,
        distanceKmWindow: Math.round(totalKm * 100) / 100,
        citySharePct: wavg('citySharePct'),
        highwaySharePct: wavg('highwaySharePct'),
        countryRoadSharePct: wavg('countryRoadSharePct'),
        hardAccelPer100Km: wavg('hardAccelPer100Km'),
        extremeAccelPer100Km: wavg('extremeAccelPer100Km'),
        hardBrakePer100Km: wavg('hardBrakePer100Km'),
        extremeBrakePer100Km: wavg('extremeBrakePer100Km'),
        fullBrakingPer100Km: wavg('fullBrakingPer100Km'),
        kickdownPer100Km: wavg('kickdownPer100Km'),
        launchLikePer100Km: wavg('launchLikePer100Km'),
        brakesPer100Km: wavg('brakesPer100Km'),
        stopDensity: wavg('stopDensity'),
        highSpeedBrakeShare: wavg('highSpeedBrakeShare'),
        meanBrakeEnergyPerKm: wavg('meanBrakeEnergyPerKm'),
        p95NegativeDecel: wavg('p95NegativeDecel'),
        p95NegativeDecelMeasured: wavg('p95NegativeDecelMeasured'),
        p95NegativeDecelProxy: wavg('p95NegativeDecelProxy'),
        meanBrakeEnergyProxyPerKm: wavg('meanBrakeEnergyProxyPerKm'),
        longitudinalStressScore: wavg('longitudinalStressScore'),
        brakingStressScore: wavg('brakingStressScore'),
        stopGoStressScore: wavg('stopGoStressScore'),
        highSpeedStressScore: wavg('highSpeedStressScore'),
        thermalBrakeStressScore: wavg('thermalBrakeStressScore'),
        drivingStressScore: wavg('drivingStressScore'),
        safetyScore: wavg('safetyScore'),
        modelVersion: C.MODEL_VERSION,
        ...rollingProvenanceFields(rollingProvenance),
      },
      update: {
        windowDays: C.ROLLING_WINDOW_DAYS,
        windowStartedAt,
        windowEndedAt,
        distanceKmWindow: Math.round(totalKm * 100) / 100,
        citySharePct: wavg('citySharePct'),
        highwaySharePct: wavg('highwaySharePct'),
        countryRoadSharePct: wavg('countryRoadSharePct'),
        hardAccelPer100Km: wavg('hardAccelPer100Km'),
        extremeAccelPer100Km: wavg('extremeAccelPer100Km'),
        hardBrakePer100Km: wavg('hardBrakePer100Km'),
        extremeBrakePer100Km: wavg('extremeBrakePer100Km'),
        fullBrakingPer100Km: wavg('fullBrakingPer100Km'),
        kickdownPer100Km: wavg('kickdownPer100Km'),
        launchLikePer100Km: wavg('launchLikePer100Km'),
        brakesPer100Km: wavg('brakesPer100Km'),
        stopDensity: wavg('stopDensity'),
        highSpeedBrakeShare: wavg('highSpeedBrakeShare'),
        meanBrakeEnergyPerKm: wavg('meanBrakeEnergyPerKm'),
        p95NegativeDecel: wavg('p95NegativeDecel'),
        p95NegativeDecelMeasured: wavg('p95NegativeDecelMeasured'),
        p95NegativeDecelProxy: wavg('p95NegativeDecelProxy'),
        meanBrakeEnergyProxyPerKm: wavg('meanBrakeEnergyProxyPerKm'),
        longitudinalStressScore: wavg('longitudinalStressScore'),
        brakingStressScore: wavg('brakingStressScore'),
        stopGoStressScore: wavg('stopGoStressScore'),
        highSpeedStressScore: wavg('highSpeedStressScore'),
        thermalBrakeStressScore: wavg('thermalBrakeStressScore'),
        drivingStressScore: wavg('drivingStressScore'),
        safetyScore: wavg('safetyScore'),
        modelVersion: C.MODEL_VERSION,
        ...rollingProvenanceFields(rollingProvenance),
      },
    });

    this.logger.debug(
      `DrivingImpact rolling current updated: vehicle=${vehicleId} ` +
      `${rows.length} trips / ${Math.round(totalKm)} km in window`,
    );
  }

  // ── Consumer read methods — Tire Health ────────────────────────────────────

  /** Typed trip impact payload for Tire Health V2 consumption. */
  async getTripImpactForTire(tripId: string): Promise<TripImpactForTire | null> {
    const row = await this.prisma.tripDrivingImpact.findUnique({
      where: { tripId },
      select: {
        tripId: true,
        distanceKm: true,
        citySharePct: true,
        highwaySharePct: true,
        countryRoadSharePct: true,
        longitudinalStressScore: true,
        brakingStressScore: true,
        stopGoStressScore: true,
        highSpeedStressScore: true,
        drivingStressScore: true,
      },
    });
    return row;
  }

  /** Typed rolling vehicle impact payload for Tire Health V2 consumption. */
  async getVehicleImpactForTire(vehicleId: string): Promise<VehicleImpactForTire | null> {
    const row = await this.prisma.vehicleDrivingImpactCurrent.findUnique({
      where: { vehicleId },
      select: {
        vehicleId: true,
        windowDays: true,
        distanceKmWindow: true,
        citySharePct: true,
        highwaySharePct: true,
        countryRoadSharePct: true,
        longitudinalStressScore: true,
        brakingStressScore: true,
        stopGoStressScore: true,
        highSpeedStressScore: true,
        drivingStressScore: true,
      },
    });
    return row;
  }

  // ── Consumer read methods — Brake Health ───────────────────────────────────

  /** Typed trip impact payload for Brake Health V2 consumption. */
  async getTripImpactForBrake(tripId: string): Promise<TripImpactForBrake | null> {
    const row = await this.prisma.tripDrivingImpact.findUnique({
      where: { tripId },
      select: {
        tripId: true,
        distanceKm: true,
        brakingStressScore: true,
        stopGoStressScore: true,
        highSpeedStressScore: true,
        thermalBrakeStressScore: true,
        hardBrakePer100Km: true,
        fullBrakingPer100Km: true,
        brakesPer100Km: true,
        stopDensity: true,
        highSpeedBrakeShare: true,
        meanBrakeEnergyPerKm: true,
        p95NegativeDecel: true,
      },
    });
    return row;
  }

  /** Typed rolling vehicle impact payload for Brake Health V2 consumption. */
  async getVehicleImpactForBrake(vehicleId: string): Promise<VehicleImpactForBrake | null> {
    const row = await this.prisma.vehicleDrivingImpactCurrent.findUnique({
      where: { vehicleId },
      select: {
        vehicleId: true,
        windowDays: true,
        distanceKmWindow: true,
        citySharePct: true,
        highwaySharePct: true,
        countryRoadSharePct: true,
        brakingStressScore: true,
        stopGoStressScore: true,
        highSpeedStressScore: true,
        thermalBrakeStressScore: true,
        hardBrakePer100Km: true,
        fullBrakingPer100Km: true,
        brakesPer100Km: true,
        stopDensity: true,
        highSpeedBrakeShare: true,
        meanBrakeEnergyPerKm: true,
        p95NegativeDecel: true,
      },
    });
    return row;
  }

  /** Full source provenance for a trip impact row (legacy-safe reader). */
  async getTripSourceProvenance(
    tripId: string,
  ): Promise<DrivingImpactSourceProvenance | null> {
    const row = await this.prisma.tripDrivingImpact.findUnique({
      where: { tripId },
      select: {
        modelVersion: true,
        sourceSummaryJson: true,
        primarySource: true,
        measuredShare: true,
        providerClassifiedShare: true,
        reconstructedShare: true,
        estimatedProxyShare: true,
        contextOnlyShare: true,
        nativeEventCount: true,
        hfEventCount: true,
        measurementCoverage: true,
        hardwareProfile: true,
        capabilityVersion: true,
        healthEligibility: true,
        provenanceMaturity: true,
        provenanceVersion: true,
      },
    });
    if (!row) return null;
    return readTripDrivingImpactProvenance(row);
  }
}

function parseBehaviorSummaryJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function provenanceFields(
  provenance: DrivingImpactSourceProvenance,
) {
  return {
    primarySource: provenance.primarySource,
    measuredShare: provenance.measuredShare,
    providerClassifiedShare: provenance.providerClassifiedShare,
    reconstructedShare: provenance.reconstructedShare,
    estimatedProxyShare: provenance.estimatedProxyShare,
    contextOnlyShare: provenance.contextOnlyShare,
    nativeEventCount: provenance.nativeEventCount,
    hfEventCount: provenance.hfEventCount,
    measurementCoverage: provenance.measurementCoverage,
    hardwareProfile: provenance.hardwareProfile,
    capabilityVersion: provenance.capabilityVersion,
    healthEligibility: provenance.healthEligibility,
    provenanceMaturity: provenance.provenanceMaturity,
    provenanceVersion: provenance.provenanceVersion,
  };
}

function rollingProvenanceFields(
  provenance: ReturnType<typeof mergeRollingProvenance>,
) {
  return {
    primarySource: provenance.primarySource,
    measuredShare: provenance.measuredShare,
    providerClassifiedShare: provenance.providerClassifiedShare,
    reconstructedShare: provenance.reconstructedShare,
    estimatedProxyShare: provenance.estimatedProxyShare,
    contextOnlyShare: provenance.contextOnlyShare,
    measurementCoverage: provenance.measurementCoverage,
    hardwareProfile: provenance.hardwareProfile,
    capabilityVersion: provenance.capabilityVersion,
    healthEligibility: provenance.healthEligibility,
    provenanceMaturity: provenance.provenanceMaturity,
    provenanceVersion: provenance.provenanceVersion,
  };
}
