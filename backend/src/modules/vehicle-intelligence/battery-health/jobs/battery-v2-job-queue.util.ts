import { JobsOptions } from 'bullmq';
import type { BatteryV2JobType } from './battery-v2-job.types';
import { getBatteryV2JobRetryPolicy } from './battery-v2-job.retry-policy';

/** BullMQ job id — derived from producer idempotency key for deduplication. */
export function buildBatteryV2JobId(idempotencyKey: string): string {
  return `battery-v2:${idempotencyKey}`;
}

export function buildBatteryV2JobOptions(jobType: BatteryV2JobType): JobsOptions {
  const policy = getBatteryV2JobRetryPolicy(jobType);
  return {
    attempts: policy.attempts,
    backoff: {
      type: policy.backoffType,
      delay: policy.backoffDelayMs,
    },
    removeOnComplete: { count: 1_000, age: 7 * 24 * 3600 },
    removeOnFail: { count: 2_000, age: 14 * 24 * 3600 },
  };
}
