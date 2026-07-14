import { InvoicePaymentMethod, OrgInvoicePayment } from '@prisma/client';

export type InvoicePaymentStatusKind = 'recorded' | 'provider_confirmed';

export interface InvoicePaymentPresentation {
  id: string;
  amountCents: number;
  method: InvoicePaymentMethod | string;
  paidAt: string;
  reference: string | null;
  note: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  statusKind: InvoicePaymentStatusKind;
  statusLabel: string;
  isProviderBacked: boolean;
}

const METHOD_LABEL_DE: Record<string, string> = {
  CARD: 'Karte',
  BANK_TRANSFER: 'Überweisung',
  CASH: 'Barzahlung',
  STRIPE: 'Stripe',
  DIRECT_DEBIT: 'Lastschrift',
  OTHER: 'Sonstiges',
};

export function invoicePaymentMethodLabelDe(method: string): string {
  return METHOD_LABEL_DE[method] ?? 'Sonstiges';
}

export function isProviderBackedPayment(payment: Pick<OrgInvoicePayment, 'stripePaymentIntentId' | 'stripeChargeId' | 'bookingPaymentRequestId'>): boolean {
  return Boolean(payment.stripePaymentIntentId || payment.stripeChargeId || payment.bookingPaymentRequestId);
}

export function invoicePaymentStatusLabel(
  payment: Pick<OrgInvoicePayment, 'stripePaymentIntentId' | 'stripeChargeId' | 'bookingPaymentRequestId'>,
): { statusKind: InvoicePaymentStatusKind; statusLabel: string } {
  if (isProviderBackedPayment(payment)) {
    return { statusKind: 'provider_confirmed', statusLabel: 'Anbieter bestätigt' };
  }
  return { statusKind: 'recorded', statusLabel: 'Erfasst' };
}

export function presentInvoicePayment(
  payment: OrgInvoicePayment,
  createdByName: string | null,
): InvoicePaymentPresentation {
  const status = invoicePaymentStatusLabel(payment);
  return {
    id: payment.id,
    amountCents: payment.amountCents,
    method: payment.method,
    paidAt: payment.paidAt.toISOString(),
    reference: payment.reference,
    note: payment.note,
    createdByUserId: payment.createdByUserId,
    createdByName,
    statusKind: status.statusKind,
    statusLabel: status.statusLabel,
    isProviderBacked: isProviderBackedPayment(payment),
  };
}
