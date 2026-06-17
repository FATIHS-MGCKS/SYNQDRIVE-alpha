import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Interval } from '@nestjs/schedule';
import { TripDetectionState } from '@prisma/client';

import { QUEUE_NAMES } from '../queues/queue-names';
import { PrismaService } from '@shared/database/prisma.service';
import {
  TRIP_TRACKING_TRIGGERS,
  type TripTrackingJobData,
} from '../../modules/vehicle-intelligence/trips/trip-detection.types';
import { TripReconciliationService } from '../../modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';

/** Threshold: a POSSIBLE_END state older than this triggers event-based repair */
const STUCK_POSSIBLE_END_THRESHOLD_MS = 30 * 60_000; // 30 minutes

/** Threshold: an ACTIVE_TRIP older than this is considered suspiciously long */
const SUSPICIOUS_LONG_OPEN_THRESHOLD_MS = 4 * 3600_000; // 4 hours

/**
 * Recovery-only safety-net scheduler for the V2 Trip Detection pipeline.
 *
 * This is NOT a primary tracking path. The primary flow is:
 *   Snapshot Worker → POSSIBLE_START → self-retriggering ACTIVE_TICK loop
 *
 * This scheduler exists solely to recover vehicles that are stuck in active
 * detection states (POSSIBLE_START, ACTIVE_TRIP, IDLE_WITHIN_TRIP, POSSIBLE_END)
 * without an active queued tick — e.g. after a crash, deploy, or stalled job.
 *
 * It runs every 2 minutes and re-enqueues the appropriate trigger for any
 * vehicle whose worker lock has expired (no active processing in flight).
 */
@Injectable()
export class TripTrackingRecoveryScheduler implements OnModuleInit {
  private readonly logger = new Logger(TripTrackingRecoveryScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.TRIP_TRACKING)
    private readonly trackingQueue: Queue,
    private readonly prisma: PrismaService,
    @Optional() private readonly reconciliation?: TripReconciliationService,
  ) {}

  async onModuleInit() {
    this.logger.log(
      'V2 Trip Tracking Recovery Scheduler active — recovery-only mode',
    );
  }

  /**
   * Periodic recovery scan: find vehicles in active trip detection states
   * whose worker lock has expired (stalled processing) and re-enqueue
   * the appropriate tracking trigger so the self-retriggering loop resumes.
   */
  @Interval(120_000)
  async recoverStaleTripStates(): Promise<void> {
    if (!canEnqueueQueue(this.logger, 'trip-tracking-recovery')) return;
    const now = new Date();

    const staleStates =
      await this.prisma.vehicleTripDetectionState.findMany({
        where: {
          state: {
            in: [
              TripDetectionState.POSSIBLE_START,
              TripDetectionState.ACTIVE_TRIP,
              TripDetectionState.IDLE_WITHIN_TRIP,
              TripDetectionState.POSSIBLE_END,
            ],
          },
          OR: [
            { workerLockedUntil: null },
            { workerLockedUntil: { lt: now } },
          ],
        },
        include: {
          vehicle: {
            include: {
              latestState: { select: { dimoTokenId: true } },
            },
          },
        },
      });

    for (const s of staleStates) {
      const tokenId = s.vehicle?.latestState?.dimoTokenId;
      if (!tokenId) continue;

      const trigger =
        s.state === TripDetectionState.POSSIBLE_START
          ? TRIP_TRACKING_TRIGGERS.POSSIBLE_START
          : s.state === TripDetectionState.POSSIBLE_END
            ? TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK
            : TRIP_TRACKING_TRIGGERS.ACTIVE_TICK;

      await this.trackingQueue.add(
        'trip-recovery',
        {
          vehicleId: s.vehicleId,
          organizationId: s.organizationId,
          dimoTokenId: tokenId,
          trigger,
          requestedAt: now.toISOString(),
        } satisfies TripTrackingJobData,
        {
          jobId: `trip-recovery-${s.vehicleId}`,
          removeOnComplete: true,
          removeOnFail: 5,
        },
      );
    }

    if (staleStates.length > 0) {
      this.logger.warn(
        `Recovery: re-enqueued ${staleStates.length} stale trip tracking job(s)`,
      );
    }

    // ── Event-triggered reconciliation for anomalous states ─────────────────
    await this.triggerEventBasedReconciliation(now, staleStates);
  }

  /**
   * Event-triggered reconciliation pass: fires for vehicles that are stuck
   * in pathological states beyond normal recovery thresholds.
   *
   * Cases handled:
   *   - POSSIBLE_END stuck > 30 min: force-end via reconciliation
   *   - ACTIVE_TRIP stuck > 4 hours: suspicious long-open trip
   */
  private async triggerEventBasedReconciliation(
    now: Date,
    staleStates: Awaited<ReturnType<PrismaService['vehicleTripDetectionState']['findMany']>>,
  ): Promise<void> {
    if (!this.reconciliation) return;

    for (const s of staleStates) {
      // ── Stuck in POSSIBLE_END > 30 min → trigger onStuckTrip ─────────────
      if (
        s.state === TripDetectionState.POSSIBLE_END &&
        s.possibleEndAt &&
        now.getTime() - s.possibleEndAt.getTime() > STUCK_POSSIBLE_END_THRESHOLD_MS &&
        s.activeTripId
      ) {
        this.logger.warn(
          `Event trigger: POSSIBLE_END stuck for ${Math.round((now.getTime() - s.possibleEndAt.getTime()) / 60_000)}min — vehicle=${s.vehicleId} trip=${s.activeTripId}`,
        );
        this.reconciliation
          .onStuckTrip(s.vehicleId, s.activeTripId)
          .catch((err: unknown) =>
            this.logger.warn(`onStuckTrip failed for ${s.vehicleId}: ${(err as Error).message}`),
          );
      }

      // ── ACTIVE_TRIP open > 4 hours → trigger anomaly reconciliation ───────
      if (
        s.state === TripDetectionState.ACTIVE_TRIP &&
        s.possibleStartAt &&
        now.getTime() - s.possibleStartAt.getTime() > SUSPICIOUS_LONG_OPEN_THRESHOLD_MS
      ) {
        this.logger.warn(
          `Event trigger: ACTIVE_TRIP suspicious long-open (${Math.round((now.getTime() - s.possibleStartAt.getTime()) / 3600_000)}h) — vehicle=${s.vehicleId}`,
        );
        this.reconciliation
          .onAnomalyDetected({
            vehicleId: s.vehicleId,
            type: 'SUSPICIOUS_LONG_OPEN',
            windowFrom: s.possibleStartAt,
            windowTo: now,
          })
          .catch((err: unknown) =>
            this.logger.warn(`onAnomalyDetected failed for ${s.vehicleId}: ${(err as Error).message}`),
          );
      }
    }
  }
}
