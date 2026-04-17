import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queue-names';
import { TireHealthService } from '@modules/vehicle-intelligence/tires/tire-health.service';

@Injectable()
@Processor(QUEUE_NAMES.TIRE_RECALCULATION)
export class TireRecalculationProcessor extends WorkerHost {
  private readonly logger = new Logger(TireRecalculationProcessor.name);

  constructor(private readonly tireHealthService: TireHealthService) {
    super();
  }

  async process(job: Job) {
    const { vehicleId } = job.data;
    if (!vehicleId) {
      this.logger.warn('Missing vehicleId in tire recalculation job');
      return;
    }

    try {
      const result = await this.tireHealthService.recalculate(vehicleId);
      if (result) {
        this.logger.debug(
          `Tire health recalculated for vehicle=${vehicleId}: ${result.overallPercent}% (${result.healthStatus})`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Tire recalculation failed for vehicle=${vehicleId}: ${err.message}`,
      );
      // Rethrow so BullMQ marks the job as failed and applies retry/backoff policy.
      throw err;
    }
  }
}
