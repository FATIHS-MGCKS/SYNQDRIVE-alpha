import type { TripTrackingJobData } from './trip-detection.types';
import { TRIP_TRACKING_HANDOFF_KINDS } from './trip-detection.types';

/** Defer handoff successor when per-vehicle worker lock is still held (≤120s TTL). */
export const TRIP_TRACKING_HANDOFF_LOCK_DEFERRAL_MS = 10_000;

/**
 * Thrown when a durable handoff successor cannot acquire the vehicle worker lock.
 * TripTrackingProcessor converts this to BullMQ moveToDelayed(skipAttempt) + DelayedError.
 */
export class TripTrackingHandoffLockContentionError extends Error {
  readonly delayMs: number;

  constructor(delayMs = TRIP_TRACKING_HANDOFF_LOCK_DEFERRAL_MS) {
    super('trip_tracking_handoff_lock_contention');
    this.name = 'TripTrackingHandoffLockContentionError';
    this.delayMs = delayMs;
  }
}

export function isTripTrackingHandoffJob(
  data: Pick<TripTrackingJobData, 'handoffKind'>,
): boolean {
  return data.handoffKind === TRIP_TRACKING_HANDOFF_KINDS.STABLE_SUCCESSOR;
}

export function buildHandoffSuccessorJobData(
  data: TripTrackingJobData,
  primaryJobId: string,
): TripTrackingJobData {
  return {
    ...data,
    handoffKind: TRIP_TRACKING_HANDOFF_KINDS.STABLE_SUCCESSOR,
    handoffPrimaryJobId: primaryJobId,
  };
}
