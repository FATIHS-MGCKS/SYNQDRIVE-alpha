import {
  BillingDomainEventOutboxDeliveryStatus,
  BillingDomainEventOutboxStatus,
} from '@prisma/client';
import {
  BILLING_OUTBOX_PAYLOAD_VERSION,
  buildBillingOutboxIdempotencyKey,
  buildVersionedBillingOutboxPayload,
  computeBillingOutboxNextRetryAt,
  resolveSubscriptionLifecycleOutboxEvent,
  sanitizeBillingOutboxPayload,
} from './billing-outbox';
import { SubscriptionStatus } from './billing-domain.types';
import { BillingDomainEventType } from './billing-domain.events';

describe('billing-outbox domain', () => {
  it('builds versioned payload without stripe object keys', () => {
    const payload = buildVersionedBillingOutboxPayload({
      organizationId: 'org-1',
      payment_intent: { id: 'pi_secret' },
      amountCents: 1200,
    });

    expect(payload.payloadVersion).toBe(BILLING_OUTBOX_PAYLOAD_VERSION);
    expect(payload).not.toHaveProperty('payment_intent');
    expect(payload.amountCents).toBe(1200);
  });

  it('strips stripe object keys from payload', () => {
    const payload = sanitizeBillingOutboxPayload({
      invoice: { id: 'in_1', total: 1000 },
      amountCents: 1200,
    });
    expect(payload).not.toHaveProperty('invoice');
    expect(payload.amountCents).toBe(1200);
  });

  it('maps subscription activation to activated outbox event', () => {
    expect(
      resolveSubscriptionLifecycleOutboxEvent({
        fromStatus: SubscriptionStatus.TRIALING,
        toStatus: SubscriptionStatus.ACTIVE,
      }),
    ).toBe(BillingDomainEventType.SUBSCRIPTION_ACTIVATED);
  });

  it('computes exponential retry delay', () => {
    const first = computeBillingOutboxNextRetryAt(1, new Date('2026-07-15T00:00:00.000Z'));
    const second = computeBillingOutboxNextRetryAt(2, new Date('2026-07-15T00:00:00.000Z'));
    expect(second.getTime() - first.getTime()).toBeGreaterThan(0);
  });

  it('builds stable idempotency keys', () => {
    expect(buildBillingOutboxIdempotencyKey(['payment', 'pi_1', 'event'])).toBe(
      'payment:pi_1:event',
    );
  });
});
