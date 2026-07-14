import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrganizationPaymentAccount,
  OrganizationPaymentAccountStatus,
  PaymentProvider,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { PermissionActor } from '@shared/auth/permission.util';
import { PaymentsAccessService } from './payments-access.service';
import { OrganizationPaymentAccountService } from './organization-payment-account.service';
import { STRIPE_CONNECT_ADAPTER, type StripeConnectAdapter } from './stripe/stripe-connect.adapter';
import {
  ConnectAccountRestrictedError,
  ConnectNotConfiguredError,
  PaymentsFeatureDisabledConnectError,
  StripeConnectDomainError,
} from './stripe/stripe-connect.errors';
import { assertConnectTestModeOnly } from './stripe/stripe-connect-client.util';
import { resolveAllowedConnectRedirectUrl } from './utils/payments-connect-url.util';
import type {
  ConnectedAccountStatus,
  OnboardingSessionRef,
  SafePayoutSummary,
} from './stripe/stripe-connect.types';
import type { OrganizationProfileForConnect } from './organization-payment-account.service';

export interface ConnectAccountContext {
  organizationId: string;
  account: OrganizationPaymentAccount;
  status: ConnectedAccountStatus;
}

@Injectable()
export class StripeConnectAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly paymentsAccess: PaymentsAccessService,
    private readonly organizationPaymentAccountService: OrganizationPaymentAccountService,
    @Inject(STRIPE_CONNECT_ADAPTER) private readonly stripeConnectAdapter: StripeConnectAdapter,
  ) {}

  async createConnectedAccount(
    organizationId: string,
    actor: PermissionActor,
  ): Promise<ConnectAccountContext> {
    await this.assertConnectManageAccess(organizationId, actor);
    this.assertStripeConfigured();

    const org = await this.loadOrganizationProfile(organizationId);

    const existing = await this.organizationPaymentAccountService.findByOrganization(organizationId);
    if (existing?.stripeConnectedAccountId) {
      return this.refreshConnectedAccount(organizationId, actor);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`connect:${organizationId}`}))`;

      const locked = await tx.organizationPaymentAccount.findUnique({
        where: {
          organizationId_provider: {
            organizationId,
            provider: PaymentProvider.STRIPE,
          },
        },
      });

      if (locked?.stripeConnectedAccountId) {
        const status = await this.stripeConnectAdapter.refreshConnectedAccount(
          locked.stripeConnectedAccountId,
        );
        const payout = await this.stripeConnectAdapter.getSafePayoutSummary(
          locked.stripeConnectedAccountId,
        );
        const updated = await tx.organizationPaymentAccount.update({
          where: { id: locked.id },
          data: this.organizationPaymentAccountService.buildStatusUpdate(status, payout),
        });
        return { organizationId, account: updated, status };
      }

      let row = locked;
      if (!row) {
        try {
          row = await tx.organizationPaymentAccount.create({
            data: {
              organizationId,
              provider: PaymentProvider.STRIPE,
              status: OrganizationPaymentAccountStatus.PENDING,
              livemode: false,
              defaultCurrency: 'EUR',
            },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError
            && error.code === 'P2002'
          ) {
            const raced = await tx.organizationPaymentAccount.findUnique({
              where: {
                organizationId_provider: { organizationId, provider: PaymentProvider.STRIPE },
              },
            });
            if (raced?.stripeConnectedAccountId) {
              const status = await this.stripeConnectAdapter.refreshConnectedAccount(
                raced.stripeConnectedAccountId,
              );
              const payout = await this.stripeConnectAdapter.getSafePayoutSummary(
                raced.stripeConnectedAccountId,
              );
              const updated = await tx.organizationPaymentAccount.update({
                where: { id: raced.id },
                data: this.organizationPaymentAccountService.buildStatusUpdate(status, payout),
              });
              return { organizationId, account: updated, status };
            }
            row = raced;
          } else {
            throw error;
          }
        }
      }

      if (!row) {
        throw new ConnectNotConfiguredError('Failed to reserve payment account row');
      }

      const accountRef = await this.stripeConnectAdapter.createConnectedAccount({
        organizationId,
        country: org.country ?? 'DE',
        email: org.email ?? org.managerEmail!,
        defaultCurrency: 'EUR',
        companyName: org.companyName,
      });

      const status = await this.stripeConnectAdapter.getConnectedAccountStatus(
        accountRef.connectedAccountId,
      );
      const payout = await this.stripeConnectAdapter.getSafePayoutSummary(
        accountRef.connectedAccountId,
      );

      const updated = await tx.organizationPaymentAccount.update({
        where: { id: row.id },
        data: {
          stripeConnectedAccountId: accountRef.connectedAccountId,
          stripeAccountGeneration: accountRef.generation,
          ...this.organizationPaymentAccountService.buildStatusUpdate(status, payout),
        },
      });

      return { organizationId, account: updated, status };
    });
  }

  async getStoredConnectStatus(
    organizationId: string,
    actor: PermissionActor,
  ): Promise<ConnectAccountContext> {
    await this.assertConnectReadAccess(organizationId, actor);
    const account = await this.requireLocalAccount(organizationId);
    return {
      organizationId,
      account,
      status: this.mapStoredAccountToStatus(account),
    };
  }

  async getConnectedAccountStatus(
    organizationId: string,
    actor: PermissionActor,
  ): Promise<ConnectAccountContext> {
    await this.assertConnectReadAccess(organizationId, actor);
    const account = await this.requireLocalAccount(organizationId);
    const status = await this.stripeConnectAdapter.getConnectedAccountStatus(
      account.stripeConnectedAccountId!,
    );
    return { organizationId, account, status };
  }

  async createOnboardingSession(
    organizationId: string,
    actor: PermissionActor,
    urls?: { returnUrl?: string; refreshUrl?: string },
  ): Promise<OnboardingSessionRef> {
    await this.assertConnectManageAccess(organizationId, actor);
    this.assertStripeConfigured();

    const account = await this.requireLocalAccount(organizationId);
    const connectedAccountId = account.stripeConnectedAccountId!;

    if (account.status === OrganizationPaymentAccountStatus.DISABLED
      || account.status === OrganizationPaymentAccountStatus.REJECTED) {
      throw new ConnectAccountRestrictedError(account.disabledReason);
    }

    return this.stripeConnectAdapter.createOnboardingSession({
      connectedAccountId,
      returnUrl: resolveAllowedConnectRedirectUrl(
        this.configService,
        urls?.returnUrl,
        'stripe.connectReturnUrl',
      ),
      refreshUrl: resolveAllowedConnectRedirectUrl(
        this.configService,
        urls?.refreshUrl,
        'stripe.connectRefreshUrl',
      ),
    });
  }

  async refreshConnectedAccount(
    organizationId: string,
    actor: PermissionActor,
  ): Promise<ConnectAccountContext> {
    await this.assertConnectManageAccess(organizationId, actor);
    const account = await this.requireLocalAccount(organizationId);
    const connectedAccountId = account.stripeConnectedAccountId!;

    const status = await this.stripeConnectAdapter.refreshConnectedAccount(connectedAccountId);
    const payout = await this.stripeConnectAdapter.getSafePayoutSummary(connectedAccountId);

    const updated = await this.organizationPaymentAccountService.syncConnectedAccountStatus(
      organizationId,
      account.id,
      status,
      payout,
    );

    return { organizationId, account: updated, status };
  }

  async getSafePayoutSummary(
    organizationId: string,
    actor: PermissionActor,
  ): Promise<SafePayoutSummary> {
    await this.assertConnectReadAccess(organizationId, actor);
    const account = await this.requireLocalAccount(organizationId);
    return this.stripeConnectAdapter.getSafePayoutSummary(account.stripeConnectedAccountId!);
  }

  private async assertConnectManageAccess(
    organizationId: string,
    actor: PermissionActor,
  ): Promise<void> {
    await this.assertPaymentsFeature(organizationId, actor);
    await this.paymentsAccess.assertPaymentPermission(
      organizationId,
      actor,
      'payments.connect.manage',
    );
  }

  private async assertConnectReadAccess(
    organizationId: string,
    actor: PermissionActor,
  ): Promise<void> {
    await this.assertPaymentsFeature(organizationId, actor);
    await this.paymentsAccess.assertPaymentPermission(
      organizationId,
      actor,
      'payments.connect.read',
    );
  }

  private async assertPaymentsFeature(
    organizationId: string,
    actor: PermissionActor,
  ): Promise<void> {
    try {
      await this.paymentsAccess.assertPaymentsFeatureEnabled(organizationId, actor);
    } catch {
      throw new PaymentsFeatureDisabledConnectError(organizationId);
    }
  }

  private assertStripeConfigured(): void {
    const secretKey = this.configService.get<string>('stripe.secretKey') ?? '';
    if (!secretKey) {
      throw new ConnectNotConfiguredError('STRIPE_SECRET_KEY is not configured');
    }
    assertConnectTestModeOnly(secretKey);
  }

  private async loadOrganizationProfile(
    organizationId: string,
  ): Promise<OrganizationProfileForConnect> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        companyName: true,
        country: true,
        email: true,
        managerEmail: true,
        paymentsEnabled: true,
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    if (!org.companyName?.trim()) {
      throw new StripeConnectDomainError(
        'Organization company name is required before Connect onboarding',
        'CONNECT_NOT_CONFIGURED',
      );
    }

    const email = org.email?.trim() || org.managerEmail?.trim();
    if (!email) {
      throw new StripeConnectDomainError(
        'Organization contact email is required before Connect onboarding',
        'CONNECT_NOT_CONFIGURED',
      );
    }

    return { ...org, country: org.country?.trim() || 'DE' };
  }

  private mapStoredAccountToStatus(
    account: OrganizationPaymentAccount,
  ): ConnectedAccountStatus {
    return {
      status: account.status,
      detailsSubmitted: account.detailsSubmitted,
      chargesEnabled: account.chargesEnabled,
      payoutsEnabled: account.payoutsEnabled,
      disabledReason: account.disabledReason,
      requirements: {
        currentlyDue: Array.isArray(account.requirementsCurrentlyDue)
          ? (account.requirementsCurrentlyDue as string[])
          : [],
        pastDue: Array.isArray(account.requirementsPastDue)
          ? (account.requirementsPastDue as string[])
          : [],
        pendingVerification: Array.isArray(account.requirementsPendingVerification)
          ? (account.requirementsPendingVerification as string[])
          : [],
      },
      country: account.country,
      defaultCurrency: account.defaultCurrency,
      livemode: account.livemode,
    };
  }

  private async requireLocalAccount(
    organizationId: string,
  ): Promise<OrganizationPaymentAccount> {
    const account = await this.organizationPaymentAccountService.findByOrganization(organizationId);
    if (!account?.stripeConnectedAccountId) {
      throw new ConnectNotConfiguredError(
        'No Stripe connected account exists for this organization',
      );
    }
    return account;
  }
}
