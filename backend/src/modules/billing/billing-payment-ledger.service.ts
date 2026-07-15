import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingCreditNoteStatus,
  BillingManualPaymentType,
  BillingPaymentAttemptStatus,
  BillingPaymentProvider,
  BillingPaymentStatus,
  BillingRefundStatus,
  BillingStripeMode,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingAuditService } from './billing-audit.service';
import { BillingDomainEventOutboxService } from './billing-domain-event-outbox.service';
import { BillingDomainEventType } from './domain/billing-domain.events';
import {
  BillingPaymentLedgerErrorCode,
  computeRefundedTotal,
  reconcilePaymentRefundState,
  resolveRefundPartialFlag,
  sanitizeProviderErrorMessage,
  SafePaymentLedgerView,
} from './domain/billing-payment-ledger';

export interface RecordPaymentInput {
  invoiceId: string;
  organizationId: string;
  amountCents: number;
  currency: string;
  status: BillingPaymentStatus;
  provider?: BillingPaymentProvider;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
  stripePaymentMethodId?: string | null;
  stripeMode?: BillingStripeMode | null;
  succeededAt?: Date | null;
  failedAt?: Date | null;
  cancelledAt?: Date | null;
  idempotencyKey: string;
  manualPaymentType?: BillingManualPaymentType | null;
  manualReference?: string | null;
  manualReceiptNote?: string | null;
  recordedByUserId?: string | null;
}

export interface AppendPaymentAttemptInput {
  paymentId: string;
  organizationId: string;
  amountCents: number;
  status: BillingPaymentAttemptStatus;
  provider?: BillingPaymentProvider;
  stripeChargeId?: string | null;
  stripeMode?: BillingStripeMode | null;
  errorCode?: string | null;
  declineCode?: string | null;
  errorMessage?: string | null;
  nextRetryAt?: Date | null;
  idempotencyKey: string;
}

export interface RecordRefundInput {
  paymentId: string;
  organizationId: string;
  invoiceId?: string | null;
  amountCents: number;
  currency: string;
  status: BillingRefundStatus;
  reason?: string | null;
  stripeRefundId?: string | null;
  stripeMode?: BillingStripeMode | null;
  refundedAt?: Date | null;
  idempotencyKey: string;
}

export interface RecordCreditNoteInput {
  invoiceId: string;
  organizationId: string;
  refundId?: string | null;
  amountCents: number;
  currency: string;
  status: BillingCreditNoteStatus;
  reason?: string | null;
  stripeCreditNoteId?: string | null;
  stripeMode?: BillingStripeMode | null;
  hostedUrl?: string | null;
  pdfUrl?: string | null;
  issuedAt?: Date | null;
  voidedAt?: Date | null;
  idempotencyKey: string;
}

@Injectable()
export class BillingPaymentLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: BillingDomainEventOutboxService,
    private readonly audit: BillingAuditService,
  ) {}

  async recordPayment(input: RecordPaymentInput) {
    if (input.amountCents <= 0) {
      throw new BadRequestException({
        code: BillingPaymentLedgerErrorCode.INVALID_AMOUNT,
        message: BillingPaymentLedgerErrorCode.INVALID_AMOUNT,
      });
    }

    const invoice = await this.prisma.billingInvoice.findUnique({
      where: { id: input.invoiceId },
      select: { id: true },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: BillingPaymentLedgerErrorCode.INVOICE_NOT_FOUND,
        message: BillingPaymentLedgerErrorCode.INVOICE_NOT_FOUND,
      });
    }

    const existingByKey = await this.prisma.billingPayment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existingByKey) {
      return existingByKey;
    }

    const provider = input.provider ?? BillingPaymentProvider.STRIPE;
    const remainingAmountCents = input.amountCents;

    return this.prisma.$transaction(async (tx) => {
      let payment;

      if (input.stripePaymentIntentId && input.stripeMode) {
        payment = await tx.billingPayment.upsert({
          where: {
            stripePaymentIntentId_stripeMode: {
              stripePaymentIntentId: input.stripePaymentIntentId,
              stripeMode: input.stripeMode,
            },
          },
          create: {
            invoiceId: input.invoiceId,
            amountCents: input.amountCents,
            currency: input.currency,
            status: input.status,
            provider,
            stripePaymentIntentId: input.stripePaymentIntentId,
            stripeChargeId: input.stripeChargeId ?? null,
            stripePaymentMethodId: input.stripePaymentMethodId ?? null,
            stripeMode: input.stripeMode,
            attemptCount: 0,
            refundedAmountCents: 0,
            remainingAmountCents,
            succeededAt: input.succeededAt ?? null,
            failedAt: input.failedAt ?? null,
            cancelledAt: input.cancelledAt ?? null,
            manualPaymentType: input.manualPaymentType ?? null,
            manualReference: input.manualReference ?? null,
            manualReceiptNote: input.manualReceiptNote ?? null,
            recordedByUserId: input.recordedByUserId ?? null,
            idempotencyKey: input.idempotencyKey,
          },
          update: {
            amountCents: input.amountCents,
            currency: input.currency,
            status: input.status,
            stripeChargeId: input.stripeChargeId ?? undefined,
            stripePaymentMethodId: input.stripePaymentMethodId ?? undefined,
            succeededAt: input.succeededAt ?? undefined,
            failedAt: input.failedAt ?? undefined,
            cancelledAt: input.cancelledAt ?? undefined,
            remainingAmountCents,
          },
        });
      } else {
        payment = await tx.billingPayment.create({
          data: {
            invoiceId: input.invoiceId,
            amountCents: input.amountCents,
            currency: input.currency,
            status: input.status,
            provider,
            stripePaymentIntentId: input.stripePaymentIntentId ?? null,
            stripeChargeId: input.stripeChargeId ?? null,
            stripePaymentMethodId: input.stripePaymentMethodId ?? null,
            stripeMode: input.stripeMode ?? null,
            attemptCount: 0,
            refundedAmountCents: 0,
            remainingAmountCents,
            succeededAt: input.succeededAt ?? null,
            failedAt: input.failedAt ?? null,
            cancelledAt: input.cancelledAt ?? null,
            manualPaymentType: input.manualPaymentType ?? null,
            manualReference: input.manualReference ?? null,
            manualReceiptNote: input.manualReceiptNote ?? null,
            recordedByUserId: input.recordedByUserId ?? null,
            idempotencyKey: input.idempotencyKey,
          },
        });
      }

      await this.outbox.enqueue(tx, {
        eventType:
          provider === BillingPaymentProvider.MANUAL
            ? BillingDomainEventType.MANUAL_PAYMENT_RECORDED
            : BillingDomainEventType.PAYMENT_RECORDED,
        aggregateType: 'BillingPayment',
        aggregateId: payment.id,
        idempotencyKey: `${input.idempotencyKey}:event`,
        payload: {
          organizationId: input.organizationId,
          paymentId: payment.id,
          invoiceId: input.invoiceId,
          status: payment.status,
          amountCents: payment.amountCents,
          provider,
        },
      });

      return payment;
    });
  }

  async appendPaymentAttempt(input: AppendPaymentAttemptInput) {
    const payment = await this.requirePayment(input.paymentId);

    const existing = await this.prisma.billingPaymentAttempt.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return { attempt: existing, duplicate: true as const };
    }

    const attempt = await this.prisma.$transaction(async (tx) => {
      const nextAttemptNumber = payment.attemptCount + 1;
      const row = await tx.billingPaymentAttempt.create({
        data: {
          paymentId: payment.id,
          attemptNumber: nextAttemptNumber,
          amountCents: input.amountCents,
          status: input.status,
          provider: input.provider ?? BillingPaymentProvider.STRIPE,
          stripeChargeId: input.stripeChargeId ?? null,
          stripeMode: input.stripeMode ?? null,
          errorCode: input.errorCode ?? null,
          declineCode: input.declineCode ?? null,
          errorMessage: input.errorMessage ?? null,
          safeErrorMessage: sanitizeProviderErrorMessage(input.errorMessage),
          nextRetryAt: input.nextRetryAt ?? null,
          idempotencyKey: input.idempotencyKey,
        },
      });

      await tx.billingPayment.update({
        where: { id: payment.id },
        data: { attemptCount: nextAttemptNumber },
      });

      return row;
    });

    return { attempt, duplicate: false as const };
  }

  async recordRefund(input: RecordRefundInput) {
    if (input.amountCents <= 0) {
      throw new BadRequestException({
        code: BillingPaymentLedgerErrorCode.INVALID_AMOUNT,
        message: BillingPaymentLedgerErrorCode.INVALID_AMOUNT,
      });
    }

    const payment = await this.requirePayment(input.paymentId);

    const existing = await this.prisma.billingRefund.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return { refund: existing, duplicate: true as const };
    }

    const priorRefunds = await this.prisma.billingRefund.findMany({
      where: { paymentId: payment.id },
      select: { amountCents: true, status: true },
    });
    const refundedBefore = computeRefundedTotal(priorRefunds);
    const isPartial = resolveRefundPartialFlag({
      refundAmountCents: input.amountCents,
      paymentAmountCents: payment.amountCents,
      refundedBeforeCents: refundedBefore,
    });

    const refund = await this.prisma.$transaction(async (tx) => {
      const row = await tx.billingRefund.create({
        data: {
          paymentId: payment.id,
          invoiceId: input.invoiceId ?? payment.invoiceId,
          amountCents: input.amountCents,
          currency: input.currency,
          status: input.status,
          isPartial,
          reason: input.reason ?? null,
          stripeRefundId: input.stripeRefundId ?? null,
          stripeMode: input.stripeMode ?? null,
          refundedAt:
            input.refundedAt ??
            (input.status === BillingRefundStatus.SUCCEEDED ? new Date() : null),
          idempotencyKey: input.idempotencyKey,
        },
      });

      await this.outbox.enqueue(tx, {
        eventType: BillingDomainEventType.REFUND_RECORDED,
        aggregateType: 'BillingRefund',
        aggregateId: row.id,
        idempotencyKey: `${input.idempotencyKey}:event`,
        payload: {
          organizationId: input.organizationId,
          refundId: row.id,
          paymentId: payment.id,
          amountCents: row.amountCents,
          isPartial: row.isPartial,
        },
      });

      return row;
    });

    if (input.status === BillingRefundStatus.SUCCEEDED) {
      await this.reconcilePaymentRefundState(payment.id);
    }

    return { refund, duplicate: false as const };
  }

  async recordCreditNote(input: RecordCreditNoteInput) {
    const invoice = await this.prisma.billingInvoice.findUnique({
      where: { id: input.invoiceId },
      select: { id: true },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: BillingPaymentLedgerErrorCode.INVOICE_NOT_FOUND,
        message: BillingPaymentLedgerErrorCode.INVOICE_NOT_FOUND,
      });
    }

    const existing = await this.prisma.billingCreditNote.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return { creditNote: existing, duplicate: true as const };
    }

    const creditNote = await this.prisma.$transaction(async (tx) => {
      const row = await tx.billingCreditNote.create({
        data: {
          invoiceId: input.invoiceId,
          refundId: input.refundId ?? null,
          amountCents: input.amountCents,
          currency: input.currency,
          status: input.status,
          reason: input.reason ?? null,
          stripeCreditNoteId: input.stripeCreditNoteId ?? null,
          stripeMode: input.stripeMode ?? null,
          hostedUrl: input.hostedUrl ?? null,
          pdfUrl: input.pdfUrl ?? null,
          issuedAt: input.issuedAt ?? null,
          voidedAt: input.voidedAt ?? null,
          idempotencyKey: input.idempotencyKey,
        },
      });

      await this.outbox.enqueue(tx, {
        eventType: BillingDomainEventType.CREDIT_NOTE_RECORDED,
        aggregateType: 'BillingCreditNote',
        aggregateId: row.id,
        idempotencyKey: `${input.idempotencyKey}:event`,
        payload: {
          organizationId: input.organizationId,
          creditNoteId: row.id,
          invoiceId: input.invoiceId,
          amountCents: row.amountCents,
          status: row.status,
        },
      });

      return row;
    });

    return { creditNote, duplicate: false as const };
  }

  async reconcilePaymentRefundState(paymentId: string) {
    const payment = await this.requirePayment(paymentId);
    const refunds = await this.prisma.billingRefund.findMany({
      where: { paymentId },
      select: { amountCents: true, status: true },
    });

    const refundedAmountCents = computeRefundedTotal(refunds);
    const reconciled = reconcilePaymentRefundState({
      paymentAmountCents: payment.amountCents,
      refundedAmountCents,
      currentStatus: payment.status,
    });

    return this.prisma.billingPayment.update({
      where: { id: paymentId },
      data: {
        status: reconciled.status,
        refundedAmountCents: reconciled.refundedAmountCents,
        remainingAmountCents: reconciled.remainingAmountCents,
      },
    });
  }

  async getInvoicePaymentLedger(invoiceId: string): Promise<SafePaymentLedgerView[]> {
    const payments = await this.prisma.billingPayment.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'asc' },
      include: {
        attempts: { orderBy: { attemptNumber: 'asc' } },
        refunds: { orderBy: { createdAt: 'asc' } },
      },
    });

    const creditNotes = await this.prisma.billingCreditNote.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'asc' },
    });

    return payments.map((payment, paymentIndex) => ({
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status: payment.status,
      provider: payment.provider,
      refundedAmountCents: payment.refundedAmountCents,
      remainingAmountCents: payment.remainingAmountCents,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      stripeChargeId: payment.stripeChargeId,
      stripePaymentMethodId: payment.stripePaymentMethodId,
      succeededAt: payment.succeededAt?.toISOString() ?? null,
      failedAt: payment.failedAt?.toISOString() ?? null,
      attempts: payment.attempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        errorCode: attempt.errorCode,
        declineCode: attempt.declineCode,
        safeErrorMessage: attempt.safeErrorMessage,
        nextRetryAt: attempt.nextRetryAt?.toISOString() ?? null,
        attemptedAt: attempt.attemptedAt.toISOString(),
      })),
      refunds: payment.refunds.map((refund) => ({
        id: refund.id,
        amountCents: refund.amountCents,
        status: refund.status,
        isPartial: refund.isPartial,
        reason: refund.reason,
        refundedAt: refund.refundedAt?.toISOString() ?? null,
      })),
      creditNotes: creditNotes
        .filter(
          (note) =>
            (note.refundId == null && paymentIndex === 0) ||
            payment.refunds.some((refund) => refund.id === note.refundId),
        )
        .map((note) => ({
          id: note.id,
          amountCents: note.amountCents,
          status: note.status,
          reason: note.reason,
          hostedUrl: note.hostedUrl,
          pdfUrl: note.pdfUrl,
          issuedAt: note.issuedAt?.toISOString() ?? null,
        })),
    }));
  }

  private async requirePayment(paymentId: string) {
    const payment = await this.prisma.billingPayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new NotFoundException({
        code: BillingPaymentLedgerErrorCode.PAYMENT_NOT_FOUND,
        message: BillingPaymentLedgerErrorCode.PAYMENT_NOT_FOUND,
      });
    }
    return payment;
  }
}
