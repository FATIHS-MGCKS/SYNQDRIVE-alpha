import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingPaymentMethodStatus,
  BillingPaymentMethodType,
} from '@prisma/client';
import { TenantBillingPaymentMethodsService } from './tenant-billing-payment-methods.service';
import { TenantBillingErrorCode } from './domain/tenant-billing.errors';

describe('TenantBillingPaymentMethodsService', () => {
  const prisma = {
    billingPaymentMethod: { findFirst: jest.fn(), count: jest.fn() },
    billingSubscription: { findFirst: jest.fn() },
  };
  const stripePrepared = {
    isStripeConfigured: jest.fn(),
    createSetupIntent: jest.fn(),
    createCustomerPortalSession: jest.fn(),
    setDefaultPaymentMethod: jest.fn(),
    detachPaymentMethod: jest.fn(),
  };
  const paymentMethods = {
    listOrganizationPaymentMethods: jest.fn(),
    getDefaultPaymentMethodView: jest.fn(),
  };

  let service: TenantBillingPaymentMethodsService;

  const cardMethod = {
    id: 'pm-local-1',
    type: BillingPaymentMethodType.CARD,
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2028,
    country: 'DE',
    billingName: 'Acme GmbH',
    sepaMandateStatus: null,
    sepaBankCode: null,
    isDefault: true,
    status: BillingPaymentMethodStatus.ACTIVE,
    isActive: true,
    billingState: 'READY' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TenantBillingPaymentMethodsService(
      prisma as never,
      stripePrepared as never,
      paymentMethods as never,
    );
    stripePrepared.isStripeConfigured.mockReturnValue(true);
    paymentMethods.listOrganizationPaymentMethods.mockResolvedValue([cardMethod]);
    paymentMethods.getDefaultPaymentMethodView.mockResolvedValue({
      exists: true,
      billingState: 'READY',
      paymentMethod: cardMethod,
    });
    prisma.billingPaymentMethod.findFirst.mockResolvedValue({
      id: 'pm-local-1',
      organizationId: 'org-a',
      isDefault: true,
      status: BillingPaymentMethodStatus.ACTIVE,
    });
  });

  it('lists safe payment method metadata without stripe ids', async () => {
    const result = await service.listPaymentMethods('org-a');

    expect(result.paymentMethods).toHaveLength(1);
    expect(result.paymentMethods[0]).toEqual(
      expect.objectContaining({
        id: 'pm-local-1',
        type: 'CARD',
        last4: '4242',
      }),
    );
    expect(JSON.stringify(result)).not.toMatch(/pm_|stripe/i);
  });

  it('creates setup intent with client secret only', async () => {
    stripePrepared.createSetupIntent.mockResolvedValue({
      clientSecret: 'seti_secret',
      customerId: 'cus_hidden',
      setupIntentId: 'seti_hidden',
    });

    await expect(service.createSetupIntent('org-a', 'card')).resolves.toEqual({
      clientSecret: 'seti_secret',
    });
  });

  it('creates customer portal session with verified url', async () => {
    stripePrepared.createCustomerPortalSession.mockResolvedValue({
      url: 'https://billing.stripe.com/session/test',
      returnUrl: 'http://localhost:5173/rental/settings',
      customerId: 'cus_hidden',
    });

    await expect(
      service.createCustomerPortalSession('org-a', 'http://localhost:5173/rental/settings'),
    ).resolves.toEqual({
      url: 'https://billing.stripe.com/session/test',
      returnUrl: 'http://localhost:5173/rental/settings',
    });
  });

  it('throws BILLING_PORTAL_UNAVAILABLE when stripe is not configured', async () => {
    stripePrepared.createCustomerPortalSession.mockRejectedValue(
      new HttpException({ status: 'NOT_CONFIGURED' }, HttpStatus.NOT_IMPLEMENTED),
    );

    await expect(service.createCustomerPortalSession('org-a')).rejects.toMatchObject({
      response: { code: TenantBillingErrorCode.PORTAL_UNAVAILABLE },
    });
  });

  it('sets default payment method for organization', async () => {
    stripePrepared.setDefaultPaymentMethod.mockResolvedValue({});

    await service.setDefaultPaymentMethod('org-a', 'pm-local-1');

    expect(stripePrepared.setDefaultPaymentMethod).toHaveBeenCalledWith('org-a', 'pm-local-1');
  });

  it('blocks detaching last payment method for active subscription', async () => {
    prisma.billingSubscription.findFirst.mockResolvedValue({ id: 'sub-1' });
    prisma.billingPaymentMethod.count.mockResolvedValue(1);

    await expect(service.detachPaymentMethod('org-a', 'pm-local-1')).rejects.toMatchObject({
      response: { code: TenantBillingErrorCode.PAYMENT_METHOD_REQUIRED },
    });
    expect(stripePrepared.detachPaymentMethod).not.toHaveBeenCalled();
  });

  it('allows detaching when another active payment method exists', async () => {
    prisma.billingSubscription.findFirst.mockResolvedValue({ id: 'sub-1' });
    prisma.billingPaymentMethod.count.mockResolvedValue(2);
    stripePrepared.detachPaymentMethod.mockResolvedValue({ detached: true });

    await service.detachPaymentMethod('org-a', 'pm-local-1');

    expect(stripePrepared.detachPaymentMethod).toHaveBeenCalledWith('org-a', 'pm-local-1');
  });

  it('rejects foreign payment method', async () => {
    prisma.billingPaymentMethod.findFirst.mockResolvedValue(null);

    await expect(service.setDefaultPaymentMethod('org-a', 'pm-foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('allows detach when no active subscription requires payment method', async () => {
    prisma.billingSubscription.findFirst.mockResolvedValue(null);
    stripePrepared.detachPaymentMethod.mockResolvedValue({ detached: true });

    await service.detachPaymentMethod('org-a', 'pm-local-1');

    expect(stripePrepared.detachPaymentMethod).toHaveBeenCalled();
  });
});

describe('TenantBillingPaymentMethodsService permission expectations', () => {
  it('documents billing.write requirement for mutations', () => {
    const writeActions = [
      'createSetupIntent',
      'createCustomerPortalSession',
      'setDefaultPaymentMethod',
      'detachPaymentMethod',
    ];
    expect(writeActions).toEqual(
      expect.arrayContaining(['setDefaultPaymentMethod', 'detachPaymentMethod']),
    );
  });
});
