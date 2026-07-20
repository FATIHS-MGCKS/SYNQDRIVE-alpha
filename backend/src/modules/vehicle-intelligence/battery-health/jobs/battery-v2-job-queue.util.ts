import { JobsOptions } from 'bullmq';
import {
  BULLMQ_JOB_ID_DEFAULT_MAX_LENGTH,
  isBullMqCompatibleJobId,
  sanitizeBullMqJobId,
} from '@shared/queue/bullmq-job-id.sanitizer';
import type { BatteryV2JobType } from './battery-v2-job.types';
import { getBatteryV2JobRetryPolicy } from './battery-v2-job.retry-policy';

export const BATTERY_V2_JOB_ID_NAMESPACE = 'battery-v2';

/** BullMQ job id derived from the canonical idempotency key (colon-safe, deterministic). */
export function buildBatteryV2JobId(idempotencyKey: string): string {
  return sanitizeBullMqJobId({
    namespace: BATTERY_V2_JOB_ID_NAMESPACE,
    key: idempotencyKey,
    maxLength: BULLMQ_JOB_ID_DEFAULT_MAX_LENGTH,
  });
}

/** Reverse lookup not required — payload carries canonical idempotencyKey. */
export function isDeterministicBatteryV2JobId(idempotencyKey: string, jobId: string): boolean {
  return jobId === buildBatteryV2JobId(idempotencyKey);
}

export function isBatteryV2BullMqJobId(jobId: string): boolean {
  return isBullMqCompatibleJobId(jobId) && jobId.startsWith(`${BATTERY_V2_JOB_ID_NAMESPACE}_`);
}

/** Throws before BullMQ when a non-canonical or colon-bearing job id would be enqueued. */
export function assertBatteryV2BullMqJobId(jobId: string): void {
  if (!isBatteryV2BullMqJobId(jobId)) {
    throw new Error(
      `Battery V2 job id must be built via buildBatteryV2JobId (colon-free BullMQ id): ${jobId}`,
    );
  }
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
