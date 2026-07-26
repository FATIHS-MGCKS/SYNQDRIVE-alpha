import { ConflictException, HttpException } from '@nestjs/common';
import { BillingActivationGuardService } from './billing-activation-guard.service';
import { SubscriptionStatus } from './domain/billing-domain.types';
import { BillingActivationGuardErrorCode } from './domain/billing-activation-guard';

describe('BillingActivationGuardService', () => {
  const orgId = 'org-1';
  const subId = 'sub-1';

  const lifecycle = {
    getContractState: jest.fn(),
  };

  const orchestrator = {
    syncOrganizationSubscription: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string) => (key === 'stripe.secretKey' ? 'sk_test' : undefined)),
  };

  const stripeRetrieve = jest.fn();

  let service: BillingActivationGuardService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BillingActivationGuardService(
      configService as never,
      lifecycle as never,
      orchestrator as never,
    );
    jest.spyOn(require('./stripe-client.util'), 'getStripeClient').mockReturnValue({
      subscriptions: { retrieve: stripeRetrieve },
    });
  });

  it('rejects activation when contract is already ACTIVE', async () => {
    lifecycle.getContractState.mockResolvedValue({
      domainStatus: SubscriptionStatus.ACTIVE,
    });

    await expect(
      service.guardActivation({
        organizationId: orgId,
        subscriptionId: subId,
        commandIdempotencyKey: 'idem-1',
      }),
    ).rejects.toMatchObject({
      response: { code: BillingActivationGuardErrorCode.ALREADY_ACTIVE },
    });
    expect(orchestrator.syncOrganizationSubscription).not.toHaveBeenCalled();
  });

  it('syncs to Stripe and confirms before allowing activation', async () => {
    lifecycle.getContractState.mockResolvedValue({
      domainStatus: SubscriptionStatus.TRIALING,
    });
    orchestrator.syncOrganizationSubscription.mockResolvedValue({
      stripeSubscriptionId: 'sub_stripe_1',
    });
    stripeRetrieve.mockResolvedValue({ status: 'active' });

    const result = await service.guardActivation({
      organizationId: orgId,
      subscriptionId: subId,
      commandIdempotencyKey: 'idem-activate',
    });

    expect(orchestrator.syncOrganizationSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        subscriptionId: subId,
        contractDomainStatusOverride: SubscriptionStatus.ACTIVE,
        idempotencyKeySuffix: 'idem-activate',
      }),
    );
    expect(result).toEqual({
      stripeSubscriptionId: 'sub_stripe_1',
      stripeStatus: 'active',
    });
  });

  it('rejects when Stripe returns unconfirmed status', async () => {
    lifecycle.getContractState.mockResolvedValue({
      domainStatus: SubscriptionStatus.DRAFT,
    });
    orchestrator.syncOrganizationSubscription.mockResolvedValue({
      stripeSubscriptionId: 'sub_stripe_1',
    });
    stripeRetrieve.mockResolvedValue({ status: 'incomplete' });

    await expect(
      service.guardActivation({
        organizationId: orgId,
        subscriptionId: subId,
        commandIdempotencyKey: 'idem-2',
      }),
    ).rejects.toMatchObject({
      response: { code: BillingActivationGuardErrorCode.STRIPE_NOT_CONFIRMED },
    });
  });

  it('rejects when Stripe is not configured', async () => {
    const unconfigured = new BillingActivationGuardService(
      { get: () => undefined } as never,
      lifecycle as never,
      orchestrator as never,
    );

    await expect(
      unconfigured.syncStripeAndConfirmActivation({
        organizationId: orgId,
        subscriptionId: subId,
        commandIdempotencyKey: 'idem-3',
      }),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
