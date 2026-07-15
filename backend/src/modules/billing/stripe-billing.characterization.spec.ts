import { ConfigService } from '@nestjs/config';
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

  const paymentMethods = {
    syncPaymentMethods: jest.fn(),
    createCustomerPortalSession: jest.fn(),
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
      paymentMethods as never,
    );
    jest.spyOn(stripeClientUtil, 'getStripeClient').mockReturnValue({} as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('syncPaymentMethods delegates to payment method service', async () => {
    paymentMethods.syncPaymentMethods.mockResolvedValue({
      organizationId: 'org-a',
      synced: 2,
      customerId: 'cus_1',
      defaultPaymentMethodId: 'pm_default',
      stripeMode: 'TEST',
    });

    const result = await service.syncPaymentMethods('org-a');

    expect(result).toEqual({
      synced: 2,
      customerId: 'cus_1',
      defaultPaymentMethodId: 'pm_default',
    });
    expect(paymentMethods.syncPaymentMethods).toHaveBeenCalledWith('org-a');
  });

  it('syncPaymentMethods returns early payload from payment method service', async () => {
    paymentMethods.syncPaymentMethods.mockResolvedValue({
      organizationId: 'org-a',
      synced: 0,
      customerId: null,
      defaultPaymentMethodId: null,
      stripeMode: 'TEST',
    });

    const result = await service.syncPaymentMethods('org-a');

    expect(result).toEqual({ synced: 0, customerId: null, defaultPaymentMethodId: null });
  });

  it('createCustomerPortalSession delegates to payment method service', async () => {
    paymentMethods.createCustomerPortalSession.mockResolvedValue({
      url: 'https://billing.stripe.com/p/session/test_abc',
      customerId: 'cus_portal',
      returnUrl: 'http://localhost:5173/rental/settings?settingsTab=billing',
    });

    const result = await service.createCustomerPortalSession(
      'org-a',
      'http://localhost:5173/rental/settings?settingsTab=billing',
    );

    expect(paymentMethods.createCustomerPortalSession).toHaveBeenCalledWith(
      'org-a',
      'http://localhost:5173/rental/settings?settingsTab=billing',
    );
    expect(result.url).toContain('billing.stripe.com');
    expect(result.customerId).toBe('cus_portal');
  });
});
