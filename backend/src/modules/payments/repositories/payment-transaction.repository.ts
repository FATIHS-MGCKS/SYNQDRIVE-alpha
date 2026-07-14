import { Injectable } from '@nestjs/common';
import {
  PaymentProvider,
  PaymentTransaction,
  PaymentTransactionStatus,
  PaymentTransactionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface AppendPaymentTransactionInput {
  organizationId: string;
  paymentRequestId: string;
  type: PaymentTransactionType;
  amountCents: number;
  currency?: string;
  status?: PaymentTransactionStatus;
  provider?: PaymentProvider;
  providerObjectType?: string | null;
  providerObjectId?: string | null;
  providerEventId?: string | null;
  parentTransactionId?: string | null;
  balanceImpactCents?: number;
  applicationFeeImpactCents?: number;
  occurredAt: Date;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Append-only ledger repository — exposes create/list only by design.
 */
@Injectable()
export class PaymentTransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  append(data: AppendPaymentTransactionInput): Promise<PaymentTransaction> {
    return this.prisma.paymentTransaction.create({
      data: {
        organizationId: data.organizationId,
        paymentRequestId: data.paymentRequestId,
        type: data.type,
        amountCents: data.amountCents,
        currency: data.currency ?? 'EUR',
        status: data.status ?? PaymentTransactionStatus.PENDING,
        provider: data.provider ?? PaymentProvider.STRIPE,
        providerObjectType: data.providerObjectType ?? null,
        providerObjectId: data.providerObjectId ?? null,
        providerEventId: data.providerEventId ?? null,
        parentTransactionId: data.parentTransactionId ?? null,
        balanceImpactCents: data.balanceImpactCents ?? 0,
        applicationFeeImpactCents: data.applicationFeeImpactCents ?? 0,
        occurredAt: data.occurredAt,
        metadata: data.metadata,
      },
    });
  }

  listByPaymentRequest(
    organizationId: string,
    paymentRequestId: string,
  ): Promise<PaymentTransaction[]> {
    return this.prisma.paymentTransaction.findMany({
      where: { organizationId, paymentRequestId },
      orderBy: { occurredAt: 'asc' },
    });
  }

  findByProviderEvent(
    provider: PaymentProvider,
    providerEventId: string,
    type: PaymentTransactionType,
  ): Promise<PaymentTransaction | null> {
    return this.prisma.paymentTransaction.findUnique({
      where: {
        provider_providerEventId_type: { provider, providerEventId, type },
      },
    });
  }
}
