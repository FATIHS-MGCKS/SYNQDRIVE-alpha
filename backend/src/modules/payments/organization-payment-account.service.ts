import { Injectable } from '@nestjs/common';
import {
  OrganizationPaymentAccount,
  OrganizationPaymentAccountStatus,
  PaymentProvider,
  Prisma,
} from '@prisma/client';
import type {
  ConnectedAccountRef,
  ConnectedAccountStatus,
  SafePayoutSummary,
} from './stripe/stripe-connect.types';
import { OrganizationPaymentAccountRepository } from './repositories/organization-payment-account.repository';

export interface OrganizationProfileForConnect {
  id: string;
  companyName: string;
  country: string | null;
  email: string | null;
  managerEmail: string | null;
  paymentsEnabled: boolean;
}

@Injectable()
export class OrganizationPaymentAccountService {
  constructor(private readonly repository: OrganizationPaymentAccountRepository) {}

  findByOrganization(
    organizationId: string,
    provider: PaymentProvider = PaymentProvider.STRIPE,
  ): Promise<OrganizationPaymentAccount | null> {
    return this.repository.findByOrgAndProvider(organizationId, provider);
  }

  buildStatusUpdate(
    status: ConnectedAccountStatus,
    payoutSummary?: SafePayoutSummary | null,
    syncedAt: Date = new Date(),
  ) {
    return {
      status: status.status,
      detailsSubmitted: status.detailsSubmitted,
      chargesEnabled: status.chargesEnabled,
      payoutsEnabled: status.payoutsEnabled,
      disabledReason: status.disabledReason,
      requirementsCurrentlyDue: status.requirements.currentlyDue as Prisma.InputJsonValue,
      requirementsPastDue: status.requirements.pastDue as Prisma.InputJsonValue,
      requirementsPendingVerification:
        status.requirements.pendingVerification as Prisma.InputJsonValue,
      country: status.country,
      defaultCurrency: status.defaultCurrency,
      livemode: status.livemode,
      bankAccountLast4: payoutSummary?.bankAccountLast4 ?? undefined,
      lastSyncedAt: syncedAt,
    };
  }

  async persistConnectedAccountRef(
    organizationId: string,
    accountRef: ConnectedAccountRef,
    status: ConnectedAccountStatus,
    payoutSummary?: SafePayoutSummary | null,
  ): Promise<OrganizationPaymentAccount> {
    const existing = await this.repository.findByOrgAndProvider(organizationId);
    const patch = {
      stripeConnectedAccountId: accountRef.connectedAccountId,
      stripeAccountGeneration: accountRef.generation,
      ...this.buildStatusUpdate(status, payoutSummary),
    };

    if (existing) {
      return this.repository.update(existing.id, organizationId, patch);
    }

    return this.repository.create({
      organizationId,
      provider: PaymentProvider.STRIPE,
      status: status.status ?? OrganizationPaymentAccountStatus.PENDING,
      stripeConnectedAccountId: accountRef.connectedAccountId,
      stripeAccountGeneration: accountRef.generation,
      livemode: accountRef.livemode,
      country: status.country,
      defaultCurrency: status.defaultCurrency,
    }).then((created) => this.repository.update(created.id, organizationId, patch));
  }

  async syncConnectedAccountStatus(
    organizationId: string,
    accountId: string,
    status: ConnectedAccountStatus,
    payoutSummary?: SafePayoutSummary | null,
  ): Promise<OrganizationPaymentAccount> {
    return this.repository.update(accountId, organizationId, this.buildStatusUpdate(status, payoutSummary));
  }
}
