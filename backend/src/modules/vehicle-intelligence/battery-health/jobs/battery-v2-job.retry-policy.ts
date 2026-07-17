import type { BatteryV2JobType } from './battery-v2-job.types';

export interface BatteryV2JobRetryPolicy {
  attempts: number;
  backoffType: 'exponential' | 'fixed';
  backoffDelayMs: number;
}

/**
 * Per-job retry policies — all jobs are designed to be idempotent via `idempotencyKey`.
 */
export const BATTERY_V2_JOB_RETRY_POLICIES: Record<BatteryV2JobType, BatteryV2JobRetryPolicy> = {
  BATTERY_OBSERVATION_CLASSIFY: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelayMs: 5_000,
  },
  BATTERY_REST_TARGET_EVALUATE: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelayMs: 5_000,
  },
  BATTERY_START_PROXY_EXTRACT: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelayMs: 10_000,
  },
  BATTERY_ASSESSMENT_RECOMPUTE: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelayMs: 5_000,
  },
  BATTERY_PUBLICATION_UPDATE: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelayMs: 5_000,
  },
  HV_CAPABILITY_REFRESH: {
    attempts: 2,
    backoffType: 'fixed',
    backoffDelayMs: 15_000,
  },
  HV_RECHARGE_SESSION_RECONCILE: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelayMs: 5_000,
  },
  HV_CAPACITY_SHADOW_RECOMPUTE: {
    attempts: 2,
    backoffType: 'fixed',
    backoffDelayMs: 10_000,
  },
};

export function getBatteryV2JobRetryPolicy(jobType: BatteryV2JobType): BatteryV2JobRetryPolicy {
  return BATTERY_V2_JOB_RETRY_POLICIES[jobType];
}
