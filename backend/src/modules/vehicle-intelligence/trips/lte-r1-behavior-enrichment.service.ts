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
import { DimoSegmentsService, type DimoNativeDrivingEventSample } from '../../dimo/dimo-segments.service';
import { DrivingEventType, DrivingEventSource } from '@prisma/client';
import { preprocessHighFrequency, type CleanHfPoint } from './hf-preprocessing';

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

interface EventCounters {
  harshBraking: number;
  extremeBraking: number;
  harshAcceleration: number;
  harshCornering: number;
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

    // ── 1. Fetch native DIMO driving event signals ───────────────────────────
    const nativeSamples = await this.segments.fetchDrivingEvents(tokenId, trip.startTime, trip.endTime);
    this.logger.debug(`LTE_R1 enrich trip ${tripId}: ${nativeSamples.length} DIMO event samples`);

    // ── 2. Fetch HF data for engine context enrichment ───────────────────────
    const hfContext = await this.buildHfContextMap(tokenId, trip.startTime, trip.endTime, tripId);

    // ── 3. Map to normalized driving events ─────────────────────────────────
    const normalized = this.mapToNormalizedEvents(nativeSamples, vehicleId, organizationId, tripId, hfContext);
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
            },
          })),
        });
      }

      // Update VehicleTrip canonical counters so Driving Impact engine receives
      // the same interface as for SMART5 HF-derived trips.
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
          abuseEvents: 0,
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

    this.logger.log(
      `LTE_R1 enrich done for trip ${tripId}: ${normalized.length} events ` +
      `(harsh brake=${counters.harshBraking}, extreme brake=${counters.extremeBraking}, ` +
      `harsh accel=${counters.harshAcceleration}, cold-engine=${coldEngineAnnotations})`,
    );

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

  private async buildHfContextMap(
    tokenId: number,
    from: Date,
    to: Date,
    tripId: string,
  ): Promise<Map<number, { coolantC: number | null; rpm: number | null; throttlePct: number | null }>> {
    const map = new Map<number, { coolantC: number | null; rpm: number | null; throttlePct: number | null }>();
    try {
      const rawHf = await this.segments.fetchHighFrequency(tokenId, from, to);
      if (rawHf.length >= 5) {
        const cleaned: CleanHfPoint[] = preprocessHighFrequency(rawHf);
        for (const p of cleaned) {
          map.set(p.ts, { coolantC: p.coolantC ?? null, rpm: p.rpm ?? null, throttlePct: p.throttlePct ?? null });
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
    samples: DimoNativeDrivingEventSample[],
    vehicleId: string,
    organizationId: string,
    tripId: string,
    hfContext: Map<number, { coolantC: number | null; rpm: number | null; throttlePct: number | null }>,
  ): Array<{
    vehicleId: string;
    organizationId: string;
    tripId: string;
    eventType: DrivingEventType;
    recordedAt: Date;
    speedKmh: number | null;
    severity: number;
    coldEngineContext: boolean;
    contextCoolantC: number | null;
    contextRpm: number | null;
    contextThrottlePct: number | null;
  }> {
    const events: ReturnType<typeof this.mapToNormalizedEvents> = [];

    for (const s of samples) {
      const ts = new Date(s.timestamp).getTime();
      const ctx = this.findClosestHfContext(ts, hfContext);
      const coldEngine = ctx.coolantC != null && ctx.coolantC < COLD_ENGINE_TEMP_C;

      const base = {
        vehicleId,
        organizationId,
        tripId,
        recordedAt: new Date(s.timestamp),
        speedKmh: s.speed,
        coldEngineContext: coldEngine,
        contextCoolantC: ctx.coolantC,
        contextRpm: ctx.rpm,
        contextThrottlePct: ctx.throttlePct,
      };

      // Extreme braking takes precedence over harsh braking if both fire
      if (s.safetySystemBrakingExtremeEmergency != null && s.safetySystemBrakingExtremeEmergency > 0) {
        events.push({ ...base, eventType: DrivingEventType.EXTREME_BRAKING, severity: EVENT_SEVERITY.EXTREME_BRAKING });
      } else if (s.safetySystemBrakingHarshBraking != null && s.safetySystemBrakingHarshBraking > 0) {
        events.push({ ...base, eventType: DrivingEventType.HARSH_BRAKING, severity: EVENT_SEVERITY.HARSH_BRAKING });
      }

      if (s.safetySystemAccelerationHarshAcceleration != null && s.safetySystemAccelerationHarshAcceleration > 0) {
        events.push({ ...base, eventType: DrivingEventType.HARSH_ACCELERATION, severity: EVENT_SEVERITY.HARSH_ACCELERATION });
      }

      if (s.safetySystemCorneringHarshCornering != null && s.safetySystemCorneringHarshCornering > 0) {
        events.push({ ...base, eventType: DrivingEventType.HARSH_CORNERING, severity: EVENT_SEVERITY.HARSH_CORNERING });
      }
    }

    return events;
  }

  private findClosestHfContext(
    tsMs: number,
    hfContext: Map<number, { coolantC: number | null; rpm: number | null; throttlePct: number | null }>,
  ): { coolantC: number | null; rpm: number | null; throttlePct: number | null } {
    let closest: { coolantC: number | null; rpm: number | null; throttlePct: number | null } = { coolantC: null, rpm: null, throttlePct: null };
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
