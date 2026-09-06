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
import { resolvePossibleEndFsmDwellAnchor, isPossibleEndRecoveryEligible } from '../../modules/vehicle-intelligence/trips/trip-fsm-clock-contract';
import { TripReconciliationService } from '../../modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service';
import { TripLifecycleRecoveryService } from '../../modules/vehicle-intelligence/trips/trip-lifecycle-recovery.service';
import { resolveSchedulerStaleStateDisposition } from '../../modules/vehicle-intelligence/trips/trip-lifecycle-scheduler-disposition';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

/** Threshold: a POSSIBLE_END state older than this triggers event-based repair */
const STUCK_POSSIBLE_END_THRESHOLD_MS = 30 * 60_000; // 30 minutes

/** Threshold: an ACTIVE_TRIP older than this is considered suspiciously long */
const SUSPICIOUS_LONG_OPEN_THRESHOLD_MS = 4 * 3600_000; // 4 hours

/**
 * Recovery-only safety-net scheduler for the V2 Trip Detection pipeline.
 *
 * R2A/R2B: scheduler wakes workers only — lifecycle recovery runs under the
 * existing worker lock inside TripDetectionOrchestrationService handlers.
 */
@Injectable()
export class TripTrackingRecoveryScheduler implements OnModuleInit {
  private readonly logger = new Logger(TripTrackingRecoveryScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.TRIP_TRACKING)
    private readonly trackingQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
    @Optional() private readonly reconciliation?: TripReconciliationService,
    @Optional() private readonly lifecycleRecovery?: TripLifecycleRecoveryService,
  ) {}

  async onModuleInit() {
    this.logger.log(
      'V2 Trip Tracking Recovery Scheduler active — recovery-only mode',
    );
  }

  @Interval(120_000)
  async recoverStaleTripStates(): Promise<void> {
    if (!this.leaderGuard.shouldRun('trip_tracking_recovery')) return;
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

    let enqueuedCount = 0;
    let blockedCount = 0;
    let recoverableWakeCount = 0;
    const reconciliationCandidates: typeof staleStates = [];

    for (const s of staleStates) {
      const tokenId = s.vehicle?.latestState?.dimoTokenId;
      if (!tokenId) continue;

      const classification = this.lifecycleRecovery
        ? await this.lifecycleRecovery.classifyDetectionState({
            vehicleId: s.vehicleId,
          })
        : null;

      const disposition = resolveSchedulerStaleStateDisposition(classification);

      if (disposition === 'block') {
        blockedCount += 1;
        this.logger.error(
          `Recovery scheduler blocked vehicle=${s.vehicleId} ` +
            `classification=${classification?.classification ?? 'unknown'}`,
        );
        continue;
      }

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
      enqueuedCount += 1;

      if (disposition === 'enqueue_only') {
        recoverableWakeCount += 1;
        continue;
      }

      reconciliationCandidates.push(s);
    }

    if (enqueuedCount > 0 || blockedCount > 0) {
      this.logger.warn(
        `Recovery: enqueued ${enqueuedCount} stale trip tracking job(s); ` +
          `blocked ${blockedCount} fail-closed state(s); ` +
          `recoverable wake-only ${recoverableWakeCount}`,
      );
    }

    await this.triggerEventBasedReconciliation(now, reconciliationCandidates);
  }

  private async triggerEventBasedReconciliation(
    now: Date,
    staleStates: Awaited<ReturnType<PrismaService['vehicleTripDetectionState']['findMany']>>,
  ): Promise<void> {
    if (!this.reconciliation) return;

    for (const s of staleStates) {
      if (
        s.state === TripDetectionState.POSSIBLE_END &&
        isPossibleEndRecoveryEligible(s, now, STUCK_POSSIBLE_END_THRESHOLD_MS)
      ) {
        const recoveryAgeAnchor = resolvePossibleEndFsmDwellAnchor(s, now);
        const tripId = s.activeTripId!;
        this.logger.warn(
          `Event trigger: POSSIBLE_END stuck for ${Math.round((now.getTime() - recoveryAgeAnchor.getTime()) / 60_000)}min — vehicle=${s.vehicleId} trip=${tripId}`,
        );
        this.reconciliation
          .onStuckTrip(s.vehicleId, tripId)
          .catch((err: unknown) =>
            this.logger.warn(`onStuckTrip failed for ${s.vehicleId}: ${(err as Error).message}`),
          );
      }

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
