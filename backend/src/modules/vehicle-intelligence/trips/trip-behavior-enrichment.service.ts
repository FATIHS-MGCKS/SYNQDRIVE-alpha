import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSegmentsService, type DimoFuelSummary } from '../../dimo/dimo-segments.service';
import {
  BehaviorEventCategory,
  BehaviorEventClassification,
  FuelType,
} from '@prisma/client';
import { preprocessHighFrequency, splitByGaps } from './hf-preprocessing';
import { detectAccelerationEvents, type AccelerationEvent } from './hf-acceleration';
import { detectBrakingEvents, type BrakingEvent } from './hf-braking';
import {
  detectAbuseEvents,
  computeAbuseScore,
  assessSignalAvailability,
  type AbuseEvent,
  type VehicleRpmConfig,
} from './hf-abuse';
import { getVehicleCapabilities } from '../vehicle-capabilities';
import { LteR1BehaviorEnrichmentService } from './lte-r1-behavior-enrichment.service';
import { summarizeEvTractionPowerFromHf, type EvTractionPowerTripSummary } from './hf-recuperation';
import { TripAssignmentService } from './trip-assignment.service';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import { MisuseCaseAggregatorService } from '../misuse-cases/misuse-case-aggregator.service';

export interface BehaviorEnrichmentResult {
  accelerationEvents: number;
  brakingEvents: number;
  abuseEvents: number;
  hardAccelerationCount: number;
  hardBrakingCount: number;
  abuseScore: number;
  totalEventsStored: number;
  fuelUsedLiters: number | null;
  avgConsumptionLPer100Km: number | null;
  fuelConfidence: 'high' | 'medium' | 'low' | null;
}

/**
 * Compute fuel-consumption enrichment from a DIMO fuel summary for the trip.
 *
 * Writes three canonical fields onto VehicleTrip:
 *   - fuelUsedLiters            : Liters consumed (delta of start→end absolute
 *                                 tank levels, clamped to >= 0).
 *   - avgConsumptionLPer100Km   : L per 100 km, when both liters and
 *                                 distanceKm are known and non-zero.
 *   - fuelConfidence            : DIMO sample-proximity confidence label.
 *
 * Exported for use by both HF (SMART5) and DIMO-Events (LTE_R1) paths so the
 * derivation is identical regardless of hardware.
 *
 * Fallback ladder (V4.6.46):
 *   1. Absolute-level delta     — direct liters, confidence = high/medium/low.
 *   2. Relative-% × tank cap.   — when absolute samples are missing but both
 *                                 start/end % are known and tankCapacityLiters
 *                                 is > 0.  Confidence = 'relative_fallback'.
 *   3. null                     — no usable data.  fuelConfidence still carries
 *                                 the raw status so ops can see why it's empty.
 */
function buildFuelTripUpdate(
  distanceKm: number | null,
  summary: DimoFuelSummary,
  tankCapacityLiters: number | null,
): {
  fuelUsedLiters: number | null;
  avgConsumptionLPer100Km: number | null;
  fuelConfidence: string | null;
} {
  if (summary.refuelDetected) {
    // A mid-trip refuel makes simple start-vs-end delta unreliable.  We still
    // record the confidence flag so ops can see why liters are null.
    return {
      fuelUsedLiters: null,
      avgConsumptionLPer100Km: null,
      fuelConfidence: 'refuel_detected',
    };
  }

  if (summary.fuelUsedLiters != null) {
    const liters = summary.fuelUsedLiters;
    const avg = distanceKm != null && distanceKm > 0 ? (liters / distanceKm) * 100 : null;
    return {
      fuelUsedLiters: liters,
      avgConsumptionLPer100Km: avg,
      fuelConfidence: summary.confidence,
    };
  }

  // Relative-% fallback: when DIMO returned only RelativeLevel samples (common
  // on LTE_R1 vehicles during short windows) and we know the tank capacity,
  // estimate liters from the percentage delta.  Flagged as 'relative_fallback'
  // so downstream UIs can label it as an estimate.
  const startRel = summary.startRelativePct;
  const endRel = summary.endRelativePct;
  if (
    startRel != null &&
    endRel != null &&
    tankCapacityLiters != null &&
    tankCapacityLiters > 0 &&
    summary.relativeSampleCount >= 2
  ) {
    const deltaPct = startRel - endRel;
    if (deltaPct >= 0 && deltaPct <= 100) {
      const liters = Math.round((deltaPct / 100) * tankCapacityLiters * 100) / 100;
      const avg = distanceKm != null && distanceKm > 0 ? (liters / distanceKm) * 100 : null;
      return {
        fuelUsedLiters: liters,
        avgConsumptionLPer100Km: avg,
        fuelConfidence: 'relative_fallback',
      };
    }
  }

  return {
    fuelUsedLiters: null,
    avgConsumptionLPer100Km: null,
    fuelConfidence: summary.confidence,
  };
}

/**
 * Fuel sampling is meaningless for battery-electric vehicles (no ICE tank).
 * Skip the GraphQL call entirely so we don't spend quota and don't log noise.
 */
function skipFuelForFuelType(fuelType: FuelType | null | undefined): boolean {
  return fuelType === FuelType.ELECTRIC;
}

const MIN_TRIP_DURATION_MS = 60_000;

@Injectable()
export class TripBehaviorEnrichmentService {
  private readonly logger = new Logger(TripBehaviorEnrichmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: DimoSegmentsService,
    private readonly lteR1: LteR1BehaviorEnrichmentService,
    private readonly tripAssignmentService: TripAssignmentService,
    private readonly misuseCaseAggregator: MisuseCaseAggregatorService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  async enrichTrip(tripId: string): Promise<BehaviorEnrichmentResult | null> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      include: {
        vehicle: {
          select: {
            id: true,
            organizationId: true,
            idleRpm: true,
            maxRpm: true,
            hardwareType: true,
            fuelType: true,
            tankCapacityLiters: true,
            dimoVehicle: { select: { tokenId: true } },
          },
        },
      },
    });

    if (!trip || !trip.vehicle?.dimoVehicle?.tokenId) {
      this.logger.warn(`Cannot enrich trip ${tripId}: missing vehicle or DIMO token`);
      return null;
    }

    // ── V3: Hardware-aware source routing ─────────────────────────────────────
    // Resolve capabilities from the vehicle's hardware type.
    const capabilities = getVehicleCapabilities(trip.vehicle.hardwareType ?? 'UNKNOWN');

    // LTE_R1 path: Driving Events come from DIMO Telemetry API Events (not HF).
    // We still run the HF pipeline for Abuse detection.
    if (!capabilities.useHfDrivingEvents) {
      return this.enrichTripLteR1(tripId, trip);
    }

    // SMART5 / UNKNOWN path: full HF-derived pipeline (existing V2 behavior).

    if (!trip.endTime) {
      this.logger.warn(`Cannot enrich trip ${tripId}: no endTime (still ongoing?)`);
      return null;
    }

    const durationMs = trip.endTime.getTime() - trip.startTime.getTime();
    if (durationMs < MIN_TRIP_DURATION_MS) {
      this.logger.debug(`Trip ${tripId} too short (${durationMs}ms) for HF enrichment`);
      return null;
    }

    const tokenId = trip.vehicle.dimoVehicle.tokenId;
    const vehicleId = trip.vehicleId;
    const organizationId = trip.vehicle.organizationId;

    const rpmConfig: Partial<VehicleRpmConfig> = {};
    if (trip.vehicle.idleRpm != null) rpmConfig.idleRpm = trip.vehicle.idleRpm;
    if (trip.vehicle.maxRpm != null) rpmConfig.maxRpm = trip.vehicle.maxRpm;

    this.logger.log(`HF enrichment starting for trip ${tripId} (${Math.round(durationMs / 60_000)}min)`);

    const rawReadings = await this.segments.fetchHighFrequency(
      tokenId,
      trip.startTime,
      trip.endTime,
    );

    if (rawReadings.length < 10) {
      this.logger.warn(`Trip ${tripId}: only ${rawReadings.length} HF points, skipping`);
      return null;
    }

    const cleaned = preprocessHighFrequency(rawReadings);
    if (cleaned.length < 5) {
      this.logger.warn(`Trip ${tripId}: only ${cleaned.length} clean points after preprocessing`);
      return null;
    }

    const segs = splitByGaps(cleaned);
    this.logger.debug(`Trip ${tripId}: ${cleaned.length} clean points in ${segs.length} segments`);

    // ── Signal availability (Fix I) ──────────────────────────────────────────
    // Assessed once across all segments so behaviorSummaryJson documents which
    // detectors were evaluable vs silently inactive due to missing signals.
    const signalAvail = assessSignalAvailability(segs);

    // ── EV Recuperation summary (uses raw readings for trapezoidal integration) ──
    let evTractionSummary: EvTractionPowerTripSummary | null = null;
    if (signalAvail.tractionBatteryPowerAvailable) {
      evTractionSummary = summarizeEvTractionPowerFromHf(rawReadings);
      this.logger.debug(
        `Trip ${tripId}: EV traction — regen ${evTractionSummary.regenEnergyKwh} kWh ` +
        `(${evTractionSummary.regenDurationSeconds}s), peak regen ${evTractionSummary.peakRegenKw} kW, ` +
        `peak discharge ${evTractionSummary.peakDischargeKw ?? 'n/a'} kW`,
      );
    }

    // ── Run detectors across all segments ────────────────────────────────────
    const allAccel: AccelerationEvent[] = [];
    const allBrake: BrakingEvent[] = [];
    const allAbuse: AbuseEvent[] = [];

    for (const seg of segs) {
      allAccel.push(...detectAccelerationEvents(seg));
      allBrake.push(...detectBrakingEvents(seg));
      allAbuse.push(...detectAbuseEvents(seg, rpmConfig));
    }

    // ── Build DB rows ─────────────────────────────────────────────────────────
    const accelRows = allAccel.map((e) => ({
      organizationId,
      vehicleId,
      tripId,
      eventCategory: BehaviorEventCategory.ACCELERATION,
      eventType: 'ACCELERATION',
      classification: mapClassification(e.classification),
      startedAt: e.startedAt,
      endedAt: e.endedAt,
      durationMs: e.durationMs,
      startSpeedKmh: e.startSpeedKmh,
      endSpeedKmh: e.endSpeedKmh,
      peakValue: e.peakAccelMs2,
      peakValueUnit: 'm/s²',
      peakG: e.peakAccelG,
      maxThrottlePos: e.maxThrottlePos,
      maxEngineRpm: e.maxEngineRpm ?? null,
      maxCoolantTemp: null as number | null,
      // Rich metadata (Fix C — acceleration events no longer persist empty {})
      metadataJson: {
        deltaKmh: e.deltaKmh,
        sampleCount: e.sampleCount,
        mergedCount: (e as any).mergedCount ?? 1,
        startSpeedBand: speedBand(e.startSpeedKmh),
      } as any,
    }));

    const brakeRows = allBrake.map((e) => ({
      organizationId,
      vehicleId,
      tripId,
      eventCategory: BehaviorEventCategory.BRAKING,
      eventType: 'BRAKING',
      classification: mapClassification(e.classification),
      startedAt: e.startedAt,
      endedAt: e.endedAt,
      durationMs: e.durationMs,
      startSpeedKmh: e.startSpeedKmh,
      endSpeedKmh: e.endSpeedKmh,
      peakValue: e.peakDecelMs2,
      peakValueUnit: 'm/s²',
      peakG: e.peakDecelG,
      maxThrottlePos: null as number | null,
      maxEngineRpm: null as number | null,
      maxCoolantTemp: null as number | null,
      // Rich metadata (Fix D — braking events get diagnostic fields)
      metadataJson: {
        intensity: e.intensity,
        deltaKmh: e.deltaKmh,
        sampleCount: e.sampleCount,
        highSpeedStart: e.highSpeedStart,
      } as any,
    }));

    const abuseRows = allAbuse.map((e) => ({
      organizationId,
      vehicleId,
      tripId,
      eventCategory: BehaviorEventCategory.ABUSE,
      eventType: e.eventType,
      classification: mapAbuseSeverity(e.severity),
      startedAt: e.startedAt,
      endedAt: e.endedAt,
      durationMs: e.durationMs,
      startSpeedKmh: e.startSpeedKmh,
      endSpeedKmh: e.endSpeedKmh,
      peakValue: e.peakValue,
      peakValueUnit: e.peakValueUnit,
      peakG: null as number | null,
      maxThrottlePos: e.maxThrottlePos,
      maxEngineRpm: e.maxRpm ?? null,
      maxCoolantTemp: e.maxCoolantTemp,
      metadataJson: e.metadata as any,
    }));

    const allRows = [...accelRows, ...brakeRows, ...abuseRows];

    // ── Compute summary counters ──────────────────────────────────────────────
    const hardAccel = allAccel.filter(
      (e) => e.classification === 'HARD' || e.classification === 'EXTREME',
    ).length;
    const hardBrake = allBrake.filter(
      (e) => e.classification === 'HARD' || e.classification === 'EXTREME',
    ).length;
    const fullBraking = allAbuse.filter((e) => e.eventType === 'FULL_BRAKING').length;
    const possibleImpact = allAbuse.filter((e) => e.eventType === 'POSSIBLE_IMPACT').length;
    const kickdownCount = allAbuse.filter((e) => e.eventType === 'KICKDOWN').length;
    const coldEngineAbuse = allAbuse.filter(
      (e) => e.eventType === 'COLD_ENGINE_HIGH_RPM' || e.eventType === 'COLD_ENGINE_FULL_THROTTLE',
    ).length;
    const longIdle = allAbuse.filter((e) => e.eventType === 'LONG_IDLE').length;

    // Deterministic abuse score (Fix J)
    const abuseScore = computeAbuseScore(allAbuse);
    const hfCanonicalCounterTotal =
      allAccel.length + allBrake.length + allAbuse.length;
    if (allRows.length > 0 && hfCanonicalCounterTotal === 0) {
      this.observeCounterAnomaly('rows_present_but_zero_counters', 'hf');
    }

    // ── Fuel-consumption summary (both hardware paths share this derivation) ──
    // Fetched after HF processing so we do not add latency to the detector
    // hot-path; if the query fails, we log and persist null values — the trip
    // is already safely persisted and other counters are independent.
    //
    // EV gating (V4.6.46): skip the DIMO fuel query entirely for battery-
    // electric vehicles — they have no ICE tank signal and the query would
    // just burn DIMO quota and log false warnings.
    let fuelUpdate: {
      fuelUsedLiters: number | null;
      avgConsumptionLPer100Km: number | null;
      fuelConfidence: string | null;
    } = { fuelUsedLiters: null, avgConsumptionLPer100Km: null, fuelConfidence: null };
    if (!skipFuelForFuelType(trip.vehicle.fuelType)) {
      const fuelSummary = await this.segments.fetchFuelSummary(
        tokenId,
        trip.startTime,
        trip.endTime,
      );
      fuelUpdate = buildFuelTripUpdate(
        trip.distanceKm,
        fuelSummary,
        trip.vehicle.tankCapacityLiters,
      );
      this.logger.debug(
        `HF enrich trip ${tripId}: fuel liters=${fuelUpdate.fuelUsedLiters}, ` +
          `L/100km=${fuelUpdate.avgConsumptionLPer100Km}, confidence=${fuelUpdate.fuelConfidence}, ` +
          `refuelDetected=${fuelSummary.refuelDetected}, absSamples=${fuelSummary.absoluteSampleCount}, ` +
          `relSamples=${fuelSummary.relativeSampleCount}`,
      );
    } else {
      this.logger.debug(`HF enrich trip ${tripId}: EV — fuel summary skipped`);
    }

    // ── Fix A: Transaction-safe persistence ──────────────────────────────────
    // The delete + createMany + trip.update are wrapped in a single Prisma
    // transaction.  If any step fails, all are rolled back — the trip cannot
    // be left in a partially rewritten state.  Idempotent re-enrichment
    // behavior is preserved: a second run deletes the previous events and
    // recreates them, atomically.
    await this.prisma.$transaction(async (tx) => {
      await tx.tripBehaviorEvent.deleteMany({ where: { tripId } });

      if (allRows.length > 0) {
        await tx.tripBehaviorEvent.createMany({ data: allRows });
      }

      await tx.vehicleTrip.update({
        where: { id: tripId },
        data: {
          accelerationEventCount: allAccel.length,
          // Legacy compatibility: this field was historically overloaded.
          // Canonical readers should use totalBrakingEvents + hardBrakingEvents.
          brakingEventCount: hardBrake + fullBraking,
          abuseEventCount: allAbuse.length,

          // ── Canonical HF counters (Fix B) ──
          hardAccelerationCount: hardAccel,
          hardBrakingCount: hardBrake,
          totalAccelerationEvents: allAccel.length,
          hardAccelerationEvents: hardAccel,
          totalBrakingEvents: allBrake.length + fullBraking,
          hardBrakingEvents: hardBrake,
          fullBrakingEvents: fullBraking,
          corneringEvents: 0,
          abuseEvents: allAbuse.length,

          // ── Legacy compatibility aliases (Fix B) ──
          // harshAccelCount and harshBrakeCount are DEPRECATED aliases for the canonical
          // HF-derived counters above.  They are mirrored here so existing queries
          // that still read harsh* fields continue to work.  Do NOT write new queries
          // against these fields.  They will be removed in a future migration.
          harshAccelCount: hardAccel,
          harshBrakeCount: hardBrake,

          fullBrakingCount: fullBraking,
          speedingEvents: 0,
          possibleImpactCount: possibleImpact,
          kickdownCount,
          coldEngineAbuseCount: coldEngineAbuse,
          longIdleCount: longIdle,
          harshCornerCount: 0,

          // Deterministic abuse score (Fix J)
          abuseScore,

          // ── Fuel consumption (shared derivation across hardware paths) ──
          // Fix V4.6.46: conditional spread so a null post-trip summary does
          // NOT overwrite a valid legacy FSM-derived value written earlier in
          // TripDetectionOrchestrationService.processActiveTick.  The confidence
          // label is always refreshed so ops can see the latest sampling
          // status.
          ...(fuelUpdate.fuelUsedLiters != null && {
            fuelUsedLiters: fuelUpdate.fuelUsedLiters,
          }),
          ...(fuelUpdate.avgConsumptionLPer100Km != null && {
            avgConsumptionLPer100Km: fuelUpdate.avgConsumptionLPer100Km,
          }),
          fuelConfidence: fuelUpdate.fuelConfidence,

          behaviorEnrichedAt: new Date(),

          // Signal-aware behavior summary (Fix I + B)
          behaviorSummaryJson: {
            hfPointsTotal: rawReadings.length,
            hfPointsCleaned: cleaned.length,
            segments: segs.length,
            accelTotal: allAccel.length,
            brakeTotal: allBrake.length,
            abuseTotal: allAbuse.length,
            abuseScore,
            // Signal availability — distinguishes "no event" from "detector not evaluable"
            coolantAvailable: signalAvail.coolantAvailable,
            rpmAvailable: signalAvail.rpmAvailable,
            throttleAvailable: signalAvail.throttleAvailable,
            loadAvailable: signalAvail.loadAvailable,
            tractionBatteryPowerAvailable: signalAvail.tractionBatteryPowerAvailable,
            detectorCoverage: {
              coldEngineHighRpm: signalAvail.coolantAvailable && signalAvail.rpmAvailable,
              coldEngineFullThrottle: signalAvail.coolantAvailable && signalAvail.throttleAvailable,
              overheating: signalAvail.coolantAvailable,
              engineRevInIdle: signalAvail.rpmAvailable,
              highRpmConstant: signalAvail.rpmAvailable,
              kickdown: signalAvail.throttleAvailable,
              launchLikeStart: signalAvail.rpmAvailable && signalAvail.throttleAvailable,
              engineShutdown: signalAvail.rpmAvailable,
              longIdle: signalAvail.rpmAvailable,
              fullBrakingAndImpact: true,
            },
            evTractionPower: evTractionSummary ?? null,
            rpmConfig: {
              idleRpm: rpmConfig.idleRpm ?? 800,
              maxRpm: rpmConfig.maxRpm ?? 6500,
            },
          } as any,
        },
      });
    });
    await this.tripAssignmentService.applyAssignmentToTrip(tripId);
    void this.misuseCaseAggregator.evaluateTrip(tripId).catch((err: Error) => {
      this.logger.warn(
        `Misuse case aggregation failed for trip ${tripId}: ${err?.message ?? err}`,
      );
    });

    this.logger.log(
      `HF enrichment complete for trip ${tripId}: ` +
      `${allAccel.length} accel, ${allBrake.length} brake, ${allAbuse.length} abuse events, ` +
      `abuseScore=${abuseScore}`,
    );

    return {
      accelerationEvents: allAccel.length,
      brakingEvents: allBrake.length,
      abuseEvents: allAbuse.length,
      hardAccelerationCount: hardAccel,
      hardBrakingCount: hardBrake,
      abuseScore,
      totalEventsStored: allRows.length,
      fuelUsedLiters: fuelUpdate.fuelUsedLiters,
      avgConsumptionLPer100Km: fuelUpdate.avgConsumptionLPer100Km,
      fuelConfidence: (fuelUpdate.fuelConfidence as 'high' | 'medium' | 'low' | null) ?? null,
    };
  }

  // ── V3 LTE_R1 enrichment path ──────────────────────────────────────────────
  // For LTE_R1 vehicles:
  //   1. Ingest Driving Events from DIMO Telemetry API (via LteR1BehaviorEnrichmentService)
  //   2. Still run HF pipeline for Abuse detection only (no accel/braking event generation)
  //   3. Update VehicleTrip counters from both sources
  private async enrichTripLteR1(
    tripId: string,
    trip: {
      startTime: Date;
      endTime: Date | null;
      vehicleId: string;
      distanceKm: number | null;
      vehicle: {
        organizationId: string;
        idleRpm: number | null;
        maxRpm: number | null;
        hardwareType: import('@prisma/client').HardwareType;
        fuelType: FuelType | null;
        tankCapacityLiters: number | null;
        dimoVehicle: { tokenId: number | null } | null;
      };
    },
  ): Promise<BehaviorEnrichmentResult | null> {
    if (!trip.endTime) return null;

    const tokenId = trip.vehicle.dimoVehicle?.tokenId;
    if (!tokenId) return null;
    const vehicleId = trip.vehicleId;
    const organizationId = trip.vehicle.organizationId;

    const rpmConfig: Partial<VehicleRpmConfig> = {};
    if (trip.vehicle.idleRpm != null) rpmConfig.idleRpm = trip.vehicle.idleRpm;
    if (trip.vehicle.maxRpm != null) rpmConfig.maxRpm = trip.vehicle.maxRpm;

    this.logger.log(`LTE_R1 enrichment starting for trip ${tripId}`);

    // ── 1. Ingest Driving Events from DIMO Telemetry API ─────────────────────
    const drivingResult = await this.lteR1.enrichTrip(tripId);

    // ── 2. HF data fetch for abuse-only pipeline ──────────────────────────────
    const rawReadings = await this.segments.fetchHighFrequency(tokenId, trip.startTime, trip.endTime);

    let abuseScore = 0;
    let allAbuse: AbuseEvent[] = [];
    const abuseRows: any[] = [];
    let hfPointsCleaned = 0;
    let segmentCount = 0;
    let hfInsufficientForAbuse = rawReadings.length < 10;
    const defaultSignalAvail: import('./hf-abuse').SignalAvailability = {
      coolantAvailable: false,
      rpmAvailable: false,
      throttleAvailable: false,
      loadAvailable: false,
      tractionBatteryPowerAvailable: false,
    };
    let signalAvail = defaultSignalAvail;
    let evTractionSummaryLte: EvTractionPowerTripSummary | null = null;

    if (rawReadings.length >= 10) {
      const cleaned = preprocessHighFrequency(rawReadings);
      hfPointsCleaned = cleaned.length;
      if (cleaned.length >= 5) {
        const segs = splitByGaps(cleaned);
        segmentCount = segs.length;
        signalAvail = assessSignalAvailability(segs);
        hfInsufficientForAbuse = false;

        if (signalAvail.tractionBatteryPowerAvailable) {
          evTractionSummaryLte = summarizeEvTractionPowerFromHf(rawReadings);
        }

        for (const seg of segs) {
          allAbuse.push(...detectAbuseEvents(seg, rpmConfig));
        }
        abuseScore = computeAbuseScore(allAbuse);

        for (const e of allAbuse) {
          abuseRows.push({
            organizationId,
            vehicleId,
            tripId,
            eventCategory: BehaviorEventCategory.ABUSE,
            eventType: e.eventType,
            classification: mapAbuseSeverity(e.severity),
            startedAt: e.startedAt,
            endedAt: e.endedAt,
            durationMs: e.durationMs,
            startSpeedKmh: e.startSpeedKmh,
            endSpeedKmh: e.endSpeedKmh,
            peakValue: e.peakValue,
            peakValueUnit: e.peakValueUnit,
            peakG: null as number | null,
            maxThrottlePos: e.maxThrottlePos,
            maxEngineRpm: e.maxRpm ?? null,
            maxCoolantTemp: e.maxCoolantTemp,
            metadataJson: { ...e.metadata, hardwareSource: 'LTE_R1' } as any,
          });
        }
      } else {
        hfInsufficientForAbuse = true;
      }
    }

    const coldEngineAbuse = allAbuse.filter(
      (e) => e.eventType === 'COLD_ENGINE_HIGH_RPM' || e.eventType === 'COLD_ENGINE_FULL_THROTTLE',
    ).length;
    const fullBraking = allAbuse.filter((e) => e.eventType === 'FULL_BRAKING').length;
    const possibleImpact = allAbuse.filter((e) => e.eventType === 'POSSIBLE_IMPACT').length;
    const kickdownCount = allAbuse.filter((e) => e.eventType === 'KICKDOWN').length;
    const longIdle = allAbuse.filter((e) => e.eventType === 'LONG_IDLE').length;
    const lteAccelerationTotal = drivingResult?.harshAccelerationCount ?? 0;
    const lteBrakingTotal =
      (drivingResult?.harshBrakingCount ?? 0) + (drivingResult?.extremeBrakingCount ?? 0) + fullBraking;
    const lteCorneringTotal = drivingResult?.harshCorneringCount ?? 0;
    // DIMO-reported `behavior.extremeBraking` events count as abuse on the
    // LTE_R1 path so the Abuse Detection KPI stays populated even when HF
    // data is too sparse to derive abuse events locally.
    const dimoAbuseContribution = drivingResult?.extremeBrakingCount ?? 0;
    const combinedAbuseTotal = allAbuse.length + dimoAbuseContribution;
    const lteCanonicalCounterTotal =
      lteAccelerationTotal + lteBrakingTotal + lteCorneringTotal + combinedAbuseTotal;
    const lteRowsObserved = (drivingResult?.drivingEventsIngested ?? 0) + abuseRows.length;
    if (lteRowsObserved > 0 && lteCanonicalCounterTotal === 0) {
      this.observeCounterAnomaly('rows_present_but_zero_counters', 'lte_r1');
    }

    // ── Fuel-consumption summary (shared derivation across hardware paths) ──
    // EV gating (V4.6.46): skip the DIMO fuel query for battery-electric cars.
    let fuelUpdate: {
      fuelUsedLiters: number | null;
      avgConsumptionLPer100Km: number | null;
      fuelConfidence: string | null;
    } = { fuelUsedLiters: null, avgConsumptionLPer100Km: null, fuelConfidence: null };
    if (!skipFuelForFuelType(trip.vehicle.fuelType)) {
      const fuelSummary = await this.segments.fetchFuelSummary(
        tokenId,
        trip.startTime,
        trip.endTime,
      );
      fuelUpdate = buildFuelTripUpdate(
        trip.distanceKm,
        fuelSummary,
        trip.vehicle.tankCapacityLiters,
      );
      this.logger.debug(
        `LTE_R1 enrich trip ${tripId}: fuel liters=${fuelUpdate.fuelUsedLiters}, ` +
          `L/100km=${fuelUpdate.avgConsumptionLPer100Km}, confidence=${fuelUpdate.fuelConfidence}, ` +
          `refuelDetected=${fuelSummary.refuelDetected}, absSamples=${fuelSummary.absoluteSampleCount}, ` +
          `relSamples=${fuelSummary.relativeSampleCount}`,
      );
    } else {
      this.logger.debug(`LTE_R1 enrich trip ${tripId}: EV — fuel summary skipped`);
    }

    // Always persist abuse slice in one transaction (transaction-safe, idempotent for TripBehaviorEvent).
    // Canonical hard* counters were already set by LteR1BehaviorEnrichmentService and are not touched here.
    await this.prisma.$transaction(async (tx) => {
      await tx.tripBehaviorEvent.deleteMany({ where: { tripId } });
      if (abuseRows.length > 0) {
        await tx.tripBehaviorEvent.createMany({ data: abuseRows });
      }
      await tx.vehicleTrip.update({
        where: { id: tripId },
        data: {
          totalAccelerationEvents: drivingResult?.harshAccelerationCount ?? 0,
          hardAccelerationEvents: drivingResult?.harshAccelerationCount ?? 0,
          totalBrakingEvents:
            (drivingResult?.harshBrakingCount ?? 0) +
            (drivingResult?.extremeBrakingCount ?? 0) +
            fullBraking,
          hardBrakingEvents:
            (drivingResult?.harshBrakingCount ?? 0) +
            (drivingResult?.extremeBrakingCount ?? 0),
          fullBrakingEvents: fullBraking,
          brakingEventCount:
            (drivingResult?.harshBrakingCount ?? 0) +
            (drivingResult?.extremeBrakingCount ?? 0) +
            fullBraking,
          hardBrakingCount:
            (drivingResult?.harshBrakingCount ?? 0) +
            (drivingResult?.extremeBrakingCount ?? 0),
          hardAccelerationCount: drivingResult?.harshAccelerationCount ?? 0,
          corneringEvents: drivingResult?.harshCorneringCount ?? 0,
          abuseEvents: combinedAbuseTotal,
          abuseEventCount: combinedAbuseTotal,
          fullBrakingCount: fullBraking,
          speedingEvents: 0,
          possibleImpactCount: possibleImpact,
          kickdownCount,
          coldEngineAbuseCount: coldEngineAbuse,
          longIdleCount: longIdle,
          abuseScore,
          // ── Fuel consumption (shared derivation across hardware paths) ──
          // Fix V4.6.46: conditional spread prevents a null post-trip summary
          // from clobbering a valid legacy FSM-derived value.
          ...(fuelUpdate.fuelUsedLiters != null && {
            fuelUsedLiters: fuelUpdate.fuelUsedLiters,
          }),
          ...(fuelUpdate.avgConsumptionLPer100Km != null && {
            avgConsumptionLPer100Km: fuelUpdate.avgConsumptionLPer100Km,
          }),
          fuelConfidence: fuelUpdate.fuelConfidence,
          behaviorEnrichedAt: new Date(),
          behaviorSummaryJson: {
            hfPointsTotal: rawReadings.length,
            hfPointsCleaned,
            segments: segmentCount,
            abuseTotal: allAbuse.length,
            abuseScore,
            drivingEventsSource: 'TELEMETRY_EVENTS',
            hfInsufficientForAbuse,
            coolantAvailable: signalAvail.coolantAvailable,
            rpmAvailable: signalAvail.rpmAvailable,
            throttleAvailable: signalAvail.throttleAvailable,
            loadAvailable: signalAvail.loadAvailable,
            tractionBatteryPowerAvailable: signalAvail.tractionBatteryPowerAvailable,
            evTractionPower: evTractionSummaryLte ?? null,
            rpmConfig: { idleRpm: rpmConfig.idleRpm ?? 800, maxRpm: rpmConfig.maxRpm ?? 6500 },
          } as any,
        },
      });
    });
    await this.tripAssignmentService.applyAssignmentToTrip(tripId);
    void this.misuseCaseAggregator.evaluateTrip(tripId).catch((err: Error) => {
      this.logger.warn(
        `Misuse case aggregation failed for trip ${tripId}: ${err?.message ?? err}`,
      );
    });

    this.logger.log(
      `LTE_R1 enrichment complete for trip ${tripId}: ` +
      `${drivingResult?.drivingEventsIngested ?? 0} driving events, ` +
      `${allAbuse.length} abuse events, abuseScore=${abuseScore}`,
    );

    return {
      accelerationEvents: 0,
      brakingEvents: 0,
      abuseEvents: combinedAbuseTotal,
      hardAccelerationCount: drivingResult?.harshAccelerationCount ?? 0,
      hardBrakingCount: (drivingResult?.harshBrakingCount ?? 0) + (drivingResult?.extremeBrakingCount ?? 0),
      abuseScore,
      totalEventsStored: abuseRows.length + (drivingResult?.drivingEventsIngested ?? 0),
      fuelUsedLiters: fuelUpdate.fuelUsedLiters,
      avgConsumptionLPer100Km: fuelUpdate.avgConsumptionLPer100Km,
      fuelConfidence: (fuelUpdate.fuelConfidence as 'high' | 'medium' | 'low' | null) ?? null,
    };
  }

  private observeCounterAnomaly(
    anomalyType: 'rows_present_but_zero_counters',
    source: 'hf' | 'lte_r1',
  ): void {
    this.tripMetrics?.tripCounterAnomalies.inc({
      anomaly_type: anomalyType,
      source,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

function mapClassification(c: 'LIGHT' | 'MODERATE' | 'HARD' | 'EXTREME'): BehaviorEventClassification {
  switch (c) {
    case 'LIGHT':    return BehaviorEventClassification.LIGHT;
    case 'MODERATE': return BehaviorEventClassification.MODERATE;
    case 'HARD':     return BehaviorEventClassification.HARD;
    case 'EXTREME':  return BehaviorEventClassification.EXTREME;
  }
}

function mapAbuseSeverity(s: 'WARNING' | 'SEVERE' | 'CRITICAL'): BehaviorEventClassification {
  switch (s) {
    case 'WARNING':  return BehaviorEventClassification.WARNING;
    case 'SEVERE':   return BehaviorEventClassification.SEVERE;
    case 'CRITICAL': return BehaviorEventClassification.CRITICAL;
  }
}

/** Descriptive speed band for metadata — low-cost diagnostic context. */
function speedBand(speedKmh: number): string {
  if (speedKmh < 20) return 'urban_slow';
  if (speedKmh < 50) return 'urban';
  if (speedKmh < 90) return 'rural';
  if (speedKmh < 130) return 'highway';
  return 'high_speed';
}
