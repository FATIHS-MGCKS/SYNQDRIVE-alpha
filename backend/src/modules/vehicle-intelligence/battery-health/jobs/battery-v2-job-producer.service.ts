import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
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
import { validateBatteryV2JobIdempotencyKey } from './battery-v2-job-idempotency.validation';
import { buildBatteryV2JobId, buildBatteryV2JobOptions } from './battery-v2-job-queue.util';
import { getBatteryV2JobRetryPolicy } from './battery-v2-job.retry-policy';

export type BatteryV2JobEnqueueInput<T extends BatteryV2JobType> = Omit<
  BatteryV2JobPayload<T>,
  'modelVersion' | 'attemptContext' | 'requestedAt' | 'correlationId'
> & {
  requestedAt?: string;
  correlationId?: string;
};

export interface BatteryV2JobEnqueueOptions {
  delayMs?: number;
}

export function isDuplicateBatteryV2JobError(err: unknown): boolean {
  const message = (err as Error)?.message?.toLowerCase() ?? '';
  return message.includes('already exists') || message.includes('jobid already exists');
}

@Injectable()
export class BatteryV2JobProducerService {
  private readonly logger = new Logger(BatteryV2JobProducerService.name);

  constructor(@InjectQueue(QUEUE_NAMES.BATTERY_V2) private readonly queue: Queue) {}

  async enqueue<T extends BatteryV2JobType>(
    jobType: T,
    input: BatteryV2JobEnqueueInput<T>,
    options: BatteryV2JobEnqueueOptions = {},
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
    validateBatteryV2JobIdempotencyKey(jobType, payload.idempotencyKey);

    const jobId = buildBatteryV2JobId(payload.idempotencyKey);
    return this.addIdempotent(jobType, payload, jobId, {
      ...buildBatteryV2JobOptions(jobType),
      delay: options.delayMs ?? 0,
    });
  }

  private async addIdempotent(
    jobType: BatteryV2JobType,
    payload: BatteryV2JobPayload,
    jobId: string,
    options: Parameters<Queue['add']>[2],
  ): Promise<string> {
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'delayed' || state === 'active' || state === 'prioritized') {
        this.logger.debug(`Battery V2 job already queued: ${jobId} (${state})`);
        return jobId;
      }
    }

    try {
      await this.queue.add(jobType, payload, { ...options, jobId });
      return jobId;
    } catch (err) {
      if (isDuplicateBatteryV2JobError(err)) {
        this.logger.debug(`Battery V2 duplicate job suppressed: ${jobId}`);
        return jobId;
      }
      this.logger.error(
        `Battery V2 enqueue failed for ${jobType} jobId=${jobId}: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
