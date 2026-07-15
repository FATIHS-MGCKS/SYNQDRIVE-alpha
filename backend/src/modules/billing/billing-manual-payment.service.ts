import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingManualPaymentType,
  BillingPaymentProvider,
  BillingPaymentStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingAuditService } from './billing-audit.service';
import { BillingPaymentLedgerService } from './billing-payment-ledger.service';
import { BillingPaymentLedgerErrorCode } from './domain/billing-payment-ledger';

export interface RecordManualPaymentInput {
  invoiceId: string;
  organizationId: string;
  amountCents: number;
  currency?: string;
  paymentType: BillingManualPaymentType;
  reference?: string | null;
  receiptNote?: string | null;
  actorUserId: string;
  idempotencyKey: string;
}

@Injectable()
export class BillingManualPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: BillingPaymentLedgerService,
    private readonly audit: BillingAuditService,
  ) {}

  async recordManualPayment(input: RecordManualPaymentInput) {
    if (input.amountCents <= 0) {
      throw new BadRequestException({
        code: BillingPaymentLedgerErrorCode.INVALID_AMOUNT,
        message: BillingPaymentLedgerErrorCode.INVALID_AMOUNT,
      });
    }

    const invoice = await this.prisma.billingInvoice.findUnique({
      where: { id: input.invoiceId },
      select: {
        id: true,
        currency: true,
        subscription: { select: { organizationId: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundException({
        code: BillingPaymentLedgerErrorCode.INVOICE_NOT_FOUND,
        message: BillingPaymentLedgerErrorCode.INVOICE_NOT_FOUND,
      });
    }

    if (invoice.subscription.organizationId !== input.organizationId) {
      throw new ForbiddenException({
        code: BillingPaymentLedgerErrorCode.MANUAL_PAYMENT_NOT_ALLOWED,
        message: BillingPaymentLedgerErrorCode.MANUAL_PAYMENT_NOT_ALLOWED,
      });
    }

    const payment = await this.ledger.recordPayment({
      invoiceId: invoice.id,
      organizationId: input.organizationId,
      amountCents: input.amountCents,
      currency: (input.currency ?? invoice.currency ?? 'eur').toLowerCase(),
      status: BillingPaymentStatus.SUCCEEDED,
      provider: BillingPaymentProvider.MANUAL,
      succeededAt: new Date(),
      manualPaymentType: input.paymentType,
      manualReference: input.reference ?? null,
      manualReceiptNote: input.receiptNote ?? null,
      recordedByUserId: input.actorUserId,
      idempotencyKey: input.idempotencyKey,
    });

    await this.audit.log({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'BILLING_MANUAL_PAYMENT_RECORDED',
      entityType: 'BillingPayment',
      entityId: payment.id,
      idempotencyKey: input.idempotencyKey,
      after: {
        invoiceId: invoice.id,
        amountCents: payment.amountCents,
        paymentType: input.paymentType,
        reference: input.reference ?? null,
        receiptNote: input.receiptNote ?? null,
      },
    });

    return payment;
  }
}
