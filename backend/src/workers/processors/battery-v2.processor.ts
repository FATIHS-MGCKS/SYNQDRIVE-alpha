import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { BatteryV2JobHandlerRegistry } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-handler.registry';
import {
  isBatteryV2JobType,
  validateBatteryV2JobPayload,
  BatteryV2JobValidationError,
} from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job.validation';
import type { BatteryV2JobPayload, BatteryV2JobType } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job.types';

@Injectable()
@Processor(QUEUE_NAMES.BATTERY_V2, {
  concurrency: 2,
  lockDuration: 180_000,
})
export class BatteryV2Processor extends WorkerHost {
  private readonly logger = new Logger(BatteryV2Processor.name);

  constructor(private readonly handlerRegistry: BatteryV2JobHandlerRegistry) {
    super();
  }

  async process(job: Job<BatteryV2JobPayload>): Promise<void> {
    const jobType = job.name;
    if (!isBatteryV2JobType(jobType)) {
      throw new BatteryV2JobValidationError(`Unknown Battery V2 job name: ${job.name}`, 'jobType');
    }

    const payload = validateBatteryV2JobPayload(jobType, job.data);
    const attempt = job.attemptsMade + 1;

    try {
      await this.handlerRegistry.dispatch(jobType as BatteryV2JobType, payload);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      if (attempt < (job.opts.attempts ?? 1)) {
        this.logger.warn(
          `Battery V2 job ${jobType} retrying (${attempt}/${job.opts.attempts}): ${message}`,
        );
      } else {
        this.logger.error(
          `Battery V2 job ${jobType} failed after ${attempt} attempts: ${message}`,
        );
      }
      throw err;
    }
  }
}
