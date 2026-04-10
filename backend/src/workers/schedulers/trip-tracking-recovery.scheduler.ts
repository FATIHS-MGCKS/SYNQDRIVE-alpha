import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
          jobId: `trip-recovery-${s.vehicleId}-${Date.now()}`,
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
  }
}
