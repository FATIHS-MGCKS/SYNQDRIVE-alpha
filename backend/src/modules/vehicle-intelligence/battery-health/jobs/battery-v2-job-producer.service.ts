import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import {
  BATTERY_V2_JOB_MODEL_VERSION_DEFAULT,
  type BatteryV2JobPayload,
  type BatteryV2JobType,
} from './battery-v2-job.types';
import {
  buildBatteryV2AttemptContext,
  validateBatteryV2JobPayload,
} from './battery-v2-job.validation';
import { buildBatteryV2JobId, buildBatteryV2JobOptions } from './battery-v2-job-queue.util';
import { getBatteryV2JobRetryPolicy } from './battery-v2-job.retry-policy';

export type BatteryV2JobEnqueueInput<T extends BatteryV2JobType> = Omit<
  BatteryV2JobPayload<T>,
  'modelVersion' | 'attemptContext' | 'requestedAt'
> & {
  requestedAt?: string;
  correlationId?: string;
};

@Injectable()
export class BatteryV2JobProducerService {
  private readonly logger = new Logger(BatteryV2JobProducerService.name);

  constructor(@InjectQueue(QUEUE_NAMES.BATTERY_V2) private readonly queue: Queue) {}

  async enqueue<T extends BatteryV2JobType>(
    jobType: T,
    input: BatteryV2JobEnqueueInput<T>,
  ): Promise<string | null> {
    if (!canEnqueueQueue(this.logger, 'battery-v2')) {
      return null;
    }

    const policy = getBatteryV2JobRetryPolicy(jobType);
    const payload = validateBatteryV2JobPayload(jobType, {
      ...input,
      modelVersion: BATTERY_V2_JOB_MODEL_VERSION_DEFAULT,
      requestedAt: input.requestedAt ?? new Date().toISOString(),
      correlationId: input.correlationId ?? randomUUID(),
      attemptContext: buildBatteryV2AttemptContext({
        maxAttempts: policy.attempts,
      }),
    });

    const jobId = buildBatteryV2JobId(payload.idempotencyKey);
    await this.queue.add(jobType, payload, {
      ...buildBatteryV2JobOptions(jobType),
      jobId,
    });

    return jobId;
  }
}
