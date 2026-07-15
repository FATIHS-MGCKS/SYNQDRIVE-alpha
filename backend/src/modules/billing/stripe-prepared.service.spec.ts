import { HttpException } from '@nestjs/common';
import { StripePreparedService } from './stripe-prepared.service';
import { StripeBillingService } from './stripe-billing.service';

describe('StripePreparedService', () => {
  const prisma = {
    billingPaymentMethod: {
      findFirst: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
  } as any;

  const stripeBilling = {
    isStripeConfigured: jest.fn(),
    createCustomerPortalSession: jest.fn(),
    createSetupIntent: jest.fn(),
    syncOrganizationStripe: jest.fn(),
  } as unknown as StripeBillingService;

  const paymentMethods = {
    getDefaultPaymentMethodView: jest.fn(),
    listOrganizationPaymentMethods: jest.fn(),
    createSetupIntent: jest.fn(),
    syncPaymentMethods: jest.fn(),
    setDefaultPaymentMethod: jest.fn(),
    detachPaymentMethod: jest.fn(),
  };

  let service: StripePreparedService;

  beforeEach(() => {
    service = new StripePreparedService(prisma, stripeBilling, paymentMethods as never);
    jest.clearAllMocks();
    (stripeBilling.isStripeConfigured as jest.Mock).mockReturnValue(false);
  });

  it('reports portalPrepared when Stripe secret is missing', () => {
    const status = service.getPreparedStatus();
    expect(status.configured).toBe(false);
    expect(status.portalPrepared).toBe(true);
  });

  it('returns exists=false when no payment method', async () => {
    paymentMethods.getDefaultPaymentMethodView.mockResolvedValue({
      exists: false,
      billingState: 'MISSING',
      paymentMethod: null,
    });
    const result = await service.getDefaultPaymentMethod('org-1');
    expect(result.exists).toBe(false);
    expect(result.paymentMethod).toBeNull();
    expect(result.stripe.portalPrepared).toBe(true);
  });

  it('returns 501 for customer portal when Stripe not configured', async () => {
    await expect(service.createCustomerPortalSession('org-1')).rejects.toBeInstanceOf(
      HttpException,
    );
    try {
      await service.createCustomerPortalSession('org-1');
    } catch (e) {
      const err = e as HttpException;
      expect(err.getStatus()).toBe(501);
      expect((err.getResponse() as any).prepared).toBe(true);
    }
  });

  it('delegates portal session when Stripe configured', async () => {
    (stripeBilling.isStripeConfigured as jest.Mock).mockReturnValue(true);
    (stripeBilling.createCustomerPortalSession as jest.Mock).mockResolvedValue({
      url: 'https://billing.stripe.com/p/session',
    });
    const result = await service.createCustomerPortalSession('org-1');
    expect(result.url).toContain('stripe.com');
  });

  it('returns prepared sync payload for master admin when Stripe missing', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', companyName: 'Test' });
    const result = await service.syncOrganizationStripe('org-1');
    expect(result.synced).toBe(false);
    expect(result.prepared).toBe(true);
  });
});
