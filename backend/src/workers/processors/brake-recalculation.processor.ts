import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queue-names';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { observeQueueLag } from '@modules/observability/queue-lag.util';
import {
  BrakeRecalculationOrchestratorService,
  type BrakeRecalculationJobData,
} from '../../modules/vehicle-intelligence/brakes/brake-recalculation-orchestrator.service';

@Injectable()
@Processor(QUEUE_NAMES.BRAKE_RECALCULATION, {
  lockDuration: 120_000,
  concurrency: 2,
})
export class BrakeRecalculationProcessor extends WorkerHost {
  private readonly logger = new Logger(BrakeRecalculationProcessor.name);

  constructor(
    private readonly orchestrator: BrakeRecalculationOrchestratorService,
    private readonly tripMetrics: TripMetricsService,
  ) {
    super();
  }

  async process(job: Job<BrakeRecalculationJobData>) {
    observeQueueLag(this.tripMetrics, QUEUE_NAMES.BRAKE_RECALCULATION, job);
    const { vehicleId, trigger } = job.data;
    if (!vehicleId) {
      this.logger.warn('Missing vehicleId in brake recalculation job');
      return;
    }

    this.logger.debug(`Brake recalc job start: vehicle=${vehicleId} trigger=${trigger}`);
    await this.orchestrator.executeWithLock(job.data);
  }
}
