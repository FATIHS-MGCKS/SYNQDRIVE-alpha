import { JobsOptions } from 'bullmq';
import { createHash } from 'crypto';
import type { BatteryV2JobType } from './battery-v2-job.types';
import { getBatteryV2JobRetryPolicy } from './battery-v2-job.retry-policy';

/** BullMQ custom job ids must not contain ':' — idempotency keys use ':' as a delimiter. */
const JOB_ID_PREFIX = 'battery-v2-';

/** BullMQ job id — deterministic SHA-256 digest of the canonical idempotency key. */
export function buildBatteryV2JobId(idempotencyKey: string): string {
  const hash = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 40);
  return `${JOB_ID_PREFIX}${hash}`;
}

/** Reverse lookup not required — payload carries canonical idempotencyKey. */
export function isDeterministicBatteryV2JobId(idempotencyKey: string, jobId: string): boolean {
  return jobId === buildBatteryV2JobId(idempotencyKey);
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
