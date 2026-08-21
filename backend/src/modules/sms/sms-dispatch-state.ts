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

/** Authoritative anchor for sent.dm Idempotency-Key reuse window. */
export function getSmsIdempotencyAnchorAt(
  message: Pick<SmsMessage, 'dispatchAttemptedAt' | 'createdAt'>,
): Date {
  return message.dispatchAttemptedAt ?? message.createdAt;
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
