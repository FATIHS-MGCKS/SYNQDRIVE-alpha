import { TenantMoneyDto } from './tenant-billing-invoices.dto';

export interface TenantPaymentAttemptDto {
  attemptNumber: number;
  status: string;
  statusLabel: string;
  safeReason: string | null;
  attemptedAt: string;
  nextRetryAt: string | null;
}

export interface TenantPaymentRefundDto {
  amount: TenantMoneyDto;
  status: string;
  statusLabel: string;
  isPartial: boolean;
  reason: string | null;
  refundedAt: string | null;
}

export interface TenantPaymentCreditNoteDto {
  amount: TenantMoneyDto;
  status: string;
  statusLabel: string;
  reason: string | null;
  issuedAt: string | null;
  hasHostedDocument: boolean;
  hasPdf: boolean;
}

export interface TenantInvoicePaymentDto {
  amount: TenantMoneyDto;
  status: string;
  statusLabel: string;
  providerLabel: string;
  succeededAt: string | null;
  failedAt: string | null;
  refundedAmount: TenantMoneyDto | null;
  remainingAmount: TenantMoneyDto | null;
  attempts: TenantPaymentAttemptDto[];
  refunds: TenantPaymentRefundDto[];
}

export interface TenantInvoicePaymentHistoryDto {
  invoiceId: string;
  currency: string;
  amountRemaining: TenantMoneyDto;
  payments: TenantInvoicePaymentDto[];
  failedAttempts: TenantPaymentAttemptDto[];
  refunds: TenantPaymentRefundDto[];
  creditNotes: TenantPaymentCreditNoteDto[];
}
