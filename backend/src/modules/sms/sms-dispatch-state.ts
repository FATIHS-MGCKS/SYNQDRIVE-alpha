import { SmsMessage, SmsMessageDeliveryStatus } from '@prisma/client';
import { SENT_DM_IDEMPOTENCY_WINDOW_MS } from './sms.constants';

/** Statuses that must never re-enter provider dispatch. */
export const SMS_NON_RECLAIMABLE_DISPATCH_STATUSES: ReadonlySet<SmsMessageDeliveryStatus> = new Set([
  SmsMessageDeliveryStatus.QUEUED,
  SmsMessageDeliveryStatus.SENT,
  SmsMessageDeliveryStatus.DELIVERED,
  SmsMessageDeliveryStatus.FAILED,
  SmsMessageDeliveryStatus.BLOCKED,
]);

/** Immutable sent.dm idempotency window anchor. Null until first provider dispatch claim. */
export function getSmsIdempotencyAnchorAt(
  message: Pick<SmsMessage, 'firstDispatchAttemptedAt'>,
): Date | null {
  return message.firstDispatchAttemptedAt;
}

export function isWithinSentDmIdempotencyWindow(
  anchorAt: Date,
  now: Date = new Date(),
): boolean {
  return now.getTime() - anchorAt.getTime() <= SENT_DM_IDEMPOTENCY_WINDOW_MS;
}

export function isSmsDispatchReclaimableStatus(status: SmsMessageDeliveryStatus): boolean {
  return (
    status === SmsMessageDeliveryStatus.PENDING
    || status === SmsMessageDeliveryStatus.DISPATCHING
    || status === SmsMessageDeliveryStatus.DISPATCH_AMBIGUOUS
  );
}

export function buildIdempotencyWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - SENT_DM_IDEMPOTENCY_WINDOW_MS);
}

export type SmsProviderDispatchEligibility =
  | { eligible: true }
  | { eligible: false; reason: 'missing_idempotency_anchor' | 'idempotency_expired' };

/**
 * PENDING rows without a first anchor may still be initially claimed.
 * Reclaims require an immutable first anchor and must be within the 24h window.
 */
export function evaluateSmsProviderDispatchEligibility(
  message: Pick<SmsMessage, 'status' | 'firstDispatchAttemptedAt'>,
  now: Date = new Date(),
): SmsProviderDispatchEligibility {
  if (message.status === SmsMessageDeliveryStatus.PENDING) {
    return { eligible: true };
  }

  const anchor = getSmsIdempotencyAnchorAt(message);
  if (!anchor) {
    return { eligible: false, reason: 'missing_idempotency_anchor' };
  }
  if (!isWithinSentDmIdempotencyWindow(anchor, now)) {
    return { eligible: false, reason: 'idempotency_expired' };
  }
  return { eligible: true };
}
