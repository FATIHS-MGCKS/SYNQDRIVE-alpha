import { JobsOptions } from 'bullmq';
import { createHash } from 'crypto';
import type { BatteryV2JobType } from './battery-v2-job.types';
import { getBatteryV2JobRetryPolicy } from './battery-v2-job.retry-policy';

const JOB_ID_PREFIX = 'battery-v2-';
const JOB_ID_MAX_LEN = 128;

/** BullMQ rejects ":" in custom job ids — normalize idempotency key segments. */
function sanitizeIdempotencyKeyForJobId(idempotencyKey: string): string {
  return idempotencyKey.replace(/:/g, '-');
}

/** BullMQ job id — deterministic hash when idempotency key exceeds safe length. */
export function buildBatteryV2JobId(idempotencyKey: string): string {
  const sanitizedKey = sanitizeIdempotencyKeyForJobId(idempotencyKey);
  const direct = `${JOB_ID_PREFIX}${sanitizedKey}`;
  if (direct.length <= JOB_ID_MAX_LEN) {
    return direct;
  }
  const hash = createHash('sha256').update(sanitizedKey).digest('hex').slice(0, 40);
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
