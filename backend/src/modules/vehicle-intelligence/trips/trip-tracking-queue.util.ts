import type { JobsOptions } from 'bullmq';

import {
  TRIP_TRACKING_TRIGGERS,
  type TripTrackingJobData,
  type TripTrackingTrigger,
} from './trip-detection.types';
import { POSSIBLE_START_TRIP_TRACKING_RETRY_POLICY } from './trip-tracking-retry.policy';
import { buildHandoffSuccessorJobData } from './trip-tracking-lock-contention';

const DEFAULT_TRIP_TRACKING_JOB_OPTIONS: JobsOptions = {
  removeOnComplete: true,
  removeOnFail: 5,
};

export type TripTrackingQueueJobState = string;

export interface TripTrackingQueueJobRef {
  getState(): Promise<TripTrackingQueueJobState>;
  remove(): Promise<void>;
}

export interface TripTrackingQueueLike {
  getJob(jobId: string): Promise<TripTrackingQueueJobRef | undefined>;
  add(
    name: string,
    data: TripTrackingJobData,
    opts: JobsOptions & { jobId: string; delay?: number },
  ): Promise<unknown>;
}

export type StableTripTrackingEnqueueOutcome =
  | 'primary'
  | 'successor'
  | 'skipped'
  | 'preempted';

export type RecoveryTripTrackingEnqueueOutcome = 'enqueued' | 'skipped';

/** Jobs that may be physically removed for recycle/preemption. */
export type TripTrackingRemovableQueueState =
  | 'waiting'
  | 'delayed'
  | 'prioritized'
  | 'completed'
  | 'failed';

/** Jobs owned by a worker lock — never remove for preemption. */
export type TripTrackingPreservedActiveQueueState = 'active' | 'waiting-children';

export type CancelPendingTripTrackingJobsResult = {
  /** Queued or terminal jobs physically removed. */
  removed: number;
  /** Active / waiting-children jobs left in place (no remove attempted). */
  activePreserved: number;
};

function isRemovableQueueState(state: TripTrackingQueueJobState): boolean {
  return isTerminalQueueState(state) || isQueuedQueueState(state);
}

async function removeRemovableTripTrackingSlot(
  queue: TripTrackingQueueLike,
  jobId: string,
): Promise<'removed' | 'active_preserved' | 'absent'> {
  const existing = await queue.getJob(jobId);
  if (!existing) return 'absent';
  const state = await existing.getState();
  if (isActiveQueueState(state)) {
    return 'active_preserved';
  }
  if (isRemovableQueueState(state)) {
    await existing.remove();
    return 'removed';
  }
  return 'absent';
}

/** @deprecated internal alias — only removes removable slots, never active jobs. */
async function removeQueuedTripTrackingSlot(
  queue: TripTrackingQueueLike,
  jobId: string,
): Promise<void> {
  await removeRemovableTripTrackingSlot(queue, jobId);
}

/**
 * Deterministic successor slot used while the primary stable jobId is ACTIVE.
 * R3A: durable handoff without one-shot setImmediate races.
 */
export function buildTripTrackingSuccessorJobId(primaryJobId: string): string {
  return `${primaryJobId}__succ`;
}

export function buildTripRecoveryJobId(vehicleId: string): string {
  return `trip-recovery-${vehicleId}`;
}

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

function isDuplicateJobIdError(err: unknown): boolean {
  const msg = (err as Error).message ?? '';
  return (
    msg.toLowerCase().includes('duplicate') ||
    msg.toLowerCase().includes('already exists')
  );
}

function isTerminalQueueState(state: TripTrackingQueueJobState): boolean {
  return state === 'failed' || state === 'completed';
}

function isQueuedQueueState(state: TripTrackingQueueJobState): boolean {
  return state === 'waiting' || state === 'delayed' || state === 'prioritized';
}

/**
 * Removes queued/terminal primary/successor trip-tracking jobs only.
 * Active / waiting-children jobs are preserved — never calls Job.remove() on them.
 * Used when an end-cycle is cancelled (e.g. activity resumed) so stale queued
 * FINALIZE jobs cannot close a trip that continued; active jobs rely on AUD-007
 * stale-token guards at execution time.
 */
export async function cancelPendingTripTrackingJobs(params: {
  queue: TripTrackingQueueLike;
  jobIds: string[];
}): Promise<CancelPendingTripTrackingJobsResult> {
  let removed = 0;
  let activePreserved = 0;
  for (const primaryId of params.jobIds) {
    for (const jobId of [primaryId, buildTripTrackingSuccessorJobId(primaryId)]) {
      const outcome = await removeRemovableTripTrackingSlot(params.queue, jobId);
      if (outcome === 'removed') removed += 1;
      if (outcome === 'active_preserved') activePreserved += 1;
    }
  }
  return { removed, activePreserved };
}

/**
 * Recycles only removable (queued/terminal) end-cycle slots before enqueue.
 * Active primaries flow through stable-slot successor/handoff semantics.
 */
export async function recycleRemovableEndCycleTripTrackingJobs(params: {
  queue: TripTrackingQueueLike;
  jobIds: string[];
}): Promise<CancelPendingTripTrackingJobsResult> {
  return cancelPendingTripTrackingJobs(params);
}

/**
 * R10/R12: recycle removable end-cycle slots then enqueue via stable-slot ownership.
 * Never attempts Job.remove() on active / waiting-children jobs (multi-replica safe).
 */
export async function enqueueEndCycleTripTrackingJob(params: {
  queue: TripTrackingQueueLike;
  jobName: string;
  jobId: string;
  data: TripTrackingJobData;
  trigger: TripTrackingTrigger;
  delayMs?: number;
}): Promise<StableTripTrackingEnqueueOutcome> {
  const existingPrimary = await params.queue.getJob(params.jobId);
  if (existingPrimary) {
    const primaryState = await existingPrimary.getState();
    if (isActiveQueueState(primaryState)) {
      // Active owner — handoff/skip only; never recycle primary or queued successor.
      return enqueueStableTripTrackingJob({
        queue: params.queue,
        jobName: params.jobName,
        jobId: params.jobId,
        data: params.data,
        trigger: params.trigger,
        delayMs: params.delayMs,
      });
    }
  }

  await recycleRemovableEndCycleTripTrackingJobs({
    queue: params.queue,
    jobIds: [params.jobId],
  });
  return enqueueStableTripTrackingJob({
    queue: params.queue,
    jobName: params.jobName,
    jobId: params.jobId,
    data: params.data,
    trigger: params.trigger,
    delayMs: params.delayMs,
  });
}

function isActiveQueueState(state: TripTrackingQueueJobState): boolean {
  return state === 'active' || state === 'waiting-children';
}

async function enqueueIntoStableSlot(params: {
  queue: TripTrackingQueueLike;
  jobName: string;
  jobId: string;
  primaryJobId: string;
  data: TripTrackingJobData;
  trigger: TripTrackingTrigger;
  delayMs: number;
}): Promise<'successor' | 'skipped'> {
  const handoffData = buildHandoffSuccessorJobData(params.data, params.primaryJobId);
  const existing = await params.queue.getJob(params.jobId);
  if (existing) {
    const state = await existing.getState();
    if (isTerminalQueueState(state)) {
      await existing.remove();
    } else if (isQueuedQueueState(state) || isActiveQueueState(state)) {
      return 'skipped';
    }
  }

  try {
    await params.queue.add(params.jobName, handoffData, {
      jobId: params.jobId,
      delay: params.delayMs,
      ...buildTripTrackingJobOptions(params.trigger),
    });
    return 'successor';
  } catch (err: unknown) {
    if (isDuplicateJobIdError(err)) {
      return 'skipped';
    }
    throw err;
  }
}

/**
 * R11: recycle a delayed/waiting stable slot when wake or urgent check must
 * precede an empty-core backoff job. End-cycle jobs use enqueueEndCycleTripTrackingJob.
 */
export async function enqueuePreemptiveTripTrackingJob(params: {
  queue: TripTrackingQueueLike;
  jobName: string;
  jobId: string;
  data: TripTrackingJobData;
  trigger: TripTrackingTrigger;
  delayMs?: number;
}): Promise<StableTripTrackingEnqueueOutcome> {
  const delayMs = params.delayMs ?? 0;
  const existingPrimary = await params.queue.getJob(params.jobId);

  if (existingPrimary) {
    const state = await existingPrimary.getState();
    if (isTerminalQueueState(state)) {
      await existingPrimary.remove();
    } else if (isQueuedQueueState(state)) {
      await removeQueuedTripTrackingSlot(params.queue, params.jobId);
      await removeQueuedTripTrackingSlot(
        params.queue,
        buildTripTrackingSuccessorJobId(params.jobId),
      );
    } else if (isActiveQueueState(state)) {
      const outcome = await enqueueIntoStableSlot({
        queue: params.queue,
        jobName: params.jobName,
        jobId: buildTripTrackingSuccessorJobId(params.jobId),
        primaryJobId: params.jobId,
        data: params.data,
        trigger: params.trigger,
        delayMs,
      });
      return outcome;
    }
  }

  try {
    await params.queue.add(params.jobName, params.data, {
      jobId: params.jobId,
      delay: delayMs,
      ...buildTripTrackingJobOptions(params.trigger),
    });
    return existingPrimary ? 'preempted' : 'primary';
  } catch (err: unknown) {
    if (isDuplicateJobIdError(err)) {
      return 'skipped';
    }
    throw err;
  }
}

/**
 * Stable per-vehicle/phase/trip enqueue with durable ACTIVE self-reschedule handoff.
 */
export async function enqueueStableTripTrackingJob(params: {
  queue: TripTrackingQueueLike;
  jobName: string;
  jobId: string;
  data: TripTrackingJobData;
  trigger: TripTrackingTrigger;
  delayMs?: number;
}): Promise<StableTripTrackingEnqueueOutcome> {
  const delayMs = params.delayMs ?? 0;
  const existingPrimary = await params.queue.getJob(params.jobId);

  if (existingPrimary) {
    const state = await existingPrimary.getState();
    if (isTerminalQueueState(state)) {
      await existingPrimary.remove();
    } else if (isQueuedQueueState(state)) {
      return 'skipped';
    } else if (isActiveQueueState(state)) {
      const outcome = await enqueueIntoStableSlot({
        queue: params.queue,
        jobName: params.jobName,
        jobId: buildTripTrackingSuccessorJobId(params.jobId),
        primaryJobId: params.jobId,
        data: params.data,
        trigger: params.trigger,
        delayMs,
      });
      return outcome;
    }
  }

  try {
    await params.queue.add(params.jobName, params.data, {
      jobId: params.jobId,
      delay: delayMs,
      ...buildTripTrackingJobOptions(params.trigger),
    });
    return 'primary';
  } catch (err: unknown) {
    if (isDuplicateJobIdError(err)) {
      return 'skipped';
    }
    throw err;
  }
}

/**
 * Recovery scheduler wake enqueue with terminal FAILED/COMPLETED recycling.
 */
export async function enqueueRecoveryTripTrackingJob(params: {
  queue: TripTrackingQueueLike;
  vehicleId: string;
  jobName: string;
  data: TripTrackingJobData;
  trigger: TripTrackingTrigger;
}): Promise<RecoveryTripTrackingEnqueueOutcome> {
  const jobId = buildTripRecoveryJobId(params.vehicleId);
  const existing = await params.queue.getJob(jobId);

  if (existing) {
    const state = await existing.getState();
    if (isTerminalQueueState(state)) {
      await existing.remove();
    } else if (isQueuedQueueState(state) || isActiveQueueState(state)) {
      return 'skipped';
    }
  }

  try {
    await params.queue.add(params.jobName, params.data, {
      jobId,
      ...buildTripTrackingJobOptions(params.trigger),
    });
    return 'enqueued';
  } catch (err: unknown) {
    if (isDuplicateJobIdError(err)) {
      return 'skipped';
    }
    throw err;
  }
}

/**
 * Legacy one-shot setImmediate self-reschedule (pre-R3A). Used only to prove
 * the race in regression tests — not production scheduling.
 */
export async function simulateLegacyActiveSelfReschedule(params: {
  queue: TripTrackingQueueLike;
  jobName: string;
  jobId: string;
  data: TripTrackingJobData;
  trigger: TripTrackingTrigger;
  delayMs?: number;
  flushDeferred?: () => Promise<void>;
}): Promise<'primary' | 'skipped'> {
  const delayMs = params.delayMs ?? 0;
  const existing = await params.queue.getJob(params.jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'active') {
      await new Promise<void>((resolve) => {
        setImmediate(async () => {
          const retryExisting = await params.queue.getJob(params.jobId);
          if (retryExisting && (await retryExisting.getState()) === 'active') {
            resolve();
            return;
          }
          await params.queue.add(params.jobName, params.data, {
            jobId: params.jobId,
            delay: delayMs,
            ...buildTripTrackingJobOptions(params.trigger),
          });
          resolve();
        });
      });
      if (params.flushDeferred) {
        await params.flushDeferred();
      }
      return 'skipped';
    }
  }

  await params.queue.add(params.jobName, params.data, {
    jobId: params.jobId,
    delay: delayMs,
    ...buildTripTrackingJobOptions(params.trigger),
  });
  return 'primary';
}
