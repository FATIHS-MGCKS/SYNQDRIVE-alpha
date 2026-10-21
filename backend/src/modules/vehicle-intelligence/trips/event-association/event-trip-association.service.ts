/**
 * SynqDrive — Event → Trip association service (Stage 1).
 *
 * Single canonical owner of `event.trip_id` resolution and reconciliation for
 * telemetry/behaviour event candidates. Today this covers RPM webhook
 * candidates; the resolver and reconciliation shape are deliberately generic so
 * further event families (harsh accel/brake, speeding) can reuse them.
 *
 * Invariant: if an event logically occurred during a uniquely identifiable
 * trip, `trip_id` must eventually converge to that trip. Ingestion ordering
 * must not create permanent orphans.
 *
 * Convergence has three paths:
 *   1. intake        — resolved synchronously when the event is persisted
 *   2. finalization  — reconciled when the trip transitions to COMPLETED
 *   3. delayed sweep — bounded safety net for finalization-hook failures
 *
 * All three are idempotent and never overwrite an existing non-null `trip_id`.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { TripStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { resolveEventTripAssociation } from './event-trip-association.domain';
import {
  EVENT_TRIP_ASSOCIATION_REASONS,
  type EventTripAssociationDecision,
  type EventTripReconciliationOutcome,
  type TripAssociationCandidate,
} from './event-trip-association.types';

/**
 * Trips fetched per resolution, newest start first. A containing trip is always
 * the newest trip starting at or before the event, so a small slice is
 * sufficient while still surfacing overlapping/cancelled rows for diagnostics.
 */
const TRIP_LOOKBACK_LIMIT = 10;

/** Upper bound on candidates reconciled per trip finalization / sweep call. */
const RECONCILE_BATCH_LIMIT = 200;

/**
 * Candidates younger than this are left to the intake path so a sweep can never
 * race an in-flight webhook transaction.
 */
const DELAYED_SWEEP_MIN_AGE_MS = 60_000;

/** Association stage — low-cardinality metric label. */
export type EventAssociationStage = 'intake' | 'finalization' | 'delayed';

@Injectable()
export class EventTripAssociationService {
  private readonly logger = new Logger(EventTripAssociationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  /**
   * Resolves the canonical trip for an event at intake time.
   * Returns a null `tripId` with a diagnostic reason rather than guessing.
   */
  async resolveForEvent(input: {
    vehicleId: string;
    observedAt: Date;
    stage?: EventAssociationStage;
  }): Promise<EventTripAssociationDecision> {
    const [activeTripId, trips] = await Promise.all([
      this.loadActiveTripId(input.vehicleId),
      this.loadTripCandidates(input.vehicleId, input.observedAt),
    ]);

    const decision = resolveEventTripAssociation({
      observedAt: input.observedAt,
      activeTripId,
      trips,
    });

    this.recordDecision(input.stage ?? 'intake', decision);
    return decision;
  }

  /**
   * Post-finalization reconciliation. Attaches orphan candidates that fall
   * inside the now-canonical trip window.
   *
   * Idempotent: the `trip_id IS NULL` predicate guards both the scan and the
   * write, so a repeated run is a no-op and an existing association is never
   * overwritten.
   */
  async reconcileFinalizedTrip(input: {
    tripId: string;
  }): Promise<EventTripReconciliationOutcome> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: input.tripId },
      select: { id: true, vehicleId: true, tripStatus: true, startTime: true, endTime: true },
    });

    if (!trip || trip.tripStatus !== TripStatus.COMPLETED || trip.endTime == null) {
      return { scanned: 0, associated: 0, ambiguous: 0, unresolved: 0 };
    }

    return this.reconcileWindow({
      vehicleId: trip.vehicleId,
      from: trip.startTime,
      to: trip.endTime,
      stage: 'finalization',
      expectTripId: trip.id,
      minAgeMs: 0,
    });
  }

  /**
   * Bounded safety net for candidates the intake and finalization paths missed
   * (event persisted before its trip row existed, hook failure, transient race).
   *
   * Scoped by vehicle + time window and driven by the existing tiered trip
   * reconciliation schedulers — never a global scan.
   */
  async reconcileUnresolvedWindow(input: {
    vehicleId: string;
    from: Date;
    to: Date;
  }): Promise<EventTripReconciliationOutcome> {
    return this.reconcileWindow({
      vehicleId: input.vehicleId,
      from: input.from,
      to: input.to,
      stage: 'delayed',
      minAgeMs: DELAYED_SWEEP_MIN_AGE_MS,
    });
  }

  private async reconcileWindow(input: {
    vehicleId: string;
    from: Date;
    to: Date;
    stage: Exclude<EventAssociationStage, 'intake'>;
    /** When set, only associations resolving to this trip are written. */
    expectTripId?: string;
    minAgeMs: number;
  }): Promise<EventTripReconciliationOutcome> {
    const outcome: EventTripReconciliationOutcome = {
      scanned: 0,
      associated: 0,
      ambiguous: 0,
      unresolved: 0,
    };

    const notAfter =
      input.minAgeMs > 0
        ? new Date(Math.min(input.to.getTime(), Date.now() - input.minAgeMs))
        : input.to;
    if (notAfter.getTime() < input.from.getTime()) return outcome;

    const candidates = await this.prisma.rpmWebhookCandidate.findMany({
      where: {
        vehicleId: input.vehicleId,
        tripId: null,
        observedAt: { gte: input.from, lte: notAfter },
      },
      select: { id: true, observedAt: true },
      orderBy: { observedAt: 'asc' },
      take: RECONCILE_BATCH_LIMIT,
    });

    if (candidates.length === 0) return outcome;
    outcome.scanned = candidates.length;

    const reason =
      input.stage === 'finalization'
        ? EVENT_TRIP_ASSOCIATION_REASONS.RECONCILED_ON_FINALIZATION
        : EVENT_TRIP_ASSOCIATION_REASONS.RECONCILED_DELAYED;

    const activeTripId = await this.loadActiveTripId(input.vehicleId);

    for (const candidate of candidates) {
      const trips = await this.loadTripCandidates(input.vehicleId, candidate.observedAt);
      const decision = resolveEventTripAssociation({
        observedAt: candidate.observedAt,
        activeTripId,
        trips,
      });

      if (decision.reason === EVENT_TRIP_ASSOCIATION_REASONS.AMBIGUOUS_TRIPS) {
        outcome.ambiguous += 1;
      }

      const resolvedTripId = decision.tripId;
      if (
        resolvedTripId == null ||
        (input.expectTripId != null && resolvedTripId !== input.expectTripId)
      ) {
        outcome.unresolved += 1;
        this.recordDecision(input.stage, decision);
        continue;
      }

      // `tripId: null` in the filter keeps this write idempotent and prevents
      // clobbering an association written concurrently by another path.
      const written = await this.prisma.rpmWebhookCandidate.updateMany({
        where: { id: candidate.id, tripId: null },
        data: { tripId: resolvedTripId },
      });

      if (written.count > 0) {
        outcome.associated += 1;
        this.recordDecision(input.stage, { tripId: resolvedTripId, reason });
      }
    }

    if (outcome.associated > 0 || outcome.ambiguous > 0) {
      this.logger.log(
        `EVENT_TRIP_ASSOCIATION stage=${input.stage} vehicle=${input.vehicleId}` +
          (input.expectTripId ? ` trip=${input.expectTripId}` : '') +
          ` scanned=${outcome.scanned} associated=${outcome.associated}` +
          ` ambiguous=${outcome.ambiguous} unresolved=${outcome.unresolved}`,
      );
    }

    return outcome;
  }

  private async loadActiveTripId(vehicleId: string): Promise<string | null> {
    const state = await this.prisma.vehicleTripDetectionState.findUnique({
      where: { vehicleId },
      select: { activeTripId: true },
    });
    return state?.activeTripId ?? null;
  }

  private async loadTripCandidates(
    vehicleId: string,
    observedAt: Date,
  ): Promise<TripAssociationCandidate[]> {
    return this.prisma.vehicleTrip.findMany({
      where: { vehicleId, startTime: { lte: observedAt } },
      select: { id: true, tripStatus: true, startTime: true, endTime: true },
      orderBy: { startTime: 'desc' },
      take: TRIP_LOOKBACK_LIMIT,
    });
  }

  private recordDecision(
    stage: EventAssociationStage,
    decision: EventTripAssociationDecision,
  ): void {
    this.tripMetrics?.eventTripAssociations?.inc({
      stage,
      reason: decision.reason,
    });
  }
}
