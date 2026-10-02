import { DI_V0_S4_LIMITS } from '../s4a-foundation/di-v0-s4a-contract';

/**
 * Authoritative T10 exhaustion candidate predicate (repository `reapExhausted` parity).
 * status = LEASED ∧ lease_expired ∧ attempt_count >= maxAttempts
 */
export const DI_V0_S4F_T10_EXHAUSTED_SQL_PREDICATE = `status = 'LEASED'
  AND lease_expires_at < clock_timestamp()
  AND attempt_count >= ${DI_V0_S4_LIMITS.maxAttempts}`;

/** Claimable retryable rows exclude attempt exhaustion (T02 claim predicate). */
export const DI_V0_S4F_RETRYABLE_DUE_CLAIMABLE_SQL_PREDICATE = `status = 'FAILED_RETRYABLE'
  AND next_attempt_at <= clock_timestamp()
  AND attempt_count < ${DI_V0_S4_LIMITS.maxAttempts}`;

export function isT10ExhaustedCandidateState(input: {
  status: string;
  leaseExpiresAt: Date | null;
  attemptCount: number;
  now: Date;
}): boolean {
  if (input.status !== 'LEASED' || input.leaseExpiresAt == null) return false;
  return input.leaseExpiresAt.getTime() < input.now.getTime() && input.attemptCount >= DI_V0_S4_LIMITS.maxAttempts;
}
