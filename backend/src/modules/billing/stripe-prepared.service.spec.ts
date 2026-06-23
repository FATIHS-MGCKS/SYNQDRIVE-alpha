import { HttpException } from '@nestjs/common';
import { StripePreparedService } from './stripe-prepared.service';

describe('StripePreparedService', () => {
  const prisma = {
    billingPaymentMethod: {
      findFirst: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
  } as any;

  let service: StripePreparedService;
  const originalSecret = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    service = new StripePreparedService(prisma);
    delete process.env.STRIPE_SECRET_KEY;
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (originalSecret !== undefined) {
      process.env.STRIPE_SECRET_KEY = originalSecret;
    } else {
      delete process.env.STRIPE_SECRET_KEY;
    }
  });

  it('reports portalPrepared when Stripe secret is missing', () => {
    const status = service.getPreparedStatus();
    expect(status.configured).toBe(false);
    expect(status.portalPrepared).toBe(true);
  });

  it('returns exists=false when no payment method', async () => {
    prisma.billingPaymentMethod.findFirst.mockResolvedValue(null);
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

  it('returns prepared sync payload for master admin when Stripe missing', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', companyName: 'Test' });
    const result = await service.syncOrganizationStripe('org-1');
    expect(result.synced).toBe(false);
    expect(result.prepared).toBe(true);
  });
});
