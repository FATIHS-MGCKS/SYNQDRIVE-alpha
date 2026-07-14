import { ConfigService } from '@nestjs/config';
import {
  OrganizationPaymentAccountStatus,
  PaymentProvider,
  StripeAccountGeneration,
} from '@prisma/client';
import { StripeConnectAccountService } from './stripe-connect-account.service';
import { OrganizationPaymentAccountService } from './organization-payment-account.service';
import { PaymentsAccessService } from './payments-access.service';
import type { StripeConnectAdapter } from './stripe/stripe-connect.adapter';
import {
  ConnectNotConfiguredError,
  PaymentsFeatureDisabledConnectError,
  StripeModeMismatchError,
} from './stripe/stripe-connect.errors';

describe('StripeConnectAccountService', () => {
  const organizationId = 'org-1';
  const actor = { id: 'user-1', platformRole: 'USER', organizationId };

  const prisma = {
    organization: { findUnique: jest.fn() },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    organizationPaymentAccount: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const paymentsAccess = {
    assertPaymentsFeatureEnabled: jest.fn(),
    assertPaymentPermission: jest.fn(),
  };

  const orgPaymentAccountService = new OrganizationPaymentAccountService({
    findByOrgAndProvider: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  } as never);

  const adapter: jest.Mocked<StripeConnectAdapter> = {
    createConnectedAccount: jest.fn(),
    getConnectedAccountStatus: jest.fn(),
    createOnboardingSession: jest.fn(),
    createCheckoutSession: jest.fn(),
    createRefund: jest.fn(),
    retrievePaymentIntent: jest.fn(),
    retrieveCheckoutSession: jest.fn(),
    refreshConnectedAccount: jest.fn(),
    getSafePayoutSummary: jest.fn(),
  };

  const configService = {
    get: jest.fn(),
  };

  let service: StripeConnectAccountService;

  const baseStatus = {
    status: OrganizationPaymentAccountStatus.ONBOARDING,
    detailsSubmitted: false,
    chargesEnabled: false,
    payoutsEnabled: false,
    disabledReason: null,
    requirements: { currentlyDue: [], pastDue: [], pendingVerification: [] },
    country: 'DE',
    defaultCurrency: 'EUR',
    livemode: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      const map: Record<string, string> = {
        'stripe.secretKey': 'sk_test_123',
        'stripe.connectReturnUrl': 'https://app.example/return',
        'stripe.connectRefreshUrl': 'https://app.example/refresh',
      };
      return map[key];
    });
    service = new StripeConnectAccountService(
      prisma as never,
      configService as unknown as ConfigService,
      paymentsAccess as never,
      orgPaymentAccountService,
      adapter,
    );

    prisma.organization.findUnique.mockResolvedValue({
      id: organizationId,
      companyName: 'Rental GmbH',
      country: 'DE',
      email: 'ops@rental.example',
      managerEmail: null,
      paymentsEnabled: true,
    });
    paymentsAccess.assertPaymentsFeatureEnabled.mockResolvedValue(undefined);
    paymentsAccess.assertPaymentPermission.mockResolvedValue(undefined);
    adapter.createConnectedAccount.mockResolvedValue({
      connectedAccountId: 'acct_test_1',
      livemode: false,
      generation: StripeAccountGeneration.V1,
    });
    adapter.getConnectedAccountStatus.mockResolvedValue(baseStatus);
    adapter.refreshConnectedAccount.mockResolvedValue(baseStatus);
    adapter.getSafePayoutSummary.mockResolvedValue({
      payoutsEnabled: false,
      bankAccountLast4: '3000',
      defaultCurrency: 'EUR',
    });
  });

  it('blocks create when payments feature is disabled', async () => {
    paymentsAccess.assertPaymentsFeatureEnabled.mockRejectedValue(new Error('disabled'));
    await expect(service.createConnectedAccount(organizationId, actor)).rejects.toBeInstanceOf(
      PaymentsFeatureDisabledConnectError,
    );
    expect(adapter.createConnectedAccount).not.toHaveBeenCalled();
  });

  it('requires connect.manage permission', async () => {
    paymentsAccess.assertPaymentPermission.mockRejectedValue(new Error('forbidden'));
    await expect(service.createConnectedAccount(organizationId, actor)).rejects.toThrow();
    expect(adapter.createConnectedAccount).not.toHaveBeenCalled();
  });

  it('rejects live mode stripe key', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) =>
      key === 'stripe.secretKey' ? 'sk_live_abc' : 'https://app.example',
    );
    service = new StripeConnectAccountService(
      prisma as never,
      configService as unknown as ConfigService,
      paymentsAccess as never,
      orgPaymentAccountService,
      adapter,
    );
    await expect(service.createConnectedAccount(organizationId, actor)).rejects.toBeInstanceOf(
      StripeModeMismatchError,
    );
  });

  it('creates connected account and persists safe metadata', async () => {
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn(prisma),
    );
    prisma.organizationPaymentAccount.findUnique.mockResolvedValue(null);
    prisma.organizationPaymentAccount.create.mockResolvedValue({
      id: 'opa-1',
      organizationId,
      provider: PaymentProvider.STRIPE,
    });
    prisma.organizationPaymentAccount.update.mockResolvedValue({
      id: 'opa-1',
      organizationId,
      stripeConnectedAccountId: 'acct_test_1',
      bankAccountLast4: '3000',
      status: OrganizationPaymentAccountStatus.ONBOARDING,
    });

    const result = await service.createConnectedAccount(organizationId, actor);

    expect(adapter.createConnectedAccount).toHaveBeenCalledTimes(1);
    expect(result.account.stripeConnectedAccountId).toBe('acct_test_1');
    expect(prisma.organizationPaymentAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stripeConnectedAccountId: 'acct_test_1',
          bankAccountLast4: '3000',
          lastSyncedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('is idempotent when connected account already exists', async () => {
    jest.spyOn(orgPaymentAccountService, 'findByOrganization').mockResolvedValue({
      id: 'opa-1',
      organizationId,
      stripeConnectedAccountId: 'acct_existing',
      status: OrganizationPaymentAccountStatus.ACTIVE,
    } as never);
    jest.spyOn(orgPaymentAccountService, 'syncConnectedAccountStatus').mockResolvedValue({
      id: 'opa-1',
      organizationId,
      stripeConnectedAccountId: 'acct_existing',
      status: OrganizationPaymentAccountStatus.ACTIVE,
    } as never);

    const result = await service.createConnectedAccount(organizationId, actor);

    expect(adapter.createConnectedAccount).not.toHaveBeenCalled();
    expect(adapter.refreshConnectedAccount).toHaveBeenCalledWith('acct_existing');
    expect(result.account.stripeConnectedAccountId).toBe('acct_existing');
  });

  it('throws CONNECT_NOT_CONFIGURED when onboarding without local account', async () => {
    jest.spyOn(orgPaymentAccountService, 'findByOrganization').mockResolvedValue(null);
    await expect(
      service.createOnboardingSession(organizationId, actor),
    ).rejects.toBeInstanceOf(ConnectNotConfiguredError);
  });

  it('rejects invalid onboarding redirect URL origin', async () => {
    jest.spyOn(orgPaymentAccountService, 'findByOrganization').mockResolvedValue({
      id: 'opa-1',
      organizationId,
      stripeConnectedAccountId: 'acct_test_1',
      status: OrganizationPaymentAccountStatus.ONBOARDING,
    } as never);
    (configService.get as jest.Mock).mockImplementation((key: string, defaultValue?: unknown) => {
      const map: Record<string, unknown> = {
        'stripe.secretKey': 'sk_test_123',
        'stripe.connectReturnUrl': 'https://app.example/return',
        'stripe.connectRefreshUrl': 'https://app.example/refresh',
        'stripe.portalReturnUrl': 'https://app.example/portal',
        'app.corsOrigins': ['https://app.example'],
      };
      return map[key] ?? defaultValue;
    });

    await expect(
      service.createOnboardingSession(organizationId, actor, {
        returnUrl: 'https://evil.example/redirect',
      }),
    ).rejects.toThrow('Redirect URL origin is not allowed');
    expect(adapter.createOnboardingSession).not.toHaveBeenCalled();
  });

  it('returns stored status from database without live Stripe fetch', async () => {
    jest.spyOn(orgPaymentAccountService, 'findByOrganization').mockResolvedValue({
      id: 'opa-1',
      organizationId,
      stripeConnectedAccountId: 'acct_test_1',
      status: OrganizationPaymentAccountStatus.ONBOARDING,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      disabledReason: null,
      requirementsCurrentlyDue: ['external_account'],
      requirementsPastDue: [],
      requirementsPendingVerification: [],
      country: 'DE',
      defaultCurrency: 'EUR',
      livemode: false,
    } as never);

    const result = await service.getStoredConnectStatus(organizationId, actor);

    expect(adapter.getConnectedAccountStatus).not.toHaveBeenCalled();
    expect(result.status.status).toBe(OrganizationPaymentAccountStatus.ONBOARDING);
    expect(result.status.chargesEnabled).toBe(false);
  });

  it('scopes refresh to organization tenant with manage permission', async () => {
    jest.spyOn(orgPaymentAccountService, 'findByOrganization').mockResolvedValue({
      id: 'opa-1',
      organizationId,
      stripeConnectedAccountId: 'acct_test_1',
      status: OrganizationPaymentAccountStatus.ACTIVE,
    } as never);
    jest.spyOn(orgPaymentAccountService, 'syncConnectedAccountStatus').mockResolvedValue({
      id: 'opa-1',
      organizationId,
      stripeConnectedAccountId: 'acct_test_1',
    } as never);

    await service.refreshConnectedAccount(organizationId, actor);

    expect(paymentsAccess.assertPaymentPermission).toHaveBeenCalledWith(
      organizationId,
      actor,
      'payments.connect.manage',
    );
    expect(adapter.refreshConnectedAccount).toHaveBeenCalledWith('acct_test_1');
  });
});
