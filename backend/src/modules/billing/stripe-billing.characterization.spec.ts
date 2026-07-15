import { ConfigService } from '@nestjs/config';
import { BillingPaymentMethodStatus, BillingPaymentMethodType } from '@prisma/client';
import { StripeBillingService } from './stripe-billing.service';
import * as stripeClientUtil from './stripe-client.util';

describe('StripeBillingService payment sync characterization', () => {
  const prisma = {
    billingSubscription: { findFirst: jest.fn() },
    billingPaymentMethod: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const billableVehiclesService = {
    getBillableConnectedVehiclesForOrganization: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      const map: Record<string, unknown> = {
        'stripe.secretKey': 'sk_test_123',
        'stripe.portalReturnUrl': 'http://localhost:5173/rental/settings',
        'app.corsOrigins': ['http://localhost:5173'],
      };
      return map[key] ?? fallback;
    }),
  } as unknown as ConfigService;

  const stripeMock = {
    customers: { retrieve: jest.fn() },
    billingPortal: { sessions: { create: jest.fn() } },
    paymentMethods: { list: jest.fn() },
  };

  let service: StripeBillingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StripeBillingService(
      prisma as never,
      configService,
      billableVehiclesService as never,
      { resolveStripePrice: jest.fn() } as never,
      { syncOrganizationSubscription: jest.fn() } as never,
    );
    jest.spyOn(stripeClientUtil, 'getStripeClient').mockReturnValue(stripeMock as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('syncPaymentMethods upserts card payment methods and marks default', async () => {
    prisma.billingSubscription.findFirst.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    stripeMock.customers.retrieve.mockResolvedValue({
      invoice_settings: { default_payment_method: 'pm_default' },
    });
    stripeMock.paymentMethods.list.mockResolvedValue({
      data: [
        {
          id: 'pm_default',
          type: 'card',
          card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2028 },
        },
        {
          id: 'pm_other',
          type: 'card',
          card: { brand: 'mastercard', last4: '5555', exp_month: 1, exp_year: 2027 },
        },
      ],
    });
    prisma.billingPaymentMethod.upsert.mockResolvedValue({});
    prisma.billingPaymentMethod.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.syncPaymentMethods('org-a');

    expect(result.synced).toBe(2);
    expect(result.defaultPaymentMethodId).toBe('pm_default');
    expect(prisma.billingPaymentMethod.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripePaymentMethodId: 'pm_default' },
        create: expect.objectContaining({
          organizationId: 'org-a',
          type: BillingPaymentMethodType.CARD,
          isDefault: true,
          status: BillingPaymentMethodStatus.ACTIVE,
        }),
      }),
    );
    expect(prisma.billingPaymentMethod.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-a' }),
        data: expect.objectContaining({ status: BillingPaymentMethodStatus.DETACHED }),
      }),
    );
  });

  it('syncPaymentMethods returns early when org has no stripe customer mapping', async () => {
    prisma.billingSubscription.findFirst.mockResolvedValue(null);

    const result = await service.syncPaymentMethods('org-a');

    expect(result).toEqual({ synced: 0, customerId: null });
    expect(stripeMock.paymentMethods.list).not.toHaveBeenCalled();
  });

  it('createCustomerPortalSession uses Stripe billing portal with resolved return URL', async () => {
    jest.spyOn(service, 'ensureCustomerForOrganization').mockResolvedValue('cus_portal');
    stripeMock.billingPortal.sessions.create.mockResolvedValue({
      url: 'https://billing.stripe.com/p/session/test_abc',
    });

    const result = await service.createCustomerPortalSession(
      'org-a',
      'http://localhost:5173/rental/settings?settingsTab=billing',
    );

    expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_portal',
      return_url: 'http://localhost:5173/rental/settings?settingsTab=billing',
    });
    expect(result.url).toContain('billing.stripe.com');
    expect(result.customerId).toBe('cus_portal');
  });
});
