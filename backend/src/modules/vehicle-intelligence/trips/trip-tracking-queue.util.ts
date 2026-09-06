import type { JobsOptions } from 'bullmq';

import {
  TRIP_TRACKING_TRIGGERS,
  type TripTrackingTrigger,
} from './trip-detection.types';
import { POSSIBLE_START_TRIP_TRACKING_RETRY_POLICY } from './trip-tracking-retry.policy';

const DEFAULT_TRIP_TRACKING_JOB_OPTIONS: JobsOptions = {
  removeOnComplete: true,
  removeOnFail: 5,
};

/**
 * BullMQ job options for trip-tracking queue producers.
 * POSSIBLE_START receives bounded fast retry (R3); other phases unchanged.
 */
export function buildTripTrackingJobOptions(
  trigger: TripTrackingTrigger,
  overrides?: Partial<JobsOptions>,
): JobsOptions {
  const base: JobsOptions = {
    ...DEFAULT_TRIP_TRACKING_JOB_OPTIONS,
    ...overrides,
  };

  if (trigger !== TRIP_TRACKING_TRIGGERS.POSSIBLE_START) {
    return base;
  }

  const policy = POSSIBLE_START_TRIP_TRACKING_RETRY_POLICY;
  return {
    ...base,
    attempts: policy.attempts,
    backoff: {
      type: policy.backoffType,
      delay: policy.backoffDelayMs,
    },
  };
}
