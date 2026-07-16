import {
  computeExponentialBackoffMs,
  computeNextRetryAt,
  isEligibleForRetry,
  shouldDeadLetter,
} from './driving-intelligence-jobs.retry-policy';
import { DRIVING_INTELLIGENCE_JOB_ERROR_CODES } from './driving-intelligence-jobs.errors';

describe('driving-intelligence-jobs.retry-policy', () => {
  it('applies capped exponential backoff', () => {
    expect(computeExponentialBackoffMs(1)).toBe(10_000);
    expect(computeExponentialBackoffMs(2)).toBe(20_000);
    expect(computeExponentialBackoffMs(3)).toBe(40_000);
    expect(computeExponentialBackoffMs(10)).toBe(300_000);
  });

  it('dead-letters after max attempts', () => {
    expect(shouldDeadLetter(3, 3)).toBe(true);
    expect(shouldDeadLetter(2, 3)).toBe(false);
  });

  it('allows retry for transient provider errors below max attempts', () => {
    expect(
      isEligibleForRetry(2, 3, DRIVING_INTELLIGENCE_JOB_ERROR_CODES.PROVIDER_TRANSIENT),
    ).toBe(true);
  });

  it('rejects retry for permanent validation errors', () => {
    expect(
      isEligibleForRetry(1, 3, DRIVING_INTELLIGENCE_JOB_ERROR_CODES.VALIDATION_FAILED),
    ).toBe(false);
  });

  it('schedules next retry in the future', () => {
    const now = new Date('2026-07-16T10:00:00.000Z');
    const next = computeNextRetryAt(2, now);
    expect(next.getTime()).toBe(now.getTime() + 20_000);
  });
});
