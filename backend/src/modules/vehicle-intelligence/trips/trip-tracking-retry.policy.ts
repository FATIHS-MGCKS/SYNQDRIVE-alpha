export interface TripTrackingRetryPolicy {
  attempts: number;
  backoffType: 'exponential' | 'fixed';
  backoffDelayMs: number;
}

/**
 * R3: bounded fast BullMQ retry for POSSIBLE_START execution failures.
 * Does not extend the R1 confirmation budget — retries reuse persisted clocks.
 */
export const POSSIBLE_START_TRIP_TRACKING_RETRY_POLICY: TripTrackingRetryPolicy = {
  attempts: 4,
  backoffType: 'exponential',
  backoffDelayMs: 5_000,
};
