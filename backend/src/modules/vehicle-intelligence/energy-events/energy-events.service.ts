import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DimoSegmentsService,
  type DimoEnergyEventSegment,
} from '@modules/dimo/dimo-segments.service';
import {
  EnergyEventConfidence,
  EnergyEventKind,
  type VehicleEnergyEvent,
} from '@prisma/client';
import { toEnergyEventDto, type EnergyEventDto } from './energy-events.types';

export interface DetectEnergyEventsOptions {
  from: Date;
  to: Date;
}

export interface DetectEnergyEventsResult {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  coalescedGroups: number;
  prunedStale: number;
  events: EnergyEventDto[];
}

// ── Coalescing constants ──────────────────────────────────────────────────
// DIMO's RechargeDetector / RefuelDetector emit a fresh segment whenever the
// underlying signal pauses briefly (battery-management pause, charger
// reconnect, refuel pump pause). Operationally a single physical "plug-in"
// or "fill-up" must surface as ONE event. We coalesce neighbouring
// sub-segments inside a small temporal window. Geo-check on top so we never
// merge two distinct charging stations that happen to be visited back-to-back.
const COALESCE_GAP_SECONDS_RECHARGE = 30 * 60; // 30 min between sub-segments
const COALESCE_GAP_SECONDS_REFUEL = 5 * 60; // 5 min — refuel pauses are short
const COALESCE_GEO_RADIUS_M = 250; // ≤ 250 m → same charger / same pump

interface CoalescedEnergySegment extends DimoEnergyEventSegment {
  /** Stable id used for upsert. Deterministic from first sub-segment start. */
  coalescedSegmentId: string;
  /** Original DIMO sub-segment ids that were folded into this group. */
  coalescedFromSegmentIds: string[];
}

/**
 * Canonical orchestration layer for refuel/recharge events.
 *
 * Data lineage:
 *   DIMO Telemetry API  →  segments(mechanism: refuel|recharge)
 *      │
 *      ▼
 *   DimoSegmentsService.fetchEnergyEventSegments  (raw segment objects)
 *      │
 *      ▼
 *   persistSegments()                              (idempotent upsert by dimoSegmentId)
 *      │
 *      ▼
 *   vehicle_energy_events                          (first-class row per event)
 *
 * Read side:
 *   listEnergyEvents()           → flat list for timeline rendering
 *   buildTripsTimeline()         → merges trips + events chronologically
 *
 * This service intentionally does not merge refuel/recharge semantics into
 * VehicleTrip rows. The trip table continues to describe driving activity;
 * energy events describe stationary refill/charge activity between trips.
 */
@Injectable()
export class EnergyEventsService {
  private readonly logger = new Logger(EnergyEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dimoSegments: DimoSegmentsService,
  ) {}

  async listEnergyEvents(
    vehicleId: string,
    options: { from?: Date; to?: Date } = {},
  ): Promise<EnergyEventDto[]> {
    const rows = await this.prisma.vehicleEnergyEvent.findMany({
      where: {
        vehicleId,
        ...(options.from || options.to
          ? {
              startTime: {
                ...(options.from ? { gte: options.from } : {}),
                ...(options.to ? { lte: options.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { startTime: 'asc' },
    });
    return rows.map(toEnergyEventDto);
  }

  /**
   * On-demand detection: fetches native DIMO energy segments for a vehicle
   * window and upserts them into `vehicle_energy_events`. Safe to call
   * repeatedly — the underlying `dimoSegmentId` (tokenId + startTs) is the
   * idempotency key.
   */
  async detectEnergyEvents(
    vehicleId: string,
    options: DetectEnergyEventsOptions,
  ): Promise<DetectEnergyEventsResult> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { dimoVehicle: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const tokenId = vehicle.dimoVehicle?.tokenId ?? 0;
    if (tokenId <= 0) {
      this.logger.debug(
        `Skipping energy-event detection for vehicle ${vehicleId}: no DIMO tokenId`,
      );
      return {
        fetched: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        coalescedGroups: 0,
        prunedStale: 0,
        events: [],
      };
    }

    let segments: DimoEnergyEventSegment[] = [];
    try {
      segments = await this.dimoSegments.fetchEnergyEventSegments(
        tokenId,
        options.from,
        options.to,
      );
    } catch (err: any) {
      this.logger.warn(
        `DIMO energy-event fetch failed for vehicle=${vehicleId} tokenId=${tokenId}: ${err.message}`,
      );
      return {
        fetched: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        coalescedGroups: 0,
        prunedStale: 0,
        events: [],
      };
    }

    // Filter sub-segments first so noise (sensor jitter, partial windows)
    // never enters the coalescing layer — otherwise tiny noise segments could
    // bridge two real charging sessions inside a 30-min window.
    const persistableSegments = segments.filter((segment) => {
      if (this.isSegmentPersistable(segment)) return true;
      return false;
    });
    const skipped = segments.length - persistableSegments.length;

    // Coalesce neighbouring sub-segments of the same mechanism into one
    // logical event. Detector-level truth (DIMO) is preserved in
    // rawDetectionMeta.coalescedFromSegmentIds for audit / debugging.
    const coalesced = this.coalesceSegments(persistableSegments);

    let created = 0;
    let updated = 0;
    const persistedRows: VehicleEnergyEvent[] = [];
    const persistedSegmentIds = new Set<string>();

    for (const group of coalesced) {
      const { row, wasCreated } = await this.upsertSegment(vehicleId, group);
      persistedRows.push(row);
      persistedSegmentIds.add(group.coalescedSegmentId);
      if (wasCreated) created++;
      else updated++;
    }

    // Prune stale sub-segments inside the detection window: rows that were
    // persisted by a previous (pre-coalescing) run with their raw DIMO
    // segmentId, but are now subsumed by a coalesced group. Without this
    // cleanup the user would see (3 old + 1 new merged) = 4 cards.
    // Bounded to [from, to] and to this vehicle so we never touch unrelated
    // history.
    const prunedStale = await this.pruneStaleSubSegments(
      vehicleId,
      options.from,
      options.to,
      persistedSegmentIds,
    );

    return {
      fetched: segments.length,
      created,
      updated,
      skipped,
      coalescedGroups: coalesced.length,
      prunedStale,
      events: persistedRows.map(toEnergyEventDto),
    };
  }

  /**
   * Canonical timeline for the Trips tab: interleaves trips and energy
   * events by start time. Trips are passed in by the caller (already
   * hydrated by TripAnalyticsCanonicalService); energy events are loaded
   * here so the merge happens once, in the backend.
   */
  async buildTripsTimeline(
    vehicleId: string,
    hydratedTrips: Array<Record<string, unknown> & { startTime: Date | string }>,
    options: { from?: Date; to?: Date } = {},
  ): Promise<
    Array<
      | ({ itemType: 'trip'; startTime: string } & Record<string, unknown>)
      | ({ itemType: 'energy-event'; startTime: string } & EnergyEventDto)
    >
  > {
    const events = await this.listEnergyEvents(vehicleId, options);

    const tripItems = hydratedTrips.map((trip) => {
      const startTime =
        typeof trip.startTime === 'string'
          ? trip.startTime
          : trip.startTime instanceof Date
            ? trip.startTime.toISOString()
            : new Date().toISOString();
      return { ...trip, itemType: 'trip' as const, startTime };
    });

    const eventItems = events.map((event) => ({
      ...event,
      itemType: 'energy-event' as const,
    }));

    return [...tripItems, ...eventItems].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );
  }

  // ── internal helpers ────────────────────────────────────────────────────

  private isSegmentPersistable(segment: DimoEnergyEventSegment): boolean {
    if (!segment.endTime) return false;
    if (segment.isOngoing) return false;
    if (segment.durationSeconds <= 0) return false;
    if (segment.mechanism === 'refuel') {
      // Require a meaningful fuel gain to avoid persisting sensor noise.
      return (segment.fuelDeltaLiters ?? 0) > 1.0;
    }
    // recharge: require at least 1 % SoC gain OR any kWh gain
    return (
      (segment.socDeltaPercent ?? 0) >= 1 ||
      (segment.energyDeltaKwh ?? 0) > 0
    );
  }

  private async upsertSegment(
    vehicleId: string,
    segment: CoalescedEnergySegment,
  ): Promise<{ row: VehicleEnergyEvent; wasCreated: boolean }> {
    const kind: EnergyEventKind =
      segment.mechanism === 'refuel'
        ? EnergyEventKind.REFUEL
        : EnergyEventKind.RECHARGE;

    const existing = await this.prisma.vehicleEnergyEvent.findUnique({
      where: { dimoSegmentId: segment.coalescedSegmentId },
    });

    const data = {
      vehicleId,
      kind,
      detectionMechanism: segment.mechanism,
      startTime: new Date(segment.startTime),
      endTime: new Date(segment.endTime as string),
      durationSeconds: segment.durationSeconds,
      startLatitude: segment.startLatitude,
      startLongitude: segment.startLongitude,
      endLatitude: segment.endLatitude,
      endLongitude: segment.endLongitude,
      fuelDeltaLiters: segment.fuelDeltaLiters,
      fuelDeltaPercent: segment.fuelDeltaPercent,
      socDeltaPercent: segment.socDeltaPercent,
      energyDeltaKwh: segment.energyDeltaKwh,
      odometerStartKm: segment.odometerStartKm,
      odometerEndKm: segment.odometerEndKm,
      confidence: this.scoreConfidence(segment),
      rawDetectionMeta: {
        fuelStartLiters: segment.fuelStartLiters,
        fuelEndLiters: segment.fuelEndLiters,
        fuelStartPercent: segment.fuelStartPercent,
        fuelEndPercent: segment.fuelEndPercent,
        socStartPercent: segment.socStartPercent,
        socEndPercent: segment.socEndPercent,
        energyStartKwh: segment.energyStartKwh,
        energyEndKwh: segment.energyEndKwh,
        coalescedFromCount: segment.coalescedFromSegmentIds.length,
        coalescedFromSegmentIds: segment.coalescedFromSegmentIds,
      },
    } as const;

    if (existing) {
      const row = await this.prisma.vehicleEnergyEvent.update({
        where: { id: existing.id },
        data,
      });
      return { row, wasCreated: false };
    }
    const row = await this.prisma.vehicleEnergyEvent.create({
      data: { ...data, dimoSegmentId: segment.coalescedSegmentId },
    });
    return { row, wasCreated: true };
  }

  /**
   * Group neighbouring DIMO sub-segments of the same mechanism into one
   * logical event. Two sub-segments are merged when:
   *   - same mechanism (refuel ↔ refuel, recharge ↔ recharge)
   *   - end-of-previous → start-of-next gap ≤ mechanism-specific threshold
   *   - geographic distance between previous-end and next-start ≤ 250 m
   *     (skipped when either side has no coordinates so legacy ICE/EV rows
   *     still merge on time-only)
   *
   * Single-segment groups keep their native DIMO `segmentId` so existing
   * rows stay idempotent. Merged groups get a deterministic
   * `dimo-{mechanism}-coalesced-{tokenId}-{firstStartMs}` key derived from
   * the earliest sub-segment, which keeps the upsert stable across reruns
   * even if DIMO later reports an additional fragment inside the window.
   */
  private coalesceSegments(
    segments: DimoEnergyEventSegment[],
  ): CoalescedEnergySegment[] {
    if (segments.length === 0) return [];
    const sorted = [...segments].sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    const groups: DimoEnergyEventSegment[][] = [];
    let current: DimoEnergyEventSegment[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prev = current[current.length - 1];
      const next = sorted[i];

      if (prev.mechanism !== next.mechanism) {
        groups.push(current);
        current = [next];
        continue;
      }

      const prevEnd = prev.endTime
        ? new Date(prev.endTime).getTime()
        : new Date(prev.startTime).getTime() + prev.durationSeconds * 1000;
      const nextStart = new Date(next.startTime).getTime();
      const gapSeconds = Math.max(0, (nextStart - prevEnd) / 1000);

      const gapBudget =
        next.mechanism === 'refuel'
          ? COALESCE_GAP_SECONDS_REFUEL
          : COALESCE_GAP_SECONDS_RECHARGE;

      if (gapSeconds > gapBudget) {
        groups.push(current);
        current = [next];
        continue;
      }

      const distanceM = haversineMeters(
        prev.endLatitude,
        prev.endLongitude,
        next.startLatitude,
        next.startLongitude,
      );
      if (distanceM != null && distanceM > COALESCE_GEO_RADIUS_M) {
        groups.push(current);
        current = [next];
        continue;
      }

      current.push(next);
    }
    groups.push(current);

    return groups.map((group) => this.mergeGroup(group));
  }

  private mergeGroup(group: DimoEnergyEventSegment[]): CoalescedEnergySegment {
    const first = group[0];
    if (group.length === 1) {
      return {
        ...first,
        coalescedSegmentId: first.segmentId,
        coalescedFromSegmentIds: [first.segmentId],
      };
    }
    const last = group[group.length - 1];

    const startMs = Math.min(
      ...group.map((g) => new Date(g.startTime).getTime()),
    );
    const endMs = Math.max(
      ...group.map((g) =>
        g.endTime ? new Date(g.endTime).getTime() : new Date(g.startTime).getTime(),
      ),
    );

    // Sum positive deltas across sub-segments — DIMO reports them per
    // sub-window, so a true total is the additive sum (the SoC at the start
    // of segment N+1 already accounts for any drift during the pause).
    const sumPositive = (
      values: Array<number | null | undefined>,
    ): number | null => {
      const finite = values.filter(
        (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
      );
      if (finite.length === 0) return null;
      return finite.reduce((acc, v) => acc + v, 0);
    };

    // Snapshot envelope: take the absolute MIN/MAX across the whole group so
    // the persisted start/end fuel & SoC numbers describe the entire merged
    // window, not just the first/last sub-segment.
    const envelopeMin = (values: Array<number | null | undefined>): number | null => {
      const finite = values.filter(
        (v): v is number => typeof v === 'number' && Number.isFinite(v),
      );
      return finite.length === 0 ? null : Math.min(...finite);
    };
    const envelopeMax = (values: Array<number | null | undefined>): number | null => {
      const finite = values.filter(
        (v): v is number => typeof v === 'number' && Number.isFinite(v),
      );
      return finite.length === 0 ? null : Math.max(...finite);
    };

    // Tokenid + mechanism are encoded in every sub-segment's segmentId
    // (`dimo-{mechanism}-{tokenId}-{startMs}`). Re-extract from the first
    // sub-segment so we don't have to thread tokenId through the call stack.
    const idMatch = first.segmentId.match(/^dimo-(refuel|recharge)-(\d+)-/);
    const tokenIdPart = idMatch?.[2] ?? '0';
    const coalescedSegmentId = `dimo-${first.mechanism}-coalesced-${tokenIdPart}-${startMs}`;

    return {
      segmentId: coalescedSegmentId,
      mechanism: first.mechanism,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      isOngoing: false,
      startedBeforeRange: first.startedBeforeRange,
      durationSeconds: Math.round((endMs - startMs) / 1000),
      startLatitude: first.startLatitude,
      startLongitude: first.startLongitude,
      endLatitude: last.endLatitude,
      endLongitude: last.endLongitude,
      odometerStartKm: envelopeMin(group.map((g) => g.odometerStartKm)),
      odometerEndKm: envelopeMax(group.map((g) => g.odometerEndKm)),
      fuelStartLiters: envelopeMin(group.map((g) => g.fuelStartLiters)),
      fuelEndLiters: envelopeMax(group.map((g) => g.fuelEndLiters)),
      fuelDeltaLiters: sumPositive(group.map((g) => g.fuelDeltaLiters)),
      fuelStartPercent: envelopeMin(group.map((g) => g.fuelStartPercent)),
      fuelEndPercent: envelopeMax(group.map((g) => g.fuelEndPercent)),
      fuelDeltaPercent: sumPositive(group.map((g) => g.fuelDeltaPercent)),
      socStartPercent: envelopeMin(group.map((g) => g.socStartPercent)),
      socEndPercent: envelopeMax(group.map((g) => g.socEndPercent)),
      socDeltaPercent: sumPositive(group.map((g) => g.socDeltaPercent)),
      energyStartKwh: envelopeMin(group.map((g) => g.energyStartKwh)),
      energyEndKwh: envelopeMax(group.map((g) => g.energyEndKwh)),
      energyDeltaKwh: sumPositive(group.map((g) => g.energyDeltaKwh)),
      coalescedSegmentId,
      coalescedFromSegmentIds: group.map((g) => g.segmentId),
    };
  }

  /**
   * Delete legacy sub-segment rows that would otherwise live alongside a
   * freshly persisted coalesced event. Scoped to (vehicleId, [from, to])
   * and only touches rows whose `dimoSegmentId` is NOT one of the ids we
   * just persisted in this run.
   */
  private async pruneStaleSubSegments(
    vehicleId: string,
    from: Date,
    to: Date,
    keepIds: Set<string>,
  ): Promise<number> {
    const candidates = await this.prisma.vehicleEnergyEvent.findMany({
      where: {
        vehicleId,
        startTime: { gte: from, lte: to },
      },
      select: { id: true, dimoSegmentId: true },
    });
    const stale = candidates.filter((row) => !keepIds.has(row.dimoSegmentId));
    if (stale.length === 0) return 0;
    const result = await this.prisma.vehicleEnergyEvent.deleteMany({
      where: { id: { in: stale.map((row) => row.id) } },
    });
    if (result.count > 0) {
      this.logger.debug(
        `Pruned ${result.count} stale energy-event sub-segments for vehicle=${vehicleId} window=[${from.toISOString()}, ${to.toISOString()}]`,
      );
    }
    return result.count;
  }

  private scoreConfidence(segment: DimoEnergyEventSegment): EnergyEventConfidence {
    if (segment.mechanism === 'refuel') {
      const liters = segment.fuelDeltaLiters ?? 0;
      if (liters >= 10 && segment.startLatitude != null) {
        return EnergyEventConfidence.HIGH;
      }
      if (liters >= 3) return EnergyEventConfidence.MEDIUM;
      return EnergyEventConfidence.LOW;
    }
    const socDelta = segment.socDeltaPercent ?? 0;
    if (socDelta >= 20 && segment.startLatitude != null) {
      return EnergyEventConfidence.HIGH;
    }
    if (socDelta >= 5) return EnergyEventConfidence.MEDIUM;
    return EnergyEventConfidence.LOW;
  }
}

/**
 * Great-circle distance in metres between two WGS-84 points. Returns null
 * when either coordinate is missing — callers treat null as "no geo signal,
 * fall back to time-only check" rather than as "distance = ∞".
 */
function haversineMeters(
  lat1: number | null,
  lon1: number | null,
  lat2: number | null,
  lon2: number | null,
): number | null {
  if (
    lat1 == null ||
    lon1 == null ||
    lat2 == null ||
    lon2 == null ||
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return null;
  }
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
