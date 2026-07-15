import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeBillingService } from './stripe-billing.service';
import * as stripeClientUtil from './stripe-client.util';

describe('StripeBillingService', () => {
  const prisma = {
    organization: { findUnique: jest.fn() },
    billingSubscription: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
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
        'stripe.webhookSecret': 'whsec_test',
        'stripe.portalReturnUrl': 'http://localhost:5173/rental/settings',
        'stripe.defaultPriceId': '',
        'app.corsOrigins': ['http://localhost:5173'],
      };
      return map[key] ?? fallback;
    }),
  } as unknown as ConfigService;

  let service: StripeBillingService;

  const stripeMock = {
    customers: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
    billingPortal: {
      sessions: { create: jest.fn() },
    },
    setupIntents: { create: jest.fn() },
    paymentMethods: { list: jest.fn() },
    subscriptions: {
      retrieve: jest.fn(),
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const catalogMappings = {
    resolveStripePrice: jest.fn(),
  };

  const subscriptionOrchestrator = {
    syncOrganizationSubscription: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StripeBillingService(
      prisma as never,
      configService,
      billableVehiclesService as never,
      catalogMappings as never,
      subscriptionOrchestrator as never,
    );
    jest.spyOn(stripeClientUtil, 'getStripeClient').mockReturnValue(stripeMock as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ensureCustomerForOrganization is idempotent', async () => {
    prisma.billingSubscription.findFirst
      .mockResolvedValueOnce({ stripeCustomerId: 'cus_existing' })
      .mockResolvedValueOnce({ stripeCustomerId: 'cus_existing' });

    await expect(service.ensureCustomerForOrganization('org-1')).resolves.toBe('cus_existing');
    await expect(service.ensureCustomerForOrganization('org-1')).resolves.toBe('cus_existing');
    expect(stripeMock.customers.create).not.toHaveBeenCalled();
  });

  it('creates Stripe customer and stores mapping on first ensure', async () => {
    prisma.billingSubscription.findFirst.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      companyName: 'Acme',
      legalCompanyName: null,
      email: 'billing@acme.test',
      invoiceEmail: null,
      managerEmail: null,
      phone: null,
      address: null,
      city: null,
      state: null,
      zip: null,
      country: null,
      vatId: null,
      taxId: null,
    });
    prisma.billingSubscription.create.mockResolvedValue({
      id: 'sub-local-1',
      organizationId: 'org-1',
    });
    stripeMock.customers.create.mockResolvedValue({ id: 'cus_new' });
    prisma.billingSubscription.update.mockResolvedValue({});

    const customerId = await service.ensureCustomerForOrganization('org-1');
    expect(customerId).toBe('cus_new');
    expect(stripeMock.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ organizationId: 'org-1' }),
      }),
    );
    expect(prisma.billingSubscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-local-1' },
      data: { stripeCustomerId: 'cus_new' },
    });
  });

  it('createCustomerPortalSession returns portal URL', async () => {
    jest.spyOn(service, 'ensureCustomerForOrganization').mockResolvedValue('cus_1');
    stripeMock.billingPortal.sessions.create.mockResolvedValue({
      url: 'https://billing.stripe.com/session/test',
    });

    const result = await service.createCustomerPortalSession('org-1');
    expect(result.url).toBe('https://billing.stripe.com/session/test');
    expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalled();
  });

  it('createSetupIntent returns client secret', async () => {
    jest.spyOn(service, 'ensureCustomerForOrganization').mockResolvedValue('cus_1');
    stripeMock.setupIntents.create.mockResolvedValue({
      id: 'seti_1',
      client_secret: 'seti_secret_123',
    });

    const result = await service.createSetupIntent('org-1');
    expect(result.clientSecret).toBe('seti_secret_123');
  });

  it('rejects invalid returnUrl origin', () => {
    expect(() =>
      service.resolvePortalReturnUrl('https://evil.example/redirect'),
    ).toThrow(BadRequestException);
  });

  it('syncOrganizationStripe throws when org missing', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    await expect(service.syncOrganizationStripe('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
