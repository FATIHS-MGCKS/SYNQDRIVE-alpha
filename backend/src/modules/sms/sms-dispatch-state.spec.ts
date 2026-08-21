import { SmsMessageDeliveryStatus } from '@prisma/client';
import {
  buildIdempotencyWindowStart,
  evaluateSmsProviderDispatchEligibility,
  getSmsIdempotencyAnchorAt,
  isSmsDispatchReclaimableStatus,
  isWithinSentDmIdempotencyWindow,
  SMS_NON_RECLAIMABLE_DISPATCH_STATUSES,
} from './sms-dispatch-state';
import { SENT_DM_IDEMPOTENCY_WINDOW_MS } from './sms.constants';

describe('sms-dispatch-state', () => {
  const anchor = new Date('2026-08-21T10:00:00Z');

  it('uses firstDispatchAttemptedAt as idempotency anchor when present', () => {
    expect(
      getSmsIdempotencyAnchorAt({ firstDispatchAttemptedAt: anchor }),
    ).toEqual(anchor);
  });

  it('returns null anchor when firstDispatchAttemptedAt is unset', () => {
    expect(getSmsIdempotencyAnchorAt({ firstDispatchAttemptedAt: null })).toBeNull();
  });

  it('treats anchor within 24h as inside idempotency window', () => {
    const now = new Date(anchor.getTime() + SENT_DM_IDEMPOTENCY_WINDOW_MS);
    expect(isWithinSentDmIdempotencyWindow(anchor, now)).toBe(true);
  });

  it('treats anchor older than 24h as outside idempotency window', () => {
    const now = new Date(anchor.getTime() + SENT_DM_IDEMPOTENCY_WINDOW_MS + 1);
    expect(isWithinSentDmIdempotencyWindow(anchor, now)).toBe(false);
  });

  it('buildIdempotencyWindowStart subtracts 24h from now', () => {
    const now = new Date('2026-08-21T12:00:00Z');
    expect(buildIdempotencyWindowStart(now).toISOString()).toBe('2026-08-20T12:00:00.000Z');
  });

  it('allows PENDING without first anchor regardless of row age', () => {
    expect(
      evaluateSmsProviderDispatchEligibility({
        status: SmsMessageDeliveryStatus.PENDING,
        firstDispatchAttemptedAt: null,
      }),
    ).toEqual({ eligible: true });
  });

  it('rejects DISPATCHING without first anchor', () => {
    expect(
      evaluateSmsProviderDispatchEligibility({
        status: SmsMessageDeliveryStatus.DISPATCHING,
        firstDispatchAttemptedAt: null,
      }),
    ).toEqual({ eligible: false, reason: 'missing_idempotency_anchor' });
  });

  it('rejects reclaim when first anchor is outside 24h window', () => {
    const expiredAnchor = new Date(Date.now() - SENT_DM_IDEMPOTENCY_WINDOW_MS - 1);
    expect(
      evaluateSmsProviderDispatchEligibility({
        status: SmsMessageDeliveryStatus.DISPATCH_AMBIGUOUS,
        firstDispatchAttemptedAt: expiredAnchor,
      }),
    ).toEqual({ eligible: false, reason: 'idempotency_expired' });
  });

  it('marks reclaimable dispatch statuses', () => {
    expect(isSmsDispatchReclaimableStatus(SmsMessageDeliveryStatus.PENDING)).toBe(true);
    expect(isSmsDispatchReclaimableStatus(SmsMessageDeliveryStatus.DISPATCHING)).toBe(true);
    expect(isSmsDispatchReclaimableStatus(SmsMessageDeliveryStatus.DISPATCH_AMBIGUOUS)).toBe(true);
  });

  it('marks terminal and post-acceptance statuses as non-reclaimable', () => {
    for (const status of [
      SmsMessageDeliveryStatus.QUEUED,
      SmsMessageDeliveryStatus.SENT,
      SmsMessageDeliveryStatus.DELIVERED,
      SmsMessageDeliveryStatus.FAILED,
      SmsMessageDeliveryStatus.BLOCKED,
    ]) {
      expect(SMS_NON_RECLAIMABLE_DISPATCH_STATUSES.has(status)).toBe(true);
      expect(isSmsDispatchReclaimableStatus(status)).toBe(false);
    }
  });
});
