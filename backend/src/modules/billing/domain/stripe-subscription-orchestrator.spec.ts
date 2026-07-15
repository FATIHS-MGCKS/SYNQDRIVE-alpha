import { BillingProrationBehavior, BillingStripeMode } from '@prisma/client';
import {
  StripeSubscriptionOrchestratorErrorCode,
  StripeSubscriptionOrchestratorMetadataKeys,
  buildStripeSubscriptionIdempotencyKey,
  computeBillingCycleAnchorUnix,
  isSyncableSubscriptionItem,
  mapProrationBehaviorToStripe,
  resolveStripeItemQuantity,
  resolveTrialEndUnix,
  translateStripeSubscriptionProviderError,
} from './stripe-subscription-orchestrator';

describe('stripe-subscription-orchestrator domain', () => {
  it('preserves zero quantity for explicit no-vehicle billing', () => {
    expect(resolveStripeItemQuantity(0)).toBe(0);
    expect(resolveStripeItemQuantity(5)).toBe(5);
    expect(resolveStripeItemQuantity(-3)).toBe(0);
  });

  it('builds stable subscription idempotency keys', () => {
    expect(buildStripeSubscriptionIdempotencyKey('sub-1', BillingStripeMode.TEST)).toBe(
      'stripe-subscription-sync:sub-1:TEST:v1',
    );
  });

  it('maps proration behavior to stripe values', () => {
    expect(mapProrationBehaviorToStripe(BillingProrationBehavior.NONE)).toBe('none');
    expect(mapProrationBehaviorToStripe(BillingProrationBehavior.ALWAYS_INVOICE)).toBe(
      'always_invoice',
    );
    expect(mapProrationBehaviorToStripe(BillingProrationBehavior.CREATE_PRORATIONS)).toBe(
      'create_prorations',
    );
  });

  it('computes billing anchor in the future', () => {
    const anchor = computeBillingCycleAnchorUnix(15, new Date('2026-07-10T00:00:00.000Z'));
    expect(anchor).toBeGreaterThan(Math.floor(Date.parse('2026-07-10T00:00:00.000Z') / 1000));
  });

  it('resolves future trial end only', () => {
    const future = new Date(Date.now() + 60_000);
    expect(resolveTrialEndUnix(future)).toBe(Math.floor(future.getTime() / 1000));
    expect(resolveTrialEndUnix(new Date(Date.now() - 60_000))).toBeUndefined();
  });

  it('filters syncable subscription items', () => {
    const now = new Date('2026-07-15T00:00:00.000Z');
    expect(
      isSyncableSubscriptionItem(
        { status: 'ACTIVE', validTo: null, priceVersionId: 'ver-1' },
        now,
      ),
    ).toBe(true);
    expect(
      isSyncableSubscriptionItem(
        { status: 'DRAFT', validTo: null, priceVersionId: 'ver-1' },
        now,
      ),
    ).toBe(false);
    expect(
      isSyncableSubscriptionItem(
        { status: 'ACTIVE', validTo: new Date('2026-07-01T00:00:00.000Z'), priceVersionId: 'ver-1' },
        now,
      ),
    ).toBe(false);
  });

  it('translates stripe provider errors', () => {
    expect(
      translateStripeSubscriptionProviderError({ type: 'StripeRateLimitError' }).code,
    ).toBe(StripeSubscriptionOrchestratorErrorCode.RATE_LIMITED);
    expect(
      translateStripeSubscriptionProviderError({
        type: 'StripeConnectionError',
        code: 'timeout',
      }).code,
    ).toBe(StripeSubscriptionOrchestratorErrorCode.PROVIDER_TIMEOUT);
  });

  it('builds subscription metadata keys', () => {
    const metadata = {
      [StripeSubscriptionOrchestratorMetadataKeys.organizationId]: 'org-1',
      [StripeSubscriptionOrchestratorMetadataKeys.subscriptionId]: 'sub-1',
    };
    expect(metadata.synqdriveSubscriptionId).toBe('sub-1');
  });
});
