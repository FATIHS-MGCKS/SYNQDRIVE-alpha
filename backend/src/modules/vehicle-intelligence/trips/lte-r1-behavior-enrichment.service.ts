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
import { EventContextEnrichmentService } from '../event-context/event-context-enrichment.service';
import { shouldRunIceEventContextEnrichment } from '../event-context/engine-context.guards';
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

// ── Severity scores per event type (0–1 scale, used for DrivingEvent.severity) ─
const EVENT_SEVERITY: Record<DrivingEventType, number> = {
  HARSH_BRAKING: 0.6,
  EXTREME_BRAKING: 0.9,
  HARSH_ACCELERATION: 0.6,
  HARSH_CORNERING: 0.5,
  SPEEDING: 0.4,
  IDLE_EXCESSIVE: 0.2,
};

// Severity floor applied to events DIMO classifies as "extreme" but that we
// persist under a non-extreme enum value (currently only extreme acceleration,
// which has no dedicated DrivingEventType — see mapDimoEventName).
const EXTREME_SEVERITY_FLOOR = 0.9;

/**
 * Native-event classification carried in DrivingEvent.metadataJson.
 * Values are a subset of Prisma's BehaviorEventClassification and match the
 * controller's DRIVING_EVENT_CLASSIFICATION_MAP so surfacing the stored value
 * is a no-op for every existing event type — only extreme acceleration changes
 * (HARD → EXTREME), which is exactly the distinction we want.
 */
export type NativeEventClassification = 'MODERATE' | 'HARD' | 'EXTREME';

export interface MappedDimoEvent {
  eventType: DrivingEventType;
  classification: NativeEventClassification;
}

interface EventCounters {
  harshBraking: number;
  extremeBraking: number;
  harshAcceleration: number;
  harshCornering: number;
}

/**
 * DIMO-name → SynqDrive DrivingEventType + classification. Matching is
 * case-insensitive and prefix-tolerant so DIMO variants (e.g.
 * `behavior.harsh_braking`, `Behavior.HarshBraking`, `behavior.extreme-acceleration`)
 * still map correctly.
 *
 * IMPORTANT — extreme acceleration: there is no `EXTREME_ACCELERATION` value in
 * the `DrivingEventType` enum (only `EXTREME_BRAKING` exists). To stay
 * migration-free and fully backward-compatible, `behavior.extremeAcceleration`
 * is persisted as `HARSH_ACCELERATION` but tagged `classification: 'EXTREME'`
 * with an elevated severity, so it is never mistaken for a normal harsh
 * acceleration event.
 */
export function mapDimoEventName(raw: string): MappedDimoEvent | null {
  const base = raw
    .trim()
    .toLowerCase()
    .replace(/^behavior\./, '')
    .replace(/[\s_\-]+/g, '');
  switch (base) {
    case 'harshbraking':
      return { eventType: DrivingEventType.HARSH_BRAKING, classification: 'HARD' };
    case 'extremebraking':
    case 'extremeemergency':
    case 'extremeemergencybraking':
      return { eventType: DrivingEventType.EXTREME_BRAKING, classification: 'EXTREME' };
    case 'harshacceleration':
      return { eventType: DrivingEventType.HARSH_ACCELERATION, classification: 'HARD' };
    case 'extremeacceleration':
      return { eventType: DrivingEventType.HARSH_ACCELERATION, classification: 'EXTREME' };
    case 'harshcornering':
      return { eventType: DrivingEventType.HARSH_CORNERING, classification: 'MODERATE' };
    default:
      return null;
  }
}

/**
 * DrivingEvent.severity for a mapped native event. Events DIMO reports as
 * extreme are floored to EXTREME_SEVERITY_FLOOR so extreme acceleration
 * (persisted as HARSH_ACCELERATION) outranks normal harsh acceleration.
 */
export function resolveNativeSeverity(
  eventType: DrivingEventType,
  classification: NativeEventClassification,
): number {
  const base = EVENT_SEVERITY[eventType];
  return classification === 'EXTREME' ? Math.max(base, EXTREME_SEVERITY_FLOOR) : base;
}

interface LteR1EnrichmentResult {
  drivingEventsIngested: number;
  harshBrakingCount: number;
  extremeBrakingCount: number;
  harshAccelerationCount: number;
  harshCorneringCount: number;
  coldEngineAnnotations: number;
}

@Injectable()
export class LteR1BehaviorEnrichmentService {
  private readonly logger = new Logger(LteR1BehaviorEnrichmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: DimoSegmentsService,
    private readonly eventContext: EventContextEnrichmentService,
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
    const counters = this.countByType(normalized);
    const coldEngineAnnotations = normalized.filter((e) => e.coldEngineContext).length;

    // ── 4. Persist events (transaction-safe, idempotent) ─────────────────────
    const hardBraking = counters.harshBraking + counters.extremeBraking;
    const hardAccel = counters.harshAcceleration;

    await this.prisma.$transaction(async (tx) => {
      // Idempotent re-enrichment: remove existing TELEMETRY_EVENTS for this trip
      await tx.drivingEvent.deleteMany({
        where: { tripId, source: DrivingEventSource.TELEMETRY_EVENTS },
      });

      if (normalized.length > 0) {
        await tx.drivingEvent.createMany({
          data: normalized.map((e) => ({
            vehicleId: e.vehicleId,
            organizationId: e.organizationId,
            tripId: e.tripId,
            eventType: e.eventType,
            source: DrivingEventSource.TELEMETRY_EVENTS,
            recordedAt: e.recordedAt,
            speedKmh: e.speedKmh,
            severity: e.severity,
            metadataJson: {
              coldEngineContext: e.coldEngineContext,
              coolantC: e.contextCoolantC,
              rpm: e.contextRpm,
              throttlePct: e.contextThrottlePct,
              hardwareSource: 'LTE_R1',
              dimoEventName: e.rawName,
              dimoEventSource: e.dimoSource,
              dimoCounterValue: e.counterValue,
              classification: e.classification,
              provider: 'DIMO',
              providerEventId: e.providerEventId,
              detectionMethod: 'NATIVE_TELEMETRY_EVENT',
            },
          })),
        });
      }

      // Update VehicleTrip canonical counters so Driving Impact engine receives
      // the same interface as for SMART5 HF-derived trips.
      //
      // Severity-ladder for Abuse on LTE_R1:
      //   DIMO `behavior.extremeBraking` = DIMO's own critical-severity braking
      //   event.  In the absence of sufficient HF context (common on LTE_R1
      //   because HF data is sparse for this hardware family), we surface
      //   `extremeBraking` as an abuse event so the "Abuse Detection" KPI is
      //   actually populated from vehicle-reported critical events.  When
      //   HF-derived abuse events are also available, TripBehaviorEnrichment
      //   overwrites abuseEvents below — but those additions are additive,
      //   not a replacement, so the extremeBraking-sourced minimum remains.
      const abuseFromDimo = counters.extremeBraking;
      await tx.vehicleTrip.update({
        where: { id: tripId },
        data: {
          hardBrakingCount: hardBraking,
          hardAccelerationCount: hardAccel,
          totalAccelerationEvents: counters.harshAcceleration,
          hardAccelerationEvents: hardAccel,
          totalBrakingEvents: counters.harshBraking + counters.extremeBraking,
          hardBrakingEvents: hardBraking,
          fullBrakingEvents: 0,
          corneringEvents: counters.harshCornering,
          abuseEvents: abuseFromDimo,
          speedingEvents: 0,
          harshBrakeCount: hardBraking,   // DEPRECATED alias — mirrored for compatibility
          harshAccelCount: hardAccel,      // DEPRECATED alias — mirrored for compatibility
          harshCornerCount: counters.harshCornering,
          // Canonical event totals for Driving Impact (same semantics as HF path)
          brakingEventCount: counters.harshBraking + counters.extremeBraking,
          accelerationEventCount: counters.harshAcceleration,
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

    // ── 5. Best-effort per-event Context Enrichment (Phase 3) ─────────────────
    // Runs AFTER native events are committed, so a context failure can never
    // roll back / lose a native event. Only for LTE_R1/ICE; Tesla/EV skipped.
    await this.enrichNativeEventContexts(tripId, {
      hardwareType: trip.vehicle.hardwareType,
      fuelType: trip.vehicle.fuelType,
    }, normalized.length);

    return {
      drivingEventsIngested: normalized.length,
      harshBrakingCount: counters.harshBraking,
      extremeBrakingCount: counters.extremeBraking,
      harshAccelerationCount: counters.harshAcceleration,
      harshCorneringCount: counters.harshCornering,
      coldEngineAnnotations,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Best-effort: for each persisted native DrivingEvent of this trip, run Event
   * Context Enrichment (T±30s signal window → contextAssessment in metadataJson).
   *
   * Guarantees:
   *   - Never throws (a context failure must not abort trip enrichment).
   *   - Skips entirely for Tesla/EV and non-LTE_R1/ICE vehicles
   *     (NOT_APPLICABLE_POWERTRAIN) — no contextAssessment written.
   */
  private async enrichNativeEventContexts(
    tripId: string,
    vehicle: { hardwareType: import('@prisma/client').HardwareType | null; fuelType: string | null },
    persistedCount: number,
  ): Promise<void> {
    if (persistedCount === 0) {
      this.logger.debug(
        `LTE_R1 enrich: no native events for trip ${tripId} — context enrichment skipped`,
      );
      return;
    }

    if (!shouldRunIceEventContextEnrichment(vehicle)) {
      this.logger.debug(
        `LTE_R1 enrich: context enrichment skipped for trip ${tripId} — ` +
          `NOT_APPLICABLE_POWERTRAIN (${persistedCount} native event(s) preserved)`,
      );
      return;
    }

    let events: Array<{ id: string }>;
    try {
      events = await this.prisma.drivingEvent.findMany({
        where: { tripId, source: DrivingEventSource.TELEMETRY_EVENTS },
        select: { id: true },
        orderBy: { recordedAt: 'asc' },
      });
    } catch (err: any) {
      this.logger.warn(
        `LTE_R1 enrich: could not load events for context enrichment (trip ${tripId}): ${err?.message ?? err}`,
      );
      return;
    }

    if (events.length === 0) {
      this.logger.warn(
        `LTE_R1 enrich: context enrichment requested for trip ${tripId} but no persisted ` +
          `TELEMETRY_EVENTS rows found after createMany`,
      );
      return;
    }

    this.logger.debug(
      `LTE_R1 enrich: context enrichment requested for trip ${tripId} (${events.length} event(s))`,
    );

    let enriched = 0;
    let failed = 0;
    let skipped = 0;

    for (const ev of events) {
      try {
        const assessment = await this.eventContext.enrichDrivingEventContext(ev.id);
        if (assessment.status === 'FAILED') failed += 1;
        else if (assessment.status === 'SKIPPED_NOT_APPLICABLE') skipped += 1;
        else enriched += 1;
      } catch (err: any) {
        failed += 1;
        this.logger.warn(
          `LTE_R1 enrich: context enrichment failed for event ${ev.id}: ${err?.message ?? err}`,
        );
      }
    }

    this.logger.log(
      `LTE_R1 enrich: context enrichment trip ${tripId}: ` +
        `enriched=${enriched} failed=${failed} skipped=${skipped} total=${events.length}`,
    );
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
    tripId: string;
    eventType: DrivingEventType;
    classification: NativeEventClassification;
    recordedAt: Date;
    speedKmh: number | null;
    severity: number;
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
      const mapped = mapDimoEventName(s.name);
      if (!mapped) {
        this.logger.debug(
          `LTE_R1 enrich: ignoring unmapped DIMO event name "${s.name}"`,
        );
        continue;
      }
      const { eventType, classification } = mapped;

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
        tripId,
        eventType,
        classification,
        recordedAt: new Date(s.timestamp),
        speedKmh: ctx.speedKmh,
        severity: resolveNativeSeverity(eventType, classification),
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

  private countByType(events: Array<{ eventType: DrivingEventType }>): EventCounters {
    return {
      harshBraking: events.filter((e) => e.eventType === DrivingEventType.HARSH_BRAKING).length,
      extremeBraking: events.filter((e) => e.eventType === DrivingEventType.EXTREME_BRAKING).length,
      harshAcceleration: events.filter((e) => e.eventType === DrivingEventType.HARSH_ACCELERATION).length,
      harshCornering: events.filter((e) => e.eventType === DrivingEventType.HARSH_CORNERING).length,
    };
  }
}
