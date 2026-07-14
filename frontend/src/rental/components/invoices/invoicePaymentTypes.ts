export type InvoicePaymentMethodCode =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'CARD'
  | 'STRIPE'
  | 'DIRECT_DEBIT'
  | 'OTHER'
  | string;

export type InvoicePaymentStatusKind = 'recorded' | 'provider_confirmed';

export interface InvoicePaymentRecord {
  id: string;
  amountCents: number;
  method: InvoicePaymentMethodCode;
  paidAt: string;
  reference?: string | null;
  note?: string | null;
  createdByUserId?: string | null;
  createdByName?: string | null;
  statusKind?: InvoicePaymentStatusKind;
  statusLabel?: string;
  isProviderBacked?: boolean;
}

export interface RecordInvoicePaymentPayload {
  amountCents: number;
  method: InvoicePaymentMethodCode;
  paidAt?: string;
  reference?: string;
  note?: string;
}

export interface InvoicePaymentSummary {
  paidCents: number;
  outstandingCents: number;
  currency: string;
  paidFormatted: string;
  outstandingFormatted: string;
}

export const INVOICE_PAYMENT_METHOD_CODES: InvoicePaymentMethodCode[] = [
  'BANK_TRANSFER',
  'CASH',
  'CARD',
  'STRIPE',
  'OTHER',
];
