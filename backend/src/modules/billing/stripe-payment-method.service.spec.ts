import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  BillingPaymentMethodStatus,
  BillingPaymentMethodType,
  BillingStripeMode,
} from '@prisma/client';
import * as stripeClientUtil from './stripe-client.util';
import { StripeBillingService } from './stripe-billing.service';
import { StripePaymentMethodService } from './stripe-payment-method.service';
import { StripePaymentMethodErrorCode } from './domain/stripe-payment-methods';

describe('StripePaymentMethodService', () => {
  const orgId = 'org-1';
  const otherOrgId = 'org-2';
  const paymentMethodId = 'pm-local-1';

  let methods: any[];
  let subscriptions: any[];
  let detachedStripeIds: Set<string>;
  let transactionChain: Promise<unknown>;

  const prisma: any = {
    billingPaymentMethod: {
      findMany: jest.fn(async ({ where }: any) =>
        methods.filter((row) => row.organizationId === where.organizationId),
      ),
      findFirst: jest.fn(async ({ where }: any) => {
        const rows = methods.filter((row) => {
          if (where.organizationId && row.organizationId !== where.organizationId) return false;
          if (where.isDefault === true && !row.isDefault) return false;
          if (where.status && row.status !== where.status) return false;
          return true;
        });
        return rows[0] ?? null;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.stripePaymentMethodId) {
          return methods.find((row) => row.stripePaymentMethodId === where.stripePaymentMethodId) ?? null;
        }
        return methods.find((row) => row.id === where.id) ?? null;
      }),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const existing = methods.find((row) => row.stripePaymentMethodId === where.stripePaymentMethodId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `pm-local-${methods.length + 1}`, ...create };
        methods.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = methods.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        methods.forEach((row) => {
          if (where.organizationId && row.organizationId !== where.organizationId) return;
          if (where.stripePaymentMethodId?.notIn && where.stripePaymentMethodId.notIn.includes(row.stripePaymentMethodId)) {
            return;
          }
          if (where.stripeMode && row.stripeMode !== where.stripeMode) return;
          if (where.status?.not && row.status === where.status.not) return;
          if (where.stripePaymentMethodId && row.stripePaymentMethodId !== where.stripePaymentMethodId) return;
          if (where.isDefault === true && !row.isDefault) return;
          Object.assign(row, data);
        });
        return { count: 1 };
      }),
    },
    billingSubscription: {
      findFirst: jest.fn(async ({ where }: any) =>
        subscriptions.find((row) => {
          if (where.organizationId && row.organizationId !== where.organizationId) return false;
          if (where.stripeCustomerId?.not === null && !row.stripeCustomerId) return false;
          if (where.stripeSubscriptionId?.not === null && !row.stripeSubscriptionId) return false;
          return true;
        }) ?? null,
      ),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (fn: any) => {
      const run = transactionChain.then(() => fn(prisma));
      transactionChain = run.catch(() => undefined);
      return run;
    }),
  };

  const configService = {
    get: jest.fn((key: string) => (key === 'stripe.secretKey' ? 'sk_test_abc' : '')),
  };

  const stripeBilling = {
    ensureCustomerForOrganization: jest.fn(async () => 'cus_test_1'),
    findStripeCustomerId: jest.fn(async () => 'cus_test_1'),
    findOrganizationIdByStripeCustomer: jest.fn(async () => orgId),
    resolvePortalReturnUrl: jest.fn((url?: string) => url ?? 'http://localhost:5173/rental/settings'),
  } as unknown as StripeBillingService;

  const events = {
    publishPaymentMethodSynced: jest.fn(async () => undefined),
  };

  let stripeMock: any;
  let service: StripePaymentMethodService;

  beforeEach(() => {
    jest.clearAllMocks();
    detachedStripeIds = new Set();
    transactionChain = Promise.resolve();
    methods = [
      {
        id: paymentMethodId,
        organizationId: orgId,
        stripePaymentMethodId: 'pm_card_1',
        stripeMode: BillingStripeMode.TEST,
        type: BillingPaymentMethodType.CARD,
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2030,
        country: 'DE',
        billingName: 'Acme GmbH',
        sepaMandateStatus: null,
        sepaBankCode: null,
        isDefault: true,
        status: BillingPaymentMethodStatus.ACTIVE,
      },
      {
        id: 'pm-local-2',
        organizationId: orgId,
        stripePaymentMethodId: 'pm_sepa_1',
        stripeMode: BillingStripeMode.TEST,
        type: BillingPaymentMethodType.SEPA_DEBIT,
        brand: null,
        last4: '3000',
        expMonth: null,
        expYear: null,
        country: 'DE',
        billingName: 'Acme GmbH',
        sepaMandateStatus: 'active',
        sepaBankCode: '37040044',
        isDefault: false,
        status: BillingPaymentMethodStatus.ACTIVE,
      },
    ];
    subscriptions = [
      {
        organizationId: orgId,
        stripeCustomerId: 'cus_test_1',
        stripeSubscriptionId: 'sub_stripe_1',
      },
    ];

    stripeMock = {
      customers: {
        retrieve: jest.fn(async () => ({
          id: 'cus_test_1',
          invoice_settings: { default_payment_method: 'pm_card_1' },
        })),
        update: jest.fn(async () => ({})),
      },
      paymentMethods: {
        list: jest.fn(async ({ type }: { type: string }) => ({
          data:
            type === 'card'
              ? [
                  {
                    id: 'pm_card_1',
                    type: 'card',
                    customer: 'cus_test_1',
                    card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030, country: 'DE' },
                    billing_details: { name: 'Acme GmbH' },
                  },
                ].filter((pm) => !detachedStripeIds.has(pm.id))
              : [
                  {
                    id: 'pm_sepa_1',
                    type: 'sepa_debit',
                    customer: 'cus_test_1',
                    sepa_debit: {
                      last4: '3000',
                      bank_code: '37040044',
                      country: 'DE',
                      mandate: 'mandate_1',
                    },
                    billing_details: { name: 'Acme GmbH' },
                  },
                ].filter((pm) => !detachedStripeIds.has(pm.id)),
        })),
        detach: jest.fn(async (stripePaymentMethodId: string) => {
          detachedStripeIds.add(stripePaymentMethodId);
        }),
      },
      mandates: {
        retrieve: jest.fn(async () => ({ status: 'active' })),
      },
      setupIntents: {
        create: jest.fn(async () => ({
          id: 'seti_1',
          client_secret: 'seti_secret',
        })),
      },
      billingPortal: {
        sessions: {
          create: jest.fn(async () => ({ url: 'https://billing.stripe.test/session' })),
        },
      },
      subscriptions: {
        retrieve: jest.fn(async () => ({
          id: 'sub_stripe_1',
          default_payment_method: null,
        })),
        update: jest.fn(async () => ({})),
      },
    };

    jest.spyOn(stripeClientUtil, 'getStripeClient').mockReturnValue(stripeMock);
    service = new StripePaymentMethodService(prisma, configService as never, stripeBilling, events as never);
  });

  afterEach(() => {
    stripeClientUtil.resetStripeClientForTests();
  });

  it('syncs card and sepa payment methods with safe metadata only', async () => {
    const result = await service.syncPaymentMethods(orgId);

    expect(result.synced).toBe(2);
    expect(stripeMock.paymentMethods.list).toHaveBeenCalledWith({
      customer: 'cus_test_1',
      type: 'card',
    });
    expect(stripeMock.paymentMethods.list).toHaveBeenCalledWith({
      customer: 'cus_test_1',
      type: 'sepa_debit',
    });
    expect(methods.find((row) => row.stripePaymentMethodId === 'pm_sepa_1')?.sepaMandateStatus).toBe(
      'active',
    );
    expect(events.publishPaymentMethodSynced).toHaveBeenCalled();
  });

  it('creates setup intent for card and sepa with organization metadata', async () => {
    await service.createSetupIntent(orgId, 'card');
    await service.createSetupIntent(orgId, 'sepa_debit');

    expect(stripeMock.setupIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_types: ['card'],
        metadata: expect.objectContaining({ organizationId: orgId }),
      }),
    );
    expect(stripeMock.setupIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_types: ['sepa_debit'],
      }),
    );
  });

  it('creates customer portal session with allowlisted return url', async () => {
    const session = await service.createCustomerPortalSession(
      orgId,
      'http://localhost:5173/rental/settings',
    );
    expect(session.url).toContain('stripe.test');
    expect(stripeBilling.resolvePortalReturnUrl).toHaveBeenCalled();
  });

  it('rejects unsafe portal return urls', async () => {
    (stripeBilling.resolvePortalReturnUrl as jest.Mock).mockImplementation(() => {
      throw new ConflictException({
        code: StripePaymentMethodErrorCode.RETURN_URL_NOT_ALLOWED,
        message: StripePaymentMethodErrorCode.RETURN_URL_NOT_ALLOWED,
      });
    });

    await expect(
      service.createCustomerPortalSession(orgId, 'https://evil.example/phish'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('sets exactly one local default payment method', async () => {
    await service.setDefaultPaymentMethod(orgId, 'pm-local-2');

    expect(stripeMock.customers.update).toHaveBeenCalledWith('cus_test_1', {
      invoice_settings: { default_payment_method: 'pm_sepa_1' },
    });
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith('sub_stripe_1', {
      default_payment_method: 'pm_sepa_1',
    });
    expect(methods.filter((row) => row.isDefault)).toHaveLength(1);
    expect(methods.find((row) => row.id === 'pm-local-2')?.isDefault).toBe(true);
  });

  it('detaches payment method and marks it locally as detached', async () => {
    await service.detachPaymentMethod(orgId, paymentMethodId);

    expect(stripeMock.paymentMethods.detach).toHaveBeenCalledWith('pm_card_1');
    expect(methods.find((row) => row.id === paymentMethodId)?.status).toBe(
      BillingPaymentMethodStatus.DETACHED,
    );
  });

  it('rejects foreign organization access to payment methods', async () => {
    await expect(service.setDefaultPaymentMethod(otherOrgId, paymentMethodId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.detachPaymentMethod(otherOrgId, paymentMethodId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects test/live mode mismatch for local payment method', async () => {
    methods[0].stripeMode = BillingStripeMode.LIVE;

    await expect(service.setDefaultPaymentMethod(orgId, paymentMethodId)).rejects.toMatchObject({
      response: { code: StripePaymentMethodErrorCode.STRIPE_MODE_MISMATCH },
    });
  });

  it('handles payment method detached webhook by deactivating local row', async () => {
    detachedStripeIds.add('pm_card_1');

    await service.handlePaymentMethodDetached({
      id: 'pm_card_1',
      object: 'payment_method',
      customer: 'cus_test_1',
    } as never);

    expect(methods.find((row) => row.stripePaymentMethodId === 'pm_card_1')?.status).toBe(
      BillingPaymentMethodStatus.DETACHED,
    );
  });

  it('serializes parallel default changes to a single default', async () => {
    await Promise.all([
      service.setDefaultPaymentMethod(orgId, paymentMethodId),
      service.setDefaultPaymentMethod(orgId, 'pm-local-2'),
    ]);

    expect(methods.filter((row) => row.isDefault)).toHaveLength(1);
  });

  it('returns missing billing state when no default exists', async () => {
    methods.forEach((row) => {
      row.isDefault = false;
      row.status = BillingPaymentMethodStatus.DETACHED;
    });

    const result = await service.getDefaultPaymentMethodView(orgId);
    expect(result.billingState).toBe('MISSING');
    expect(result.paymentMethod).toBeNull();
  });

  it('rejects unknown payment method ids', async () => {
    await expect(service.setDefaultPaymentMethod(orgId, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
