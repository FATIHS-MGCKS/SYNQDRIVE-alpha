/**
 * TripEnrichmentOrchestratorService
 *
 * Single canonical entry point for all trip behavior enrichment and driving
 * impact computation.  Every path — V2 FSM auto-finalize, TripReconciliationService
 * repairs, manual "Analyze Behavior", and backfill — MUST go through this service so that
 * status tracking, idempotency guards, logging, and downstream chaining are
 * always applied consistently.
 *
 * Enrichment state machine:
 *   null → PENDING → IN_PROGRESS → COMPLETED
 *                              └→ SKIPPED_NO_HF_DATA
 *                              └→ FAILED_TRANSIENT  (BullMQ will retry)
 *                              └→ FAILED_PERMANENT  (no retry)
 *
 * Skips persist the stable `SKIPPED_NO_HF_DATA` status (so all existing readers
 * keep working) and record the granular reason in `behaviorEnrichmentError`
 * (`capability` | `insufficient_points` | `no_hf_data`) for diagnostics.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DimoPollJobType, DimoPollStatus, TripStatus } from '@prisma/client';

import { PrismaService } from '@shared/database/prisma.service';
import { QUEUE_NAMES } from '../../../workers/queues/queue-names';
import {
  TripBehaviorEnrichmentService,
  type EnrichmentSkipReason,
} from './trip-behavior-enrichment.service';
import type { TripBehaviorEnrichmentJobData } from '../../../workers/processors/trip-behavior-enrichment.processor';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import type { DrivingImpactJobData } from '../../../workers/processors/driving-impact.processor';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import { TripReconciliationService } from './reconciliation/trip-reconciliation.service';
import { TripsService } from './trips.service';
import { TripAnalysisCoordinatorService } from './trip-analysis-coordinator.service';
import { MisuseCaseAggregatorService } from '../misuse-cases/misuse-case-aggregator.service';

// ── Status constants ────────────────────────────────────────────────────────

export type BehaviorEnrichmentStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'SKIPPED_NO_HF_DATA'
  | 'FAILED_TRANSIENT'
  | 'FAILED_PERMANENT';

const STATUS = {
  PENDING: 'PENDING' as const,
  IN_PROGRESS: 'IN_PROGRESS' as const,
  COMPLETED: 'COMPLETED' as const,
  SKIPPED_NO_HF_DATA: 'SKIPPED_NO_HF_DATA' as const,
  FAILED_TRANSIENT: 'FAILED_TRANSIENT' as const,
  FAILED_PERMANENT: 'FAILED_PERMANENT' as const,
};

/** Statuses that block re-enqueue unless force=true */
const TERMINAL_STATUSES: BehaviorEnrichmentStatus[] = [
  STATUS.COMPLETED,
  STATUS.SKIPPED_NO_HF_DATA,
  STATUS.FAILED_PERMANENT,
];

/** Statuses that mean work is already in flight */
const IN_FLIGHT_STATUSES: BehaviorEnrichmentStatus[] = [
  STATUS.PENDING,
  STATUS.IN_PROGRESS,
];

/**
 * Granular skip reason → persisted `behaviorEnrichmentError` code + human label.
 * The persisted `behaviorEnrichmentStatus` stays `SKIPPED_NO_HF_DATA` for all of
 * these (stable contract for every reader); only the diagnostic detail differs.
 */
const SKIP_REASON_META: Record<EnrichmentSkipReason, { code: string; label: string }> = {
  CAPABILITY: {
    code: 'capability',
    label: 'vehicle not enrichable (missing DIMO token / vehicle)',
  },
  INSUFFICIENT_POINTS: {
    code: 'insufficient_points',
    label: 'high-frequency stream too sparse (<10 raw / <5 clean points)',
  },
  NO_HF_DATA: {
    code: 'no_hf_data',
    label: 'no data / trip not eligible (no endTime / too short)',
  },
};

/** Minimum delay before HF data is expected to be available (ms) */
const HF_ENRICH_DELAY_MS = 5_000;

/** Backfill: only process trips created within this many days */
const BACKFILL_CUTOFF_DAYS = 90;

/** Backfill: max trips processed per call to avoid queue storms */
const BACKFILL_DEFAULT_LIMIT = 200;

// ── Helpers ─────────────────────────────────────────────────────────────────

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  const msg = err.message.toLowerCase();
  if (msg.includes('econnrefused') || msg.includes('timeout') || msg.includes('enotfound')) return true;
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('socket')) return true;
  if (msg.includes('prisma') && msg.includes('unique constraint')) return false;
  if (msg.includes('not found') || msg.includes('does not exist')) return false;
  if (msg.includes('invalid') || msg.includes('malformed') || msg.includes('cannot parse')) return false;
  if (msg.includes('no token') || msg.includes('no dimo') || msg.includes('missing vehicle')) return false;
  return true;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class TripEnrichmentOrchestratorService {
  private readonly logger = new Logger(TripEnrichmentOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enrichmentService: TripBehaviorEnrichmentService,
    @InjectQueue(QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT)
    private readonly behaviorQueue: Queue<TripBehaviorEnrichmentJobData>,
    @InjectQueue(QUEUE_NAMES.DRIVING_IMPACT_COMPUTE)
    private readonly drivingImpactQueue: Queue<DrivingImpactJobData>,
    @Optional() private readonly tripMetrics?: TripMetricsService,
    @Optional() private readonly reconciliation?: TripReconciliationService,
    @Optional() private readonly tripsService?: TripsService,
    @Optional() private readonly analysisCoordinator?: TripAnalysisCoordinatorService,
    @Optional() private readonly misuseCaseAggregator?: MisuseCaseAggregatorService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: Enqueue
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Enqueue behavior enrichment for a trip.
   *
   * Idempotent: will skip if the trip is already PENDING, IN_PROGRESS,
   * COMPLETED, SKIPPED_NO_HF_DATA, or FAILED_PERMANENT — unless force=true.
   *
   * Uses a deterministic jobId (hf-enrich-${tripId}) so BullMQ deduplicates
   * concurrent enqueue calls for the same trip.
   */
  async enqueueBehaviorEnrichment(
    tripId: string,
    vehicleId: string,
    organizationId: string | null,
    opts?: { force?: boolean; delayMs?: number },
  ): Promise<boolean> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: { behaviorEnrichmentStatus: true, tripStatus: true },
    });

    if (!trip) {
      this.logger.warn(`enqueueBehaviorEnrichment: trip ${tripId} not found`);
      return false;
    }

    const currentStatus = trip.behaviorEnrichmentStatus as BehaviorEnrichmentStatus | null;

    if (!opts?.force) {
      if (currentStatus && IN_FLIGHT_STATUSES.includes(currentStatus)) {
        this.logger.debug(`Trip ${tripId} enrichment already in flight (${currentStatus}) — skipping enqueue`);
        return false;
      }
      if (currentStatus && TERMINAL_STATUSES.includes(currentStatus)) {
        this.logger.debug(`Trip ${tripId} enrichment terminal (${currentStatus}) — skipping enqueue`);
        return false;
      }
    }

    // Mark PENDING before enqueuing so concurrent calls see in-flight state
    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: { behaviorEnrichmentStatus: STATUS.PENDING },
    });

    const delay = opts?.delayMs ?? HF_ENRICH_DELAY_MS;
    const jobId = `hf-enrich-${tripId}`;

    if (!canEnqueueQueue(this.logger, 'trip-behavior-enrichment')) return false;

    try {
      await this.behaviorQueue.add(
        'hf-enrich',
        { tripId, vehicleId, organizationId, requestedAt: new Date().toISOString() },
        {
          jobId,
          delay,
          removeOnComplete: true,
          removeOnFail: 3,
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
        },
      );
      this.logger.log(`Enqueued HF enrichment for trip ${tripId} (jobId=${jobId} delay=${delay}ms)`);
      await this.analysisCoordinator?.onAnalysisEnqueued(tripId);
      // Update pending gauge asynchronously — don't block enqueue for metric update.
      // Failures are logged at debug but never bubble up, by design: this is purely
      // observability and must not poison a successful enqueue.
      this.prisma.vehicleTrip.count({
        where: { behaviorEnrichmentStatus: { in: [STATUS.PENDING, STATUS.IN_PROGRESS] } },
      }).then((count) => this.tripMetrics?.enrichmentPending.set(count)).catch((err) => {
        this.logger.debug(`Failed to update enrichmentPending gauge: ${err instanceof Error ? err.message : err}`);
      });
      return true;
    } catch (err) {
      // Job with same ID already exists in queue — that is fine (idempotent)
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists') || msg.includes('duplicate')) {
        this.logger.debug(`HF enrichment job ${jobId} already in queue for trip ${tripId}`);
        return false;
      }
      // Queue infrastructure failure — revert status
      await this.prisma.vehicleTrip.update({
        where: { id: tripId },
        data: {
          behaviorEnrichmentStatus: null,
          tripAnalysisStatus: null,
          analysisQueuedAt: null,
        },
      });
      this.logger.error(`Failed to enqueue HF enrichment for trip ${tripId}: ${msg}`);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: Synchronous execution (used by processor + manual endpoint)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Run behavior enrichment synchronously through the canonical flow:
   *   mark started → enrichTrip → mark completed/skipped/failed → enqueue driving impact
   *
   * This is the shared implementation used by BOTH the BullMQ processor and
   * the manual HTTP endpoint.  No special half-paths.
   */
  async runEnrichmentSync(
    tripId: string,
    vehicleId: string,
    organizationId?: string | null,
  ): Promise<{ status: BehaviorEnrichmentStatus; result: any; skipReason?: EnrichmentSkipReason }> {
    const startedAt = new Date();

    // Resolve organizationId if not provided
    let orgId = organizationId ?? null;
    if (!orgId) {
      const trip = await this.prisma.vehicleTrip.findUnique({
        where: { id: tripId },
        include: { vehicle: { select: { organizationId: true } } },
      });
      orgId = trip?.vehicle?.organizationId ?? null;
    }

    await this.markEnrichmentStarted(tripId);
    await this.analysisCoordinator?.onAnalysisStarted(tripId);

    try {
      const outcome = await this.enrichmentService.enrichTrip(tripId);
      const finishedAt = new Date();

      if (outcome.status === 'COMPLETED') {
        const result = outcome.result;
        await this.markEnrichmentCompleted(tripId, finishedAt);
        await this.analysisCoordinator?.markStage(tripId, 'behavior', 'done');
        await this.runRouteSafetyEnrichment(vehicleId, tripId);
        this.scheduleMisuseCaseAggregation(tripId);
        await this.writePollLog(vehicleId, startedAt, finishedAt, DimoPollStatus.SUCCESS,
          `HF enrichment: ${result.totalEventsStored} events stored`);
        await this.enqueueDrivingImpact(tripId, vehicleId, orgId);
        this.logger.log(`Trip ${tripId} enrichment COMPLETED (${result.totalEventsStored} events)`);
        return { status: STATUS.COMPLETED, result };
      } else {
        const meta = SKIP_REASON_META[outcome.reason];
        await this.markEnrichmentSkipped(tripId, meta.code, finishedAt);
        await this.analysisCoordinator?.onAnalysisSkipped(tripId, meta.code);
        await this.writePollLog(vehicleId, startedAt, finishedAt, DimoPollStatus.SUCCESS,
          `HF enrichment skipped — ${meta.label}`);
        this.logger.log(`Trip ${tripId} enrichment SKIPPED (${outcome.reason}: ${meta.label})`);
        return { status: STATUS.SKIPPED_NO_HF_DATA, skipReason: outcome.reason, result: null };
      }
    } catch (err) {
      const finishedAt = new Date();
      const errorMessage = err instanceof Error ? err.message : String(err);
      const transient = isTransientError(err);
      const failStatus = transient ? STATUS.FAILED_TRANSIENT : STATUS.FAILED_PERMANENT;

      await this.markEnrichmentFailed(tripId, errorMessage, transient, finishedAt);
      if (!transient) {
        await this.analysisCoordinator?.onAnalysisFailed(tripId, errorMessage, 'behavior');
      }
      await this.writePollLog(vehicleId, startedAt, finishedAt, DimoPollStatus.FAILURE,
        `HF enrichment failed (${transient ? 'transient' : 'permanent'}): ${errorMessage}`);

      this.logger.warn(`Trip ${tripId} enrichment ${failStatus}: ${errorMessage}`);
      this.tripMetrics?.enrichmentFailed.inc({ stage: transient ? 'transient' : 'permanent' });

      // Notify reconciliation layer on permanent enrichment failures for audit tracking
      if (!transient && this.reconciliation) {
        this.reconciliation
          .onEnrichmentFailure(tripId)
          .catch((err: unknown) =>
            this.logger.debug(`Reconciliation enrichment notification failed: ${(err as Error).message}`),
          );
      }

      // Re-throw so BullMQ processor can apply its retry logic for transient failures
      throw err;
    }
  }

  private async runRouteSafetyEnrichment(vehicleId: string, tripId: string): Promise<void> {
    if (!this.tripsService) {
      await this.analysisCoordinator?.markStage(tripId, 'route', 'skipped');
      return;
    }
    try {
      await this.tripsService.enrichTrip(vehicleId, tripId);
      await this.analysisCoordinator?.markStage(tripId, 'route', 'done');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.tripMetrics?.enrichmentFailed.inc({ stage: 'route_safety' });
      this.logger.warn(`Route/speeding enrichment failed for trip ${tripId}: ${message}`);
      await this.analysisCoordinator?.markStage(tripId, 'route', 'skipped');
    }
  }

  /**
   * Misuse aggregation is part of the canonical post-trip analysis pipeline.
   * Runs fire-and-forget but feeds tripAnalysisStatus via coordinator.
   */
  private scheduleMisuseCaseAggregation(tripId: string): void {
    if (!this.misuseCaseAggregator) {
      void this.analysisCoordinator?.markStage(tripId, 'misuse', 'skipped');
      return;
    }
    void this.misuseCaseAggregator
      .evaluateTrip(tripId)
      .then(() => this.analysisCoordinator?.markStage(tripId, 'misuse', 'done'))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Misuse case aggregation failed for trip ${tripId}: ${message}`);
        void this.analysisCoordinator?.markStage(tripId, 'misuse', 'failed');
      });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: Driving impact enqueue
  // ─────────────────────────────────────────────────────────────────────────

  async enqueueDrivingImpact(
    tripId: string,
    vehicleId: string,
    organizationId: string | null,
  ): Promise<void> {
    const jobId = `driving-impact-${tripId}`;
    if (!canEnqueueQueue(this.logger, 'driving-impact')) {
      await this.analysisCoordinator?.markStage(tripId, 'drivingImpact', 'skipped');
      return;
    }
    try {
      await this.drivingImpactQueue.add(
        'driving-impact-compute',
        { tripId, vehicleId, organizationId, requestedAt: new Date().toISOString() },
        { jobId, removeOnComplete: true, removeOnFail: 3 },
      );
      this.logger.debug(`Enqueued driving impact for trip ${tripId} (jobId=${jobId})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Duplicate jobId = already in queue, that is fine
      if (!msg.includes('already exists') && !msg.includes('duplicate')) {
        this.logger.warn(`Failed to enqueue driving impact for trip ${tripId}: ${msg}`);
        await this.analysisCoordinator?.markStage(tripId, 'drivingImpact', 'skipped');
      }
    }
  }

  /**
   * Mark driving impact computation stage (called from DrivingImpactProcessor).
   * Brake-health recalculation stays outside this status — non-blocking follow-up.
   */
  async markDrivingImpactComputed(tripId: string, skipped = false): Promise<void> {
    if (!skipped) {
      await this.prisma.vehicleTrip.update({
        where: { id: tripId },
        data: { drivingImpactComputedAt: new Date() },
      });
    }
    await this.analysisCoordinator?.markStage(
      tripId,
      'drivingImpact',
      skipped ? 'skipped' : 'done',
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: Backfill
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Find completed trips that have never been enriched (or failed transiently)
   * and enqueue them through the canonical enrichment pipeline.
   *
   * Safe to call repeatedly — idempotent via status guard in enqueueBehaviorEnrichment.
   */
  async backfillUnenrichedTrips(vehicleId?: string, limit?: number): Promise<{
    found: number;
    enqueued: number;
    skipped: number;
  }> {
    const cutoff = new Date(Date.now() - BACKFILL_CUTOFF_DAYS * 24 * 60 * 60 * 1000);
    const maxRows = limit ?? BACKFILL_DEFAULT_LIMIT;

    const eligibleTrips = await this.prisma.vehicleTrip.findMany({
      where: {
        ...(vehicleId ? { vehicleId } : {}),
        tripStatus: TripStatus.COMPLETED,
        endTime: { not: null },
        createdAt: { gte: cutoff },
        OR: [
          { behaviorEnrichmentStatus: null },
          { behaviorEnrichmentStatus: STATUS.FAILED_TRANSIENT },
        ],
      },
      select: {
        id: true,
        vehicleId: true,
        vehicle: { select: { organizationId: true } },
      },
      orderBy: { startTime: 'desc' },
      take: maxRows,
    });

    this.logger.log(`Backfill: found ${eligibleTrips.length} trips eligible for enrichment`);

    let enqueued = 0;
    let skipped = 0;

    for (const trip of eligibleTrips) {
      const queued = await this.enqueueBehaviorEnrichment(
        trip.id,
        trip.vehicleId,
        trip.vehicle?.organizationId ?? null,
        { delayMs: 0 },
      );
      if (queued) enqueued++;
      else skipped++;
    }

    this.logger.log(`Backfill complete: ${enqueued} enqueued, ${skipped} skipped`);
    return { found: eligibleTrips.length, enqueued, skipped };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: Status transitions
  // ─────────────────────────────────────────────────────────────────────────

  private async markEnrichmentStarted(tripId: string): Promise<void> {
    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        behaviorEnrichmentStatus: STATUS.IN_PROGRESS,
        behaviorEnrichmentStartedAt: new Date(),
        behaviorEnrichmentAttempts: { increment: 1 },
        behaviorEnrichmentError: null,
      },
    });
  }

  private async markEnrichmentCompleted(tripId: string, at: Date): Promise<void> {
    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        behaviorEnrichmentStatus: STATUS.COMPLETED,
        behaviorEnrichmentError: null,
      },
    });
  }

  private async markEnrichmentSkipped(
    tripId: string,
    reason: string,
    at: Date,
  ): Promise<void> {
    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        behaviorEnrichmentStatus: STATUS.SKIPPED_NO_HF_DATA,
        behaviorEnrichmentError: reason,
      },
    });
  }

  private async markEnrichmentFailed(
    tripId: string,
    errorMessage: string,
    isTransient: boolean,
    at: Date,
  ): Promise<void> {
    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        behaviorEnrichmentStatus: isTransient ? STATUS.FAILED_TRANSIENT : STATUS.FAILED_PERMANENT,
        behaviorEnrichmentError: errorMessage.slice(0, 500),
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: Logging
  // ─────────────────────────────────────────────────────────────────────────

  private async writePollLog(
    vehicleId: string,
    startedAt: Date,
    finishedAt: Date,
    status: DimoPollStatus,
    message: string,
  ): Promise<void> {
    try {
      await this.prisma.dimoPollLog.create({
        data: {
          vehicleId,
          jobType: DimoPollJobType.TRIP_TRACKING,
          status,
          startedAt,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          errorMessage: message,
        },
      });
    } catch (e) {
      this.logger.debug(`Failed to write poll log: ${e}`);
    }
  }
}
