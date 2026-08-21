import { SmsMessageDeliveryStatus } from '@prisma/client';
import {
  buildIdempotencyWindowStart,
  getSmsIdempotencyAnchorAt,
  isSmsDispatchReclaimableStatus,
  isWithinSentDmIdempotencyWindow,
  SMS_NON_RECLAIMABLE_DISPATCH_STATUSES,
} from './sms-dispatch-state';
import { SENT_DM_IDEMPOTENCY_WINDOW_MS } from './sms.constants';

describe('sms-dispatch-state', () => {
  const anchor = new Date('2026-08-21T10:00:00Z');

  it('uses dispatchAttemptedAt as idempotency anchor when present', () => {
    const createdAt = new Date('2026-08-20T10:00:00Z');
    expect(
      getSmsIdempotencyAnchorAt({ dispatchAttemptedAt: anchor, createdAt }),
    ).toEqual(anchor);
  });

  it('falls back to createdAt when dispatchAttemptedAt is null', () => {
    const createdAt = new Date('2026-08-20T10:00:00Z');
    expect(
      getSmsIdempotencyAnchorAt({ dispatchAttemptedAt: null, createdAt }),
    ).toEqual(createdAt);
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
