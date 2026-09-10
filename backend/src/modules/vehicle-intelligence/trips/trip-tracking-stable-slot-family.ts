import type { TripTrackingQueueJobState, TripTrackingQueueLike } from './trip-tracking-queue.util';
import { buildTripTrackingSuccessorJobId } from './trip-tracking-queue.util';

export type StableSlotMemberState = TripTrackingQueueJobState | 'absent';

export type StableSlotFamilySnapshot = {
  primaryJobId: string;
  successorJobId: string;
  primaryState: StableSlotMemberState;
  successorState: StableSlotMemberState;
};

export type StableSlotFamilyAction =
  | 'skip_active_successor'
  | 'handoff_to_successor'
  | 'skip_queued_successor'
  | 'skip_queued_primary'
  | 'recycle_terminal_enqueue_primary'
  | 'enqueue_primary';

function isTerminalQueueState(state: StableSlotMemberState): boolean {
  return state === 'failed' || state === 'completed';
}

function isQueuedQueueState(state: StableSlotMemberState): boolean {
  return state === 'waiting' || state === 'delayed' || state === 'prioritized';
}

function isActiveQueueState(state: StableSlotMemberState): boolean {
  return state === 'active' || state === 'waiting-children';
}

export async function inspectStableSlotFamily(
  queue: TripTrackingQueueLike,
  primaryJobId: string,
): Promise<StableSlotFamilySnapshot> {
  const successorJobId = buildTripTrackingSuccessorJobId(primaryJobId);
  const [primaryJob, successorJob] = await Promise.all([
    queue.getJob(primaryJobId),
    queue.getJob(successorJobId),
  ]);
  return {
    primaryJobId,
    successorJobId,
    primaryState: primaryJob ? await primaryJob.getState() : 'absent',
    successorState: successorJob ? await successorJob.getState() : 'absent',
  };
}

/** Pure planner for stable-slot family arbitration (RED-B matrix). */
export function planStableSlotFamilyEnqueue(
  family: StableSlotFamilySnapshot,
): StableSlotFamilyAction {
  if (isActiveQueueState(family.successorState)) {
    return 'skip_active_successor';
  }
  if (isQueuedQueueState(family.successorState)) {
    return 'skip_queued_successor';
  }
  if (isActiveQueueState(family.primaryState)) {
    return 'handoff_to_successor';
  }
  if (isQueuedQueueState(family.primaryState)) {
    return 'skip_queued_primary';
  }
  if (isTerminalQueueState(family.primaryState)) {
    return 'recycle_terminal_enqueue_primary';
  }
  return 'enqueue_primary';
}

export function stableSlotFamilyHasFutureAuthority(
  family: StableSlotFamilySnapshot,
): boolean {
  return (
    isActiveQueueState(family.primaryState) ||
    isActiveQueueState(family.successorState) ||
    isQueuedQueueState(family.primaryState) ||
    isQueuedQueueState(family.successorState)
  );
}
