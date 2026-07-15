import { InvoiceStatus } from '@prisma/client';
import { mapPrismaInvoiceToDisplayStatus } from './domain';
import { InvoiceDisplayStatus } from './domain/billing-domain.types';
import { formatBillingMoney } from './email/billing-email.util';
import { TenantMoneyDto } from './dto/tenant-billing-invoices.dto';

const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Entwurf',
  OPEN: 'Offen',
  PAID: 'Bezahlt',
  VOID: 'Storniert',
  UNCOLLECTIBLE: 'Uneinbringlich',
};

const DISPLAY_STATUS_LABELS: Record<InvoiceDisplayStatus, string> = {
  Draft: 'Entwurf',
  Pending: 'Offen',
  Paid: 'Bezahlt',
  Overdue: 'Überfällig',
  Void: 'Storniert',
  Uncollectible: 'Uneinbringlich',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Ausstehend',
  SUCCEEDED: 'Erfolgreich',
  FAILED: 'Fehlgeschlagen',
  REFUNDED: 'Erstattet',
  PARTIALLY_REFUNDED: 'Teilweise erstattet',
  CANCELLED: 'Storniert',
};

const ATTEMPT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Ausstehend',
  SUCCEEDED: 'Erfolgreich',
  FAILED: 'Fehlgeschlagen',
};

const REFUND_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Ausstehend',
  SUCCEEDED: 'Erstattet',
  FAILED: 'Fehlgeschlagen',
  CANCELLED: 'Storniert',
};

const CREDIT_NOTE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Entwurf',
  ISSUED: 'Ausgestellt',
  VOID: 'Storniert',
};

const PROVIDER_LABELS: Record<string, string> = {
  STRIPE: 'Kartenzahlung',
  MANUAL: 'Manuelle Zahlung',
};

export function toTenantMoney(
  cents: number | null | undefined,
  currency: string | null | undefined,
): TenantMoneyDto | null {
  if (cents == null || !currency) return null;
  const normalizedCurrency = currency.toUpperCase();
  const formatted = formatBillingMoney(cents, normalizedCurrency, 'de');
  if (!formatted) return null;
  return { cents, currency: normalizedCurrency, formatted };
}

export function requireTenantMoney(cents: number, currency: string): TenantMoneyDto {
  return toTenantMoney(cents, currency)!;
}

export function resolveInvoiceStatusLabel(status: InvoiceStatus): string {
  return INVOICE_STATUS_LABELS[status] ?? status;
}

export function resolveInvoiceDisplayLabel(
  status: InvoiceStatus,
  dueDate?: Date | null,
  now: Date = new Date(),
): string {
  const display = mapPrismaInvoiceToDisplayStatus(status, { dueDate, now });
  return DISPLAY_STATUS_LABELS[display] ?? display;
}

export function resolvePaymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

export function resolveAttemptStatusLabel(status: string): string {
  return ATTEMPT_STATUS_LABELS[status] ?? status;
}

export function resolveRefundStatusLabel(status: string): string {
  return REFUND_STATUS_LABELS[status] ?? status;
}

export function resolveCreditNoteStatusLabel(status: string): string {
  return CREDIT_NOTE_STATUS_LABELS[status] ?? status;
}

export function resolveProviderLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? 'Zahlung';
}

export function resolveInvoiceNumberLabel(invoiceNumber: string | null | undefined): string {
  const trimmed = invoiceNumber?.trim();
  return trimmed || 'Noch nicht finalisiert';
}

export const tenantBillingMapperInternals = {
  INVOICE_STATUS_LABELS,
  DISPLAY_STATUS_LABELS,
};
