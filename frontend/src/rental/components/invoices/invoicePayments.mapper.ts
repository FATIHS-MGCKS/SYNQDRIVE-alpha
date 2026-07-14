import type { TranslationKey } from '../../i18n/translations/en';
import { formatAmount, formatDate } from './invoiceFormatters';
import type {
  InvoicePaymentRecord,
  InvoicePaymentSummary,
  RecordInvoicePaymentPayload,
} from './invoicePaymentTypes';
import { INVOICE_PAYMENT_METHOD_CODES } from './invoicePaymentTypes';
import type { Invoice } from './invoiceTypes';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

const METHOD_I18N: Record<string, TranslationKey> = {
  CARD: 'invoicePayment.method.CARD',
  BANK_TRANSFER: 'invoicePayment.method.BANK_TRANSFER',
  CASH: 'invoicePayment.method.CASH',
  STRIPE: 'invoicePayment.method.STRIPE',
  DIRECT_DEBIT: 'invoicePayment.method.DIRECT_DEBIT',
  OTHER: 'invoicePayment.method.OTHER',
};

const STATUS_I18N: Record<string, TranslationKey> = {
  recorded: 'invoicePayment.status.recorded',
  provider_confirmed: 'invoicePayment.status.provider_confirmed',
};

const BACKEND_ERROR_MAP: Record<string, TranslationKey> = {
  'Betrag übersteigt den offenen Restbetrag': 'invoicePayment.error.overpayment',
  'Ungültiger Betrag': 'invoicePayment.error.invalidAmount',
  'Diese Referenz wurde bereits verbucht': 'invoicePayment.error.duplicateReference',
  'Diese Anbieterzahlung wurde bereits verbucht': 'invoicePayment.error.duplicateProvider',
};

export function invoicePaymentMethodLabel(method: string, t: Translate): string {
  const key = METHOD_I18N[method];
  return key ? t(key) : t('invoicePayment.method.OTHER');
}

export function invoicePaymentStatusLabel(
  payment: Pick<InvoicePaymentRecord, 'statusKind' | 'statusLabel'>,
  t: Translate,
): string {
  if (payment.statusLabel?.trim()) return payment.statusLabel;
  const kind = payment.statusKind ?? 'recorded';
  const key = STATUS_I18N[kind];
  return key ? t(key) : t('invoicePayment.status.recorded');
}

export function invoicePaymentRecordedByLabel(
  payment: Pick<InvoicePaymentRecord, 'createdByName' | 'isProviderBacked'>,
  t: Translate,
): string | null {
  if (payment.createdByName?.trim()) return payment.createdByName;
  if (payment.isProviderBacked) return t('invoicePayment.recordedBy.system');
  return null;
}

export function paymentMethodOptions(t: Translate) {
  return INVOICE_PAYMENT_METHOD_CODES.map((value) => ({
    value,
    label: invoicePaymentMethodLabel(value, t),
  }));
}

export function buildPaymentSummary(invoice: Invoice, t: Translate): InvoicePaymentSummary {
  const currency = invoice.currency || 'EUR';
  return {
    paidCents: invoice.paidCents,
    outstandingCents: invoice.outstandingCents,
    currency,
    paidFormatted: formatAmount(invoice.paidCents, currency),
    outstandingFormatted: formatAmount(invoice.outstandingCents, currency),
  };
}

export function sortPaymentsNewestFirst(payments: InvoicePaymentRecord[]): InvoicePaymentRecord[] {
  return [...payments].sort(
    (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime(),
  );
}

export function outstandingAmountInputValue(outstandingCents: number): string {
  if (outstandingCents <= 0) return '';
  return (outstandingCents / 100).toFixed(2);
}

export function defaultPaymentDateValue(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function parseAmountInputToCents(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) return null;
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function validateRecordPaymentForm(input: {
  amountCents: number | null;
  method: string;
  outstandingCents: number;
  t: Translate;
}): string | null {
  if (!input.method?.trim()) return input.t('invoicePayment.dialog.methodRequired');
  if (input.amountCents == null || input.amountCents < 1) {
    return input.t('invoicePayment.error.invalidAmount');
  }
  if (input.amountCents > input.outstandingCents) {
    return input.t('invoicePayment.error.overpayment');
  }
  return null;
}

export function buildRecordPaymentPayload(input: {
  amountCents: number;
  method: string;
  paidAt: string;
  reference: string;
  note: string;
}): RecordInvoicePaymentPayload {
  const reference = input.reference.trim();
  const note = input.note.trim();
  return {
    amountCents: input.amountCents,
    method: input.method,
    paidAt: input.paidAt ? new Date(`${input.paidAt}T12:00:00`).toISOString() : undefined,
    reference: reference || undefined,
    note: note || undefined,
  };
}

export function parseRecordPaymentError(
  message: string,
  t: Translate,
  currency?: string,
): string {
  const trimmed = message.trim();
  const mapped = BACKEND_ERROR_MAP[trimmed];
  if (mapped) return t(mapped);
  if (/währung|currency/i.test(trimmed)) {
    return t('invoicePayment.error.wrongCurrency', { currency: currency ?? 'EUR' });
  }
  if (trimmed) return trimmed;
  return t('invoicePayment.error.generic');
}

export function formatPaymentRowDate(iso: string): string {
  return formatDate(iso);
}

export function formatPaymentAmount(amountCents: number, currency: string): string {
  return formatAmount(amountCents, currency);
}
