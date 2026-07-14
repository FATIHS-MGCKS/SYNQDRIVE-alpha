import { Injectable } from '@nestjs/common';
import {
  OrganizationPaymentAccount,
  OrganizationPaymentAccountStatus,
  PaymentProvider,
  Prisma,
  StripeAccountGeneration,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface CreateOrganizationPaymentAccountInput {
  organizationId: string;
  provider?: PaymentProvider;
  status?: OrganizationPaymentAccountStatus;
  stripeConnectedAccountId?: string | null;
  stripeAccountGeneration?: StripeAccountGeneration;
  livemode?: boolean;
  country?: string | null;
  defaultCurrency?: string;
}

export interface UpdateOrganizationPaymentAccountInput {
  status?: OrganizationPaymentAccountStatus;
  stripeConnectedAccountId?: string | null;
  stripeAccountGeneration?: StripeAccountGeneration;
  livemode?: boolean;
  country?: string | null;
  defaultCurrency?: string;
  detailsSubmitted?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  disabledReason?: string | null;
  requirementsCurrentlyDue?: Prisma.InputJsonValue;
  requirementsPastDue?: Prisma.InputJsonValue;
  requirementsPendingVerification?: Prisma.InputJsonValue;
  bankAccountLast4?: string | null;
  lastSyncedAt?: Date | null;
  lastStripeEventAt?: Date | null;
}

@Injectable()
export class OrganizationPaymentAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByOrgAndProvider(
    organizationId: string,
    provider: PaymentProvider = PaymentProvider.STRIPE,
  ): Promise<OrganizationPaymentAccount | null> {
    return this.prisma.organizationPaymentAccount.findUnique({
      where: { organizationId_provider: { organizationId, provider } },
    });
  }

  findByStripeConnectedAccountId(
    stripeConnectedAccountId: string,
  ): Promise<OrganizationPaymentAccount | null> {
    return this.prisma.organizationPaymentAccount.findUnique({
      where: { stripeConnectedAccountId },
    });
  }

  create(data: CreateOrganizationPaymentAccountInput): Promise<OrganizationPaymentAccount> {
    return this.prisma.organizationPaymentAccount.create({
      data: {
        organizationId: data.organizationId,
        provider: data.provider ?? PaymentProvider.STRIPE,
        status: data.status ?? OrganizationPaymentAccountStatus.PENDING,
        stripeConnectedAccountId: data.stripeConnectedAccountId ?? null,
        stripeAccountGeneration: data.stripeAccountGeneration ?? StripeAccountGeneration.V1,
        livemode: data.livemode ?? false,
        country: data.country ?? null,
        defaultCurrency: data.defaultCurrency ?? 'EUR',
      },
    });
  }

  update(
    id: string,
    organizationId: string,
    data: UpdateOrganizationPaymentAccountInput,
  ): Promise<OrganizationPaymentAccount> {
    return this.prisma.organizationPaymentAccount.update({
      where: { id, organizationId },
      data,
    });
  }
}
