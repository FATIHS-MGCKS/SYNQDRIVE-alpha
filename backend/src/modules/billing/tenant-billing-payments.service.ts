import { Injectable } from '@nestjs/common';
import { BillingPaymentLedgerService } from './billing-payment-ledger.service';
import {
  TenantInvoicePaymentHistoryDto,
  TenantPaymentAttemptDto,
  TenantPaymentCreditNoteDto,
  TenantPaymentRefundDto,
} from './dto/tenant-billing-payments.dto';
import {
  requireTenantMoney,
  resolveAttemptStatusLabel,
  resolveCreditNoteStatusLabel,
  resolvePaymentStatusLabel,
  resolveProviderLabel,
  resolveRefundStatusLabel,
  toTenantMoney,
} from './tenant-billing.mapper';
import { TenantBillingInvoicesService } from './tenant-billing-invoices.service';

@Injectable()
export class TenantBillingPaymentsService {
  constructor(
    private readonly invoices: TenantBillingInvoicesService,
    private readonly paymentLedger: BillingPaymentLedgerService,
  ) {}

  async getInvoicePaymentHistory(
    organizationId: string,
    invoiceId: string,
  ): Promise<TenantInvoicePaymentHistoryDto> {
    const detail = await this.invoices.getInvoiceDetail(organizationId, invoiceId);
    const ledger = await this.paymentLedger.getInvoicePaymentLedger(invoiceId);
    const currency = detail.grossAmount.currency;

    const payments = ledger.map((entry) => ({
      amount: requireTenantMoney(entry.amountCents, entry.currency),
      status: entry.status,
      statusLabel: resolvePaymentStatusLabel(entry.status),
      providerLabel: resolveProviderLabel(entry.provider),
      succeededAt: entry.succeededAt,
      failedAt: entry.failedAt,
      refundedAmount: toTenantMoney(entry.refundedAmountCents, entry.currency),
      remainingAmount: toTenantMoney(entry.remainingAmountCents, entry.currency),
      attempts: entry.attempts.map((attempt) => this.mapAttempt(attempt)),
      refunds: entry.refunds.map((refund) => this.mapRefund(refund, entry.currency)),
    }));

    const failedAttempts = payments.flatMap((payment) =>
      payment.attempts.filter((attempt) => attempt.status === 'FAILED'),
    );

    const refunds = payments.flatMap((payment) => payment.refunds);
    const creditNotes = ledger.flatMap((entry) =>
      entry.creditNotes.map((note) => this.mapCreditNote(note, entry.currency)),
    );

    const amountRemainingCents =
      detail.amountRemaining?.cents ??
      detail.amountDue?.cents ??
      detail.grossAmount.cents;

    return {
      invoiceId,
      currency,
      amountRemaining: requireTenantMoney(amountRemainingCents, currency),
      payments,
      failedAttempts,
      refunds,
      creditNotes,
    };
  }

  private mapAttempt(attempt: {
    attemptNumber: number;
    status: string;
    safeErrorMessage: string | null;
    attemptedAt: string;
    nextRetryAt: string | null;
  }): TenantPaymentAttemptDto {
    return {
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      statusLabel: resolveAttemptStatusLabel(attempt.status),
      safeReason: attempt.safeErrorMessage,
      attemptedAt: attempt.attemptedAt,
      nextRetryAt: attempt.nextRetryAt,
    };
  }

  private mapRefund(
    refund: {
      amountCents: number;
      status: string;
      isPartial: boolean;
      reason: string | null;
      refundedAt: string | null;
    },
    currency: string,
  ): TenantPaymentRefundDto {
    return {
      amount: requireTenantMoney(refund.amountCents, currency),
      status: refund.status,
      statusLabel: resolveRefundStatusLabel(refund.status),
      isPartial: refund.isPartial,
      reason: refund.reason,
      refundedAt: refund.refundedAt,
    };
  }

  private mapCreditNote(
    note: {
      amountCents: number;
      status: string;
      reason: string | null;
      hostedUrl: string | null;
      pdfUrl: string | null;
      issuedAt: string | null;
    },
    currency: string,
  ): TenantPaymentCreditNoteDto {
    return {
      amount: requireTenantMoney(note.amountCents, currency),
      status: note.status,
      statusLabel: resolveCreditNoteStatusLabel(note.status),
      reason: note.reason,
      issuedAt: note.issuedAt,
      hasHostedDocument: Boolean(note.hostedUrl?.trim()),
      hasPdf: Boolean(note.pdfUrl?.trim()),
    };
  }
}
