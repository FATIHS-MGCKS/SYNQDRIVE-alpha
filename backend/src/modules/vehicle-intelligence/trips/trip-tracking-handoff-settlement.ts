import type { TripTrackingJobData } from './trip-detection.types';
import {
  TRIP_TRACKING_HANDOFF_LOCK_DEFERRAL_MS,
  isTripTrackingHandoffJob,
} from './trip-tracking-lock-contention';
import type { TripTrackingQueueLike } from './trip-tracking-queue.util';

/** BullMQ states that still occupy the primary two-slot generation. */
export const HANDOFF_PREDECESSOR_UNSETTLED_STATES = [
  'active',
  'waiting',
  'delayed',
  'prioritized',
  'waiting-children',
] as const;

/** Terminal predecessor states that free the primary slot for the successor generation. */
export const HANDOFF_PREDECESSOR_SETTLED_TERMINAL_STATES = [
  'completed',
  'failed',
] as const;

export type HandoffPredecessorUnsettledState =
  (typeof HANDOFF_PREDECESSOR_UNSETTLED_STATES)[number];

export type HandoffPredecessorSettledTerminalState =
  (typeof HANDOFF_PREDECESSOR_SETTLED_TERMINAL_STATES)[number];

export function isHandoffPredecessorUnsettledState(state: string): boolean {
  return (HANDOFF_PREDECESSOR_UNSETTLED_STATES as readonly string[]).includes(
    state,
  );
}

export function isHandoffPredecessorSettledTerminalState(state: string): boolean {
  return (
    HANDOFF_PREDECESSOR_SETTLED_TERMINAL_STATES as readonly string[]
  ).includes(state);
}

/**
 * Thrown when a durable handoff successor runs before its predecessor BullMQ job
 * has reached a terminal or absent state. TripTrackingProcessor converts this to
 * moveToDelayed(timestamp, token) + DelayedError (same semantics as lock contention).
 */
export class TripTrackingHandoffPredecessorNotSettledError extends Error {
  readonly delayMs: number;

  constructor(delayMs = TRIP_TRACKING_HANDOFF_LOCK_DEFERRAL_MS) {
    super('trip_tracking_handoff_predecessor_not_settled');
    this.name = 'TripTrackingHandoffPredecessorNotSettledError';
    this.delayMs = delayMs;
  }
}

/**
 * Gate stable_successor jobs until handoffPrimaryJobId is absent or terminal.
 * Must run before orchestration; R3B vehicle-lock contention remains downstream.
 */
export async function assertHandoffPredecessorSettled(
  data: TripTrackingJobData,
  queue: TripTrackingQueueLike,
): Promise<void> {
  if (!isTripTrackingHandoffJob(data)) {
    return;
  }

  const primaryJobId = data.handoffPrimaryJobId;
  if (!primaryJobId) {
    return;
  }

  const predecessor = await queue.getJob(primaryJobId);
  if (!predecessor) {
    return;
  }

  const state = await predecessor.getState();
  if (isHandoffPredecessorUnsettledState(state)) {
    throw new TripTrackingHandoffPredecessorNotSettledError();
  }
}
