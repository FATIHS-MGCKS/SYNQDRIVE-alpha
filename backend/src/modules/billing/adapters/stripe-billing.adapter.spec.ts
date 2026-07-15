import { HttpException, HttpStatus } from '@nestjs/common';
import { SubscriptionStatus, SyncStatus } from '../domain';
import { StripeBillingAdapter } from './stripe-billing.adapter';

describe('StripeBillingAdapter', () => {
  const stripeBilling = {
    isStripeConfigured: jest.fn(),
    ensureCustomerForOrganization: jest.fn(),
    createCustomerPortalSession: jest.fn(),
    createSetupIntent: jest.fn(),
    syncPaymentMethods: jest.fn(),
    syncSubscriptionFromStripe: jest.fn(),
    applyStripeSubscription: jest.fn(),
    createOrUpdateSubscriptionForOrg: jest.fn(),
  };

  let adapter: StripeBillingAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new StripeBillingAdapter(stripeBilling as never);
  });

  function assertDomainOnlyResult(value: unknown): void {
    const json = JSON.stringify(value);
    expect(json).not.toContain('"object":"');
    expect(value).not.toHaveProperty('data');
    if (value && typeof value === 'object') {
      const ctor = (value as object).constructor?.name ?? '';
      expect(ctor).not.toMatch(/^Stripe/);
    }
  }

  it('maps configuration to domain SyncStatus', () => {
    stripeBilling.isStripeConfigured.mockReturnValue(false);
    const config = adapter.getConfiguration();

    expect(config.configured).toBe(false);
    expect(config.syncStatus).toBe(SyncStatus.PENDING);
    assertDomainOnlyResult(config);
  });

  it('maps ensureCustomer to domain result', async () => {
    stripeBilling.ensureCustomerForOrganization.mockResolvedValue('cus_123');
    const result = await adapter.ensureCustomer('org-1');

    expect(result).toEqual({ customerId: 'cus_123', organizationId: 'org-1' });
    assertDomainOnlyResult(result);
  });

  it('maps applyStripeSubscription to domain sync result', async () => {
    stripeBilling.applyStripeSubscription.mockResolvedValue({
      synced: true,
      subscriptionId: 'sub-local',
      stripeSubscriptionId: 'sub_stripe',
      status: { domainStatus: SubscriptionStatus.ACTIVE },
    });

    const result = await adapter.applyStripeSubscription('org-1', {
      id: 'sub_stripe',
      customer: 'cus_123',
      status: 'active',
      cancel_at_period_end: false,
      current_period_start: 1,
      current_period_end: 2,
      items: { data: [] },
    } as never);

    expect(result.syncStatus).toBe(SyncStatus.SYNCED);
    expect(result.subscriptionStatus).toBe(SubscriptionStatus.ACTIVE);
    expect(result.stripeCustomerId).toBe('cus_123');
    assertDomainOnlyResult(result);
  });

  it('returns PENDING when Stripe is not configured for sync', async () => {
    stripeBilling.syncSubscriptionFromStripe.mockRejectedValue(
      new HttpException({ prepared: true }, HttpStatus.NOT_IMPLEMENTED),
    );

    const result = await adapter.syncSubscription('org-1');

    expect(result.syncStatus).toBe(SyncStatus.PENDING);
    expect(result.subscriptionStatus).toBe(SubscriptionStatus.INCOMPLETE);
    assertDomainOnlyResult(result);
  });

  it('maps createOrUpdateSubscription prepared response to domain', async () => {
    stripeBilling.createOrUpdateSubscriptionForOrg.mockResolvedValue({
      prepared: true,
      message: 'missing price id',
    });

    const result = await adapter.createOrUpdateSubscription('org-1');

    expect(result.syncStatus).toBe(SyncStatus.PENDING);
    expect(result.message).toContain('missing price id');
    assertDomainOnlyResult(result);
  });
});
