/**
 * SynqDrive V3 — LTE_R1 Behavior Enrichment Service
 *
 * Handles the Driving Event ingestion path for vehicles with hardware type LTE_R1.
 *
 * Architecture:
 *   1. Fetch native harsh-event signals from DIMO Telemetry API via
 *      DimoSegmentsService.fetchDrivingEvents().
 *   2. Map to SynqDrive's normalized DrivingEvent model (source = TELEMETRY_EVENTS).
 *   3. Optionally enrich events with HF-derived engine context (cold-engine badge,
 *      RPM context) from the HF pipeline data fetched alongside.
 *   4. Persist events (transaction-safe, idempotent) and update VehicleTrip counters.
 *
 * Abuse detection (FULL_BRAKING, POSSIBLE_IMPACT, RPM-based detectors, etc.) is NOT
 * handled here — it remains in TripBehaviorEnrichmentService using the shared HF
 * pipeline for BOTH LTE_R1 and SMART5.
 *
 * Counter mapping so Driving Impact consumes consistent fields:
 *   HARSH_BRAKING + EXTREME_BRAKING → hardBrakingCount (canonical)
 *   HARSH_ACCELERATION              → hardAccelerationCount (canonical)
 *   Both are also mirrored to deprecated harsh* aliases.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DimoSegmentsService,
  type DimoVehicleEventRecord,
} from '../../dimo/dimo-segments.service';
import { DrivingEventType, DrivingEventSource, DimoBrakingEventIntakeStatus } from '@prisma/client';
import { preprocessHighFrequency, type CleanHfPoint } from './hf-preprocessing';
import { DrivingEventContextJobService } from '../event-context/driving-event-context-job.service';
import { DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION } from '../driving-analysis-init/driving-analysis-init.types';
import {
  assessZeroNativeEventsConduct,
  mapDimoNativeDrivingEvent,
  resolveDimoNativeEventSeverity,
  countNativeAccelerationEvents,
  DimoNativeDrivingEventPersistenceService,
  type DimoNativeDrivingEventMapping,
  type DimoNativeEventClassification,
  type ZeroNativeEventsConductAssessment,
} from '../dimo-native-driving-events';
import { VehicleDrivingCapabilityResolverService } from '../driving-capability/vehicle-driving-capability-resolver.service';
import { DRIVING_CAPABILITY_PROVIDER } from '../driving-capability/vehicle-driving-capability.types';
import { DimoBrakingEventIntakeService } from '../brakes/dimo-braking-event-intake.service';
import { BrakingEventLedgerService } from '../brakes/braking-event-ledger.service';
import {
  assessDimoBrakingCapability,
  parseDimoBrakingSample,
} from '../brakes/dimo-braking-event-intake.domain';
import { buildDimoProviderEventId, parseDimoCounterValue } from '../../dimo/dimo-event-identity';

// ── Cold-engine badge threshold ────────────────────────────────────────────────
// Events occurring when coolant < this value get a coldEngineContext badge.
const COLD_ENGINE_TEMP_C = 60;

// Lookup window for HF context matching (milliseconds)
const HF_CONTEXT_WINDOW_MS = 5_000;
const MIN_TRIP_DURATION_MS = 60_000;

/** @deprecated Import from `dimo-native-driving-events` — kept for existing spec imports. */
export type NativeEventClassification = DimoNativeEventClassification;

/** @deprecated Import `DimoNativeDrivingEventMapping` from `dimo-native-driving-events`. */
export interface MappedDimoEvent {
  eventType: DrivingEventType;
  classification: NativeEventClassification;
}

/** @deprecated Use `mapDimoNativeDrivingEvent` from `dimo-native-driving-events`. */
export function mapDimoEventName(raw: string): MappedDimoEvent | null {
  const mapped = mapDimoNativeDrivingEvent(raw);
  if (!mapped.isKnownMapping) return null;
  return {
    eventType: mapped.canonicalEventType,
    classification: mapped.classification,
  };
}

/** @deprecated Use `resolveDimoNativeEventSeverity` from `dimo-native-driving-events`. */
export function resolveNativeSeverity(
  eventType: DrivingEventType,
  classification: NativeEventClassification,
): number {
  return resolveDimoNativeEventSeverity(eventType, classification);
}

interface EventCounters {
  harshBraking: number;
  extremeBraking: number;
  harshAcceleration: number;
  extremeAcceleration: number;
  harshCornering: number;
  safetyCollision: number;
  unmapped: number;
}

interface LteR1EnrichmentResult {
  drivingEventsIngested: number;
  harshBrakingCount: number;
  extremeBrakingCount: number;
  harshAccelerationCount: number;
  harshCorneringCount: number;
  coldEngineAnnotations: number;
  zeroNativeEventsConduct: ZeroNativeEventsConductAssessment;
}

@Injectable()
export class LteR1BehaviorEnrichmentService {
  private readonly logger = new Logger(LteR1BehaviorEnrichmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: DimoSegmentsService,
    private readonly contextJobs: DrivingEventContextJobService,
    private readonly capabilityResolver: VehicleDrivingCapabilityResolverService,
    private readonly nativeEventPersistence: DimoNativeDrivingEventPersistenceService,
    private readonly brakingIntake: DimoBrakingEventIntakeService,
    private readonly brakingLedger: BrakingEventLedgerService,
  ) {}

  /**
   * Ingest, enrich, and persist Driving Events for an LTE_R1 vehicle trip.
   *
   * Returns enrichment results, or null if the trip cannot be processed
   * (missing DIMO token, no endTime, etc.).
   */
  async enrichTrip(tripId: string): Promise<LteR1EnrichmentResult | null> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        vehicleId: true,
        startTime: true,
        endTime: true,
        vehicle: {
          select: {
            organizationId: true,
            hardwareType: true,
            fuelType: true,
            dimoVehicle: { select: { tokenId: true } },
          },
        },
      },
    });

    if (!trip || !trip.vehicle?.dimoVehicle?.tokenId) {
      this.logger.warn(`LTE_R1 enrich: trip ${tripId} missing vehicle or DIMO token`);
      return null;
    }
    if (!trip.endTime) {
      this.logger.warn(`LTE_R1 enrich: trip ${tripId} has no endTime — skipping`);
      return null;
    }

    const durationMs = trip.endTime.getTime() - trip.startTime.getTime();
    if (durationMs < MIN_TRIP_DURATION_MS) {
      this.logger.debug(`LTE_R1 enrich: trip ${tripId} too short (${durationMs}ms) — skipping`);
      return null;
    }

    const tokenId = trip.vehicle.dimoVehicle.tokenId;
    const vehicleId = trip.vehicleId;
    const organizationId = trip.vehicle.organizationId;
    const hardwareType = trip.vehicle.hardwareType ?? 'LTE_R1';

    const eventDataSummary = await this.brakingIntake.fetchEventDataSummary(tokenId);
    const capability = assessDimoBrakingCapability({
      hardwareType,
      provider: 'DIMO',
      eventDataSummary,
    });
    if (!capability.allowed) {
      this.logger.warn(
        `LTE_R1 enrich: trip ${tripId} skipped native braking intake — ${capability.reason}`,
      );
      return null;
    }

    // ── 1. Fetch native DIMO driving event signals (paginated + retried) ─────
    const nativeSamples = await this.brakingIntake.fetchDrivingEventsPaginated(
      tokenId,
      trip.startTime,
      trip.endTime,
    );
    this.logger.debug(`LTE_R1 enrich trip ${tripId}: ${nativeSamples.length} DIMO event samples`);

    await this.brakingIntake.ingestBrakingBatch({
      tokenId,
      vehicleId,
      organizationId,
      hardwareType,
      tripId,
      samples: nativeSamples,
      eventDataSummary,
    });

    // ── 2. Fetch HF data for engine context enrichment ───────────────────────
    const hfContext = await this.buildHfContextMap(tokenId, trip.startTime, trip.endTime, tripId);

    // ── 3. Map to normalized driving events ─────────────────────────────────
    const normalized = this.mapToNormalizedEvents(
      nativeSamples,
      vehicleId,
      organizationId,
      tripId,
      hfContext,
      tokenId,
    );
    const counters = this.countByType(
      normalized.map((e) => ({
        eventType: e.eventType,
        metadataJson: { classification: e.classification },
      })),
    );
    const coldEngineAnnotations = normalized.filter((e) => e.coldEngineContext).length;
    const nativeCapability = await this.resolveNativeCapabilityContext(
      organizationId,
      vehicleId,
      trip.vehicle.fuelType,
    );
    const zeroNativeEventsConduct = assessZeroNativeEventsConduct({
      ...nativeCapability,
      nativeQuerySucceeded: true,
      nativeEventCount: normalized.length,
    });

    const tripEndTime = trip.endTime;

    // ── 4. Persist events (fingerprint upsert — identity preserved on reprocess) ─
    await this.prisma.$transaction(async (tx) => {
      await this.nativeEventPersistence.upsertNativeEvents(
        normalized.map((e) => ({
          organizationId: e.organizationId,
          vehicleId: e.vehicleId,
          providerEventName: e.rawName,
          providerSourceId: e.dimoSource,
          durationNs: e.durationNs,
          metadataJson: e.metadataJson,
          recordedAt: e.recordedAt,
          eventType: e.eventType,
          classification: e.classification,
          severity: e.severity,
          speedKmh: e.speedKmh,
          durationMs: e.durationMs,
          mapping: e.mapping,
          enrichmentMetadata: {
            coldEngineContext: e.coldEngineContext,
            coolantC: e.contextCoolantC,
            rpm: e.contextRpm,
            throttlePct: e.contextThrottlePct,
            hardwareSource: 'LTE_R1',
          },
        })),
        { id: tripId, startTime: trip.startTime, endTime: tripEndTime },
        tx,
      );

      await this.nativeEventPersistence.reconcileUnassignedEvents(
        organizationId,
        vehicleId,
        tx,
      );

      const tripEvents = await tx.drivingEvent.findMany({
        where: {
          tripId,
          source: DrivingEventSource.TELEMETRY_EVENTS,
        },
        select: { eventType: true, metadataJson: true },
      });
      const tripCounters = this.countByType(tripEvents);
      const hardBrakingTrip = tripCounters.harshBraking + tripCounters.extremeBraking;
      const hardAccelTrip = tripCounters.harshAcceleration + tripCounters.extremeAcceleration;
      const abuseFromDimo = tripCounters.extremeBraking;

      await tx.vehicleTrip.update({
        where: { id: tripId },
        data: {
          hardBrakingCount: hardBrakingTrip,
          hardAccelerationCount: hardAccelTrip,
          totalAccelerationEvents: tripCounters.harshAcceleration + tripCounters.extremeAcceleration,
          hardAccelerationEvents: hardAccelTrip,
          totalBrakingEvents: tripCounters.harshBraking + tripCounters.extremeBraking,
          hardBrakingEvents: hardBrakingTrip,
          fullBrakingEvents: 0,
          corneringEvents: tripCounters.harshCornering,
          abuseEvents: abuseFromDimo,
          speedingEvents: 0,
          harshBrakeCount: hardBrakingTrip,
          harshAccelCount: hardAccelTrip,
          harshCornerCount: tripCounters.harshCornering,
          brakingEventCount: tripCounters.harshBraking + tripCounters.extremeBraking,
          accelerationEventCount: tripCounters.harshAcceleration + tripCounters.extremeAcceleration,
          behaviorEnrichedAt: new Date(),
        },
      });
    });

    await this.linkBrakingIntakeRows(tripId);
    await this.brakingLedger.reconcileTrip(tripId);

    this.logger.log(
      `LTE_R1 enrich done for trip ${tripId}: ${normalized.length} events ` +
      `(harsh brake=${counters.harshBraking}, extreme brake=${counters.extremeBraking}, ` +
      `harsh accel=${counters.harshAcceleration}, cold-engine=${coldEngineAnnotations})`,
    );

    // ── 5. Schedule per-event context enrichment jobs (non-blocking, P26) ─────
    await this.scheduleNativeEventContextJobs(tripId, trip.vehicleId, organizationId, normalized.length);

    return {
      drivingEventsIngested: normalized.length,
      harshBrakingCount: counters.harshBraking,
      extremeBrakingCount: counters.extremeBraking,
      harshAccelerationCount: counters.harshAcceleration + counters.extremeAcceleration,
      harshCorneringCount: counters.harshCornering,
      coldEngineAnnotations,
      zeroNativeEventsConduct,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async resolveNativeCapabilityContext(
    organizationId: string,
    vehicleId: string,
    fuelType: string | null,
  ): Promise<Pick<
    import('../dimo-native-driving-events').NativeEventsCapabilityContext,
    'nativeBehaviorSupported' | 'nativeEventAvailable' | 'isEvPowertrain'
  >> {
    const isEvPowertrain = fuelType === 'ELECTRIC' || fuelType === 'BEV';
    const snapshot = await this.capabilityResolver.resolveForVehicle(organizationId, vehicleId);
    const dimoNative = snapshot.capabilities.filter(
      (c) => c.providerSource === DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
    );
    const supported = dimoNative.some(
      (c) => c.capabilityStatus === 'SUPPORTED' && c.nativeEventAvailable === true,
    );
    const unsupported = dimoNative.some(
      (c) => c.capabilityStatus === 'UNSUPPORTED' || c.nativeEventAvailable === false,
    );
    return {
      isEvPowertrain,
      nativeBehaviorSupported: supported ? true : unsupported ? false : null,
      nativeEventAvailable: supported ? true : unsupported ? false : null,
    };
  }

  /**
   * Fan-out durable context jobs — one per event × model version.
   * Never blocks the trip on HF fetches; native events already committed.
   */
  private async scheduleNativeEventContextJobs(
    tripId: string,
    vehicleId: string,
    organizationId: string,
    persistedCount: number,
  ): Promise<void> {
    if (persistedCount === 0) {
      this.logger.debug(
        `LTE_R1 enrich: no native events for trip ${tripId} — context jobs skipped`,
      );
      return;
    }

    try {
      const run = await this.prisma.drivingAnalysisRun.findFirst({
        where: {
          organizationId,
          tripId,
          analysisType: 'TRIP_ENRICHMENT',
          modelVersion: DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
        },
        orderBy: { startedAt: 'desc' },
        select: { id: true },
      });

      if (!run) {
        this.logger.debug(
          `LTE_R1 enrich: no V2 analysis run for trip ${tripId} — context jobs deferred to reconciliation`,
        );
        return;
      }

      const result = await this.contextJobs.scheduleContextEnrichmentForTrip({
        organizationId,
        vehicleId,
        tripId,
        analysisRunId: run.id,
        modelVersion: DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
        correlationId: `lte-r1:${tripId}`,
        requestedAt: new Date(),
      });

      this.logger.log(
        `LTE_R1 enrich: context jobs scheduled trip=${tripId} ` +
          `eligible=${result.eligibleEvents} enqueued=${result.enqueued}`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `LTE_R1 enrich: context job scheduling failed for trip ${tripId}: ${message}`,
      );
    }
  }

  private async buildHfContextMap(
    tokenId: number,
    from: Date,
    to: Date,
    tripId: string,
  ): Promise<Map<number, { coolantC: number | null; rpm: number | null; throttlePct: number | null; speedKmh: number | null }>> {
    const map = new Map<
      number,
      { coolantC: number | null; rpm: number | null; throttlePct: number | null; speedKmh: number | null }
    >();
    try {
      const rawHf = await this.segments.fetchHighFrequency(tokenId, from, to);
      if (rawHf.length >= 5) {
        const cleaned: CleanHfPoint[] = preprocessHighFrequency(rawHf);
        for (const p of cleaned) {
          map.set(p.ts, {
            coolantC: p.coolantC ?? null,
            rpm: p.rpm ?? null,
            throttlePct: p.throttlePct ?? null,
            speedKmh: p.speedKmh ?? null,
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(
        `LTE_R1 enrich trip ${tripId}: HF context fetch failed (${err.message}), proceeding without context`,
      );
    }
    return map;
  }

  private mapToNormalizedEvents(
    samples: DimoVehicleEventRecord[],
    vehicleId: string,
    organizationId: string,
    tripId: string,
    hfContext: Map<number, { coolantC: number | null; rpm: number | null; throttlePct: number | null; speedKmh: number | null }>,
    tokenId: number,
  ): Array<{
    vehicleId: string;
    organizationId: string;
    eventType: DrivingEventType;
    classification: NativeEventClassification;
    mapping: DimoNativeDrivingEventMapping;
    recordedAt: Date;
    speedKmh: number | null;
    severity: number;
    durationNs: number;
    durationMs: number;
    metadataJson: string | null;
    coldEngineContext: boolean;
    contextCoolantC: number | null;
    contextRpm: number | null;
    contextThrottlePct: number | null;
    counterValue: number | null;
    rawName: string;
    dimoSource: string;
    providerEventId: string | null;
  }> {
    const events: ReturnType<typeof this.mapToNormalizedEvents> = [];

    for (const s of samples) {
      const mapping = mapDimoNativeDrivingEvent(s.name);
      if (!mapping.isKnownMapping) {
        this.logger.debug(
          `LTE_R1 enrich: persisting unmapped DIMO event name "${s.name}" as UNMAPPED_PROVIDER_EVENT`,
        );
      }
      const { canonicalEventType: eventType, classification } = mapping;

      const ts = new Date(s.timestamp).getTime();
      const ctx = this.findClosestHfContext(ts, hfContext);
      const coldEngine = ctx.coolantC != null && ctx.coolantC < COLD_ENGINE_TEMP_C;

      let counterValue: number | null = null;
      if (s.metadata) {
        counterValue = parseDimoCounterValue(s.metadata);
      }

      const brakingParsed = parseDimoBrakingSample(s, tokenId, tripId);
      const providerEventId =
        brakingParsed?.providerEventId ??
        buildDimoProviderEventId({
          tokenId,
          timestamp: s.timestamp,
          name: s.name,
          source: s.source,
          durationNs: s.durationNs,
          counterValue,
        });

      events.push({
        vehicleId,
        organizationId,
        eventType,
        classification,
        mapping,
        recordedAt: new Date(s.timestamp),
        speedKmh: ctx.speedKmh,
        severity: mapping.severity,
        durationNs: s.durationNs,
        durationMs: Math.round(s.durationNs / 1_000_000),
        metadataJson: s.metadata,
        coldEngineContext: coldEngine,
        contextCoolantC: ctx.coolantC,
        contextRpm: ctx.rpm,
        contextThrottlePct: ctx.throttlePct,
        counterValue,
        rawName: s.name,
        dimoSource: s.source,
        providerEventId,
      });
    }

    return events;
  }

  private async linkBrakingIntakeRows(tripId: string): Promise<void> {
    const events = await this.prisma.drivingEvent.findMany({
      where: {
        tripId,
        source: DrivingEventSource.TELEMETRY_EVENTS,
        eventType: {
          in: [DrivingEventType.HARSH_BRAKING, DrivingEventType.EXTREME_BRAKING],
        },
      },
      select: { id: true, metadataJson: true },
    });

    for (const event of events) {
      const metadata = (event.metadataJson ?? {}) as Record<string, unknown>;
      const providerEventId =
        typeof metadata.providerEventId === 'string' ? metadata.providerEventId : null;
      if (!providerEventId) continue;

      await this.prisma.dimoBrakingEventIntake.updateMany({
        where: { provider: 'DIMO', providerEventId },
        data: {
          drivingEventId: event.id,
          tripId,
          processingStatus: DimoBrakingEventIntakeStatus.PROCESSED,
        },
      });
    }
  }

  private findClosestHfContext(
    tsMs: number,
    hfContext: Map<number, { coolantC: number | null; rpm: number | null; throttlePct: number | null; speedKmh: number | null }>,
  ): { coolantC: number | null; rpm: number | null; throttlePct: number | null; speedKmh: number | null } {
    let closest: { coolantC: number | null; rpm: number | null; throttlePct: number | null; speedKmh: number | null } = {
      coolantC: null,
      rpm: null,
      throttlePct: null,
      speedKmh: null,
    };
    let minDiff = Infinity;
    for (const [ptTs, ctx] of hfContext) {
      const diff = Math.abs(ptTs - tsMs);
      if (diff < minDiff && diff <= HF_CONTEXT_WINDOW_MS) {
        minDiff = diff;
        closest = ctx;
      }
    }
    return closest;
  }

  private countByType(
    events: Array<{ eventType: DrivingEventType; metadataJson?: unknown }>,
  ): EventCounters {
    const accel = countNativeAccelerationEvents(events);
    return {
      harshBraking: events.filter((e) => e.eventType === DrivingEventType.HARSH_BRAKING).length,
      extremeBraking: events.filter((e) => e.eventType === DrivingEventType.EXTREME_BRAKING).length,
      harshAcceleration: accel.harshAcceleration,
      extremeAcceleration: accel.extremeAcceleration,
      harshCornering: events.filter((e) => e.eventType === DrivingEventType.HARSH_CORNERING).length,
      safetyCollision: events.filter((e) => e.eventType === DrivingEventType.SAFETY_COLLISION).length,
      unmapped: events.filter((e) => e.eventType === DrivingEventType.UNMAPPED_PROVIDER_EVENT).length,
    };
  }
}
