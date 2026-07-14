import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { OrganizationPaymentAccountStatus } from '@prisma/client';
import { PAYMENT_PERMISSION_KEY } from './decorators/require-payment-permission.decorator';
import { PaymentsConnectController } from './payments-connect.controller';
import { PaymentsFeatureGuard } from './guards/payments-feature.guard';
import { PaymentsPermissionGuard } from './guards/payments-permission.guard';
import { StripeConnectAccountService } from './stripe-connect-account.service';
import {
  ConnectAccountRestrictedError,
  ConnectNotConfiguredError,
  ConnectProviderError,
  PaymentsFeatureDisabledConnectError,
  StripeModeMismatchError,
} from './stripe/stripe-connect.errors';

function paymentPermissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PAYMENT_PERMISSION_KEY, handler);
}

describe('PaymentsConnectController security', () => {
  it('uses org-scoped payments connect route', () => {
    const path = Reflect.getMetadata('path', PaymentsConnectController);
    expect(path).toBe('organizations/:orgId/payments/connect');
  });

  it('applies OrgScopingGuard, PaymentsFeatureGuard, PaymentsPermissionGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, PaymentsConnectController);
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, PaymentsFeatureGuard, PaymentsPermissionGuard]),
    );
  });

  it('requires manage permission for account create, onboarding, refresh', () => {
    expect(paymentPermissionOf(PaymentsConnectController.prototype, 'createAccount')).toBe(
      'payments.connect.manage',
    );
    expect(paymentPermissionOf(PaymentsConnectController.prototype, 'createOnboardingLink')).toBe(
      'payments.connect.manage',
    );
    expect(paymentPermissionOf(PaymentsConnectController.prototype, 'refreshStatus')).toBe(
      'payments.connect.manage',
    );
  });

  it('requires read permission for status', () => {
    expect(paymentPermissionOf(PaymentsConnectController.prototype, 'getStatus')).toBe(
      'payments.connect.read',
    );
  });
});

describe('PaymentsConnectController', () => {
  const orgId = 'org-1';
  const actor = { id: 'user-1', organizationId: orgId };

  const baseAccount = {
    id: 'opa-1',
    organizationId: orgId,
    status: OrganizationPaymentAccountStatus.ONBOARDING,
    detailsSubmitted: false,
    chargesEnabled: false,
    payoutsEnabled: false,
    disabledReason: null,
    requirementsCurrentlyDue: ['external_account'],
    requirementsPastDue: [],
    requirementsPendingVerification: [],
    bankAccountLast4: null,
    country: 'DE',
    defaultCurrency: 'EUR',
    lastSyncedAt: new Date('2026-07-14T12:00:00.000Z'),
    livemode: false,
  };

  const stripeConnectAccountService = {
    createConnectedAccount: jest.fn(),
    createOnboardingSession: jest.fn(),
    getStoredConnectStatus: jest.fn(),
    refreshConnectedAccount: jest.fn(),
  };

  let controller: PaymentsConnectController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PaymentsConnectController(
      stripeConnectAccountService as unknown as StripeConnectAccountService,
    );
    stripeConnectAccountService.createConnectedAccount.mockResolvedValue({
      organizationId: orgId,
      account: baseAccount,
      status: {},
    });
    stripeConnectAccountService.getStoredConnectStatus.mockResolvedValue({
      organizationId: orgId,
      account: baseAccount,
      status: {},
    });
    stripeConnectAccountService.refreshConnectedAccount.mockResolvedValue({
      organizationId: orgId,
      account: {
        ...baseAccount,
        status: OrganizationPaymentAccountStatus.ACTIVE,
        detailsSubmitted: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        lastSyncedAt: new Date('2026-07-14T13:00:00.000Z'),
      },
      status: {},
    });
    stripeConnectAccountService.createOnboardingSession.mockResolvedValue({
      url: 'https://connect.stripe.com/setup/s/acct_test',
      expiresAt: new Date('2026-07-14T12:05:00.000Z'),
    });
  });

  it('creates account and returns safe status fields only', async () => {
    const result = await controller.createAccount(orgId, { user: actor });

    expect(stripeConnectAccountService.createConnectedAccount).toHaveBeenCalledWith(orgId, actor);
    expect(result).toEqual({
      onboardingStatus: OrganizationPaymentAccountStatus.ONBOARDING,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      disabledReason: null,
      requirementsCurrentlyDue: ['external_account'],
      requirementsPastDue: [],
      bankAccountLast4: null,
      country: 'DE',
      defaultCurrency: 'EUR',
      lastSyncedAt: '2026-07-14T12:00:00.000Z',
    });
    expect(result).not.toHaveProperty('stripeConnectedAccountId');
  });

  it('returns stored server-side status without implying active from redirect', async () => {
    const result = await controller.getStatus(orgId, { user: actor });

    expect(stripeConnectAccountService.getStoredConnectStatus).toHaveBeenCalledWith(orgId, actor);
    expect(result.onboardingStatus).toBe(OrganizationPaymentAccountStatus.ONBOARDING);
    expect(result.chargesEnabled).toBe(false);
  });

  it('refreshes status from Stripe sync path', async () => {
    const result = await controller.refreshStatus(orgId, { user: actor });

    expect(stripeConnectAccountService.refreshConnectedAccount).toHaveBeenCalledWith(orgId, actor);
    expect(result.onboardingStatus).toBe(OrganizationPaymentAccountStatus.ACTIVE);
    expect(result.chargesEnabled).toBe(true);
  });

  it('returns short-lived onboarding link without persisting secrets', async () => {
    const result = await controller.createOnboardingLink(
      orgId,
      { returnUrl: 'https://app.synqdrive.eu/rental/settings/payments' },
      { user: actor },
    );

    expect(stripeConnectAccountService.createOnboardingSession).toHaveBeenCalledWith(
      orgId,
      actor,
      {
        returnUrl: 'https://app.synqdrive.eu/rental/settings/payments',
        refreshUrl: undefined,
      },
    );
    expect(result).toEqual({
      url: 'https://connect.stripe.com/setup/s/acct_test',
      expiresAt: '2026-07-14T12:05:00.000Z',
    });
  });

  it('propagates feature disabled error', async () => {
    stripeConnectAccountService.createConnectedAccount.mockRejectedValue(
      new PaymentsFeatureDisabledConnectError(orgId),
    );
    await expect(controller.createAccount(orgId, { user: actor })).rejects.toBeInstanceOf(
      PaymentsFeatureDisabledConnectError,
    );
  });

  it('propagates permission errors from service layer', async () => {
    stripeConnectAccountService.getStoredConnectStatus.mockRejectedValue(
      new ForbiddenException('Insufficient payment permissions'),
    );
    await expect(controller.getStatus(orgId, { user: actor })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('propagates invalid return URL errors', async () => {
    stripeConnectAccountService.createOnboardingSession.mockRejectedValue(
      new BadRequestException('Redirect URL origin is not allowed'),
    );
    await expect(
      controller.createOnboardingLink(orgId, { returnUrl: 'https://evil.example/x' }, { user: actor }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('propagates restricted account errors', async () => {
    stripeConnectAccountService.createOnboardingSession.mockRejectedValue(
      new ConnectAccountRestrictedError('requirements.past_due'),
    );
    await expect(controller.createOnboardingLink(orgId, {}, { user: actor })).rejects.toBeInstanceOf(
      ConnectAccountRestrictedError,
    );
  });

  it('propagates stripe mode mismatch', async () => {
    stripeConnectAccountService.refreshConnectedAccount.mockRejectedValue(
      new StripeModeMismatchError(),
    );
    await expect(controller.refreshStatus(orgId, { user: actor })).rejects.toBeInstanceOf(
      StripeModeMismatchError,
    );
  });

  it('propagates stripe provider outage', async () => {
    stripeConnectAccountService.createConnectedAccount.mockRejectedValue(
      new ConnectProviderError('Stripe API unavailable'),
    );
    await expect(controller.createAccount(orgId, { user: actor })).rejects.toBeInstanceOf(
      ConnectProviderError,
    );
  });

  it('propagates missing account configuration', async () => {
    stripeConnectAccountService.createOnboardingSession.mockRejectedValue(
      new ConnectNotConfiguredError('No Stripe connected account exists for this organization'),
    );
    await expect(controller.createOnboardingLink(orgId, {}, { user: actor })).rejects.toBeInstanceOf(
      ConnectNotConfiguredError,
    );
  });

  it('is idempotent when account already exists via create endpoint', async () => {
    stripeConnectAccountService.createConnectedAccount
      .mockResolvedValueOnce({
        organizationId: orgId,
        account: baseAccount,
        status: {},
      })
      .mockResolvedValueOnce({
        organizationId: orgId,
        account: {
          ...baseAccount,
          status: OrganizationPaymentAccountStatus.ACTIVE,
          detailsSubmitted: true,
          chargesEnabled: true,
        },
        status: {},
      });

    const first = await controller.createAccount(orgId, { user: actor });
    const second = await controller.createAccount(orgId, { user: actor });

    expect(stripeConnectAccountService.createConnectedAccount).toHaveBeenCalledTimes(2);
    expect(first.onboardingStatus).toBe(OrganizationPaymentAccountStatus.ONBOARDING);
    expect(second.onboardingStatus).toBe(OrganizationPaymentAccountStatus.ACTIVE);
  });
});
