import type { RawRefuelCandidateRecoveryLastOutcome } from '@prisma/client';

export const RAW_REFUEL_CANDIDATE_RECOVERY_MIN_BACKOFF_MS = 5 * 60 * 1000;
export const RAW_REFUEL_CANDIDATE_RECOVERY_MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;

export type RawRefuelCandidateRecoveryOutcome =
  RawRefuelCandidateRecoveryLastOutcome;

/** Exponential backoff capped — durable retry without permanent terminalization. */
export function computeRawRefuelCandidateRecoveryBackoffMs(
  recoveryAttemptCount: number,
): number {
  const attemptNumber = Math.max(recoveryAttemptCount, 0);
  const exponent = Math.min(Math.max(attemptNumber - 1, 0), 8);
  const scaled =
    RAW_REFUEL_CANDIDATE_RECOVERY_MIN_BACKOFF_MS * Math.pow(2, exponent);
  return Math.min(scaled, RAW_REFUEL_CANDIDATE_RECOVERY_MAX_BACKOFF_MS);
}

export function scheduleRecoveryNextAttemptAt(
  from: Date,
  recoveryAttemptCount: number,
): Date {
  return new Date(
    from.getTime() + computeRawRefuelCandidateRecoveryBackoffMs(recoveryAttemptCount),
  );
}
