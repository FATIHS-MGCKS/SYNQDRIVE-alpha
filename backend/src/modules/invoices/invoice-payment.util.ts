import { InvoicePaymentMethod, InvoicePaymentSource, OrgInvoiceStatus } from '@prisma/client';
import { derivePaymentStatus } from './invoice-domain.util';

const METHOD_LABELS: Record<InvoicePaymentMethod, string> = {
  BANK_TRANSFER: 'Überweisung',
  CARD: 'Karte',
  CASH: 'Bar',
  STRIPE: 'Stripe',
  OTHER: 'Sonstige',
};

export function invoicePaymentMethodLabel(method: InvoicePaymentMethod | string): string {
  return METHOD_LABELS[method as InvoicePaymentMethod] ?? 'Sonstige';
}

export interface ValidateInvoicePaymentInput {
  amountCents: number;
  currency: string;
  invoiceCurrency: string;
  invoiceStatus: OrgInvoiceStatus;
  outstandingCents: number;
  allowOverpayment?: boolean;
}

export type ValidateInvoicePaymentResult =
  | { ok: true }
  | { ok: false; message: string };

export function validateInvoicePaymentAmount(
  input: ValidateInvoicePaymentInput,
): ValidateInvoicePaymentResult {
  if (input.amountCents <= 0) {
    return { ok: false, message: 'Payment amount must be greater than zero' };
  }
  if (input.currency.toUpperCase() !== input.invoiceCurrency.toUpperCase()) {
    return { ok: false, message: 'Payment currency does not match invoice currency' };
  }
  if (!canAcceptInvoicePayment(input.invoiceStatus)) {
    return { ok: false, message: `Cannot record payment for status ${input.invoiceStatus}` };
  }
  if (input.amountCents > input.outstandingCents && !input.allowOverpayment) {
    return { ok: false, message: 'Payment exceeds outstanding amount' };
  }
  return { ok: true };
}

export function canAcceptInvoicePayment(status: OrgInvoiceStatus): boolean {
  return !['CANCELLED', 'VOID', 'CREDITED', 'REJECTED'].includes(status);
}

export interface ComputeInvoicePaymentStateInput {
  paidCents: number;
  totalCents: number;
  currentStatus: OrgInvoiceStatus;
  isOutgoing: boolean;
  completingPaymentPaidAt: Date;
  previousPaidAt: Date | null;
  newOutstandingCents: number;
}

export function computeInvoicePaymentState(input: ComputeInvoicePaymentStateInput): {
  status: OrgInvoiceStatus;
  paidAt: Date | null;
} {
  const status = derivePaymentStatus(
    input.paidCents,
    input.totalCents,
    input.currentStatus,
    input.isOutgoing,
  );
  const paidAt =
    input.newOutstandingCents === 0
      ? input.completingPaymentPaidAt
      : input.previousPaidAt;
  return { status, paidAt };
}

export function resolvePaymentSource(input: {
  providerTransactionId?: string | null;
  explicitSource?: InvoicePaymentSource;
}): InvoicePaymentSource {
  if (input.explicitSource) return input.explicitSource;
  if (input.providerTransactionId?.trim()) return InvoicePaymentSource.PROVIDER;
  return InvoicePaymentSource.MANUAL;
}
