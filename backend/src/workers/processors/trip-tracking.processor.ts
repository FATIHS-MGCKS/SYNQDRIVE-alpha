import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { DimoPollJobType, DimoPollStatus } from '@prisma/client';

import { QUEUE_NAMES } from '../queues/queue-names';
import { PrismaService } from '@shared/database/prisma.service';
import { TripDetectionOrchestrationService } from '../../modules/vehicle-intelligence/trips/trip-detection-orchestration.service';
import {
  TRIP_TRACKING_TRIGGERS,
  type TripTrackingJobData,
} from '../../modules/vehicle-intelligence/trips/trip-detection.types';
import { TripMetricsService } from '../../modules/observability/trip-metrics.service';
import { observeQueueLag } from '../../modules/observability/queue-lag.util';

@Processor(QUEUE_NAMES.TRIP_TRACKING)
@Injectable()
export class TripTrackingProcessor extends WorkerHost {
  private readonly logger = new Logger(TripTrackingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestration: TripDetectionOrchestrationService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {
    super();
  }

  async process(job: Job<TripTrackingJobData>): Promise<void> {
    const { vehicleId, trigger } = job.data;
    const startedAt = new Date();
    observeQueueLag(this.tripMetrics, QUEUE_NAMES.TRIP_TRACKING, job);

    try {
      switch (trigger) {
        case TRIP_TRACKING_TRIGGERS.POSSIBLE_START:
          await this.orchestration.processPossibleStart(job.data);
          break;
        case TRIP_TRACKING_TRIGGERS.ACTIVE_TICK:
          await this.orchestration.processActiveTick(job.data);
          break;
        case TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK:
          await this.orchestration.processPossibleEndCheck(job.data);
          break;
        case TRIP_TRACKING_TRIGGERS.END_VALIDATION:
          await this.orchestration.processEndValidation(job.data);
          break;
        case TRIP_TRACKING_TRIGGERS.FINALIZE:
          await this.orchestration.processFinalize(job.data);
          break;
        default:
          this.logger.warn(`Unknown trigger: ${trigger}`);
          return;
      }

      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      if (
        trigger === TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK ||
        trigger === TRIP_TRACKING_TRIGGERS.END_VALIDATION ||
        trigger === TRIP_TRACKING_TRIGGERS.FINALIZE
      ) {
        this.logger.debug(
          `Trip tracking [${trigger}] completed vehicle=${vehicleId} durationMs=${durationMs}`,
        );
      }

      await this.prisma.dimoPollLog.create({
        data: {
          vehicleId,
          jobType: DimoPollJobType.TRIP_TRACKING,
          status: DimoPollStatus.SUCCESS,
          startedAt,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
        },
      });
    } catch (err) {
      const finishedAt = new Date();
      const errorMessage =
        err instanceof Error ? err.message : String(err);

      await this.prisma.dimoPollLog.create({
        data: {
          vehicleId,
          jobType: DimoPollJobType.TRIP_TRACKING,
          status: DimoPollStatus.FAILURE,
          startedAt,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          errorMessage,
        },
      });

      this.logger.warn(
        `Trip tracking [${trigger}] failed for ${vehicleId}: ${errorMessage}`,
      );
      throw err;
    }
  }
}
