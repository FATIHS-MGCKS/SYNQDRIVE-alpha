import type { DrivingIntelligenceJobErrorCode } from './driving-intelligence-jobs.errors';
import { isRetryableErrorCode } from './driving-intelligence-jobs.errors';

export const DRIVING_INTELLIGENCE_JOB_DEFAULT_MAX_ATTEMPTS = 3;
export const DRIVING_INTELLIGENCE_JOB_BASE_BACKOFF_MS = 10_000;
export const DRIVING_INTELLIGENCE_JOB_MAX_BACKOFF_MS = 300_000;

/** Exponential backoff with cap — attempt 1 → 10s, 2 → 20s, 3 → 40s, capped at 5m. */
export function computeExponentialBackoffMs(
  attemptCount: number,
  baseMs = DRIVING_INTELLIGENCE_JOB_BASE_BACKOFF_MS,
  maxMs = DRIVING_INTELLIGENCE_JOB_MAX_BACKOFF_MS,
): number {
  const exponent = Math.max(0, attemptCount - 1);
  return Math.min(baseMs * 2 ** exponent, maxMs);
}

export function shouldDeadLetter(attemptCount: number, maxAttempts: number): boolean {
  return attemptCount >= maxAttempts;
}

export function isEligibleForRetry(
  attemptCount: number,
  maxAttempts: number,
  errorCode: DrivingIntelligenceJobErrorCode | string,
): boolean {
  return !shouldDeadLetter(attemptCount, maxAttempts) && isRetryableErrorCode(errorCode);
}

export function computeNextRetryAt(
  attemptCount: number,
  from: Date = new Date(),
): Date {
  const delayMs = computeExponentialBackoffMs(attemptCount);
  return new Date(from.getTime() + delayMs);
}
