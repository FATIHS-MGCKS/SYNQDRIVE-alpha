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

const VEHICLE_LICENSE_EVENT_LABELS: Record<string, string> = {
  VEHICLE_CONNECTED: 'Fahrzeug abrechenbar',
  VEHICLE_DISCONNECTED: 'Fahrzeug nicht mehr abrechenbar',
  VEHICLE_EXCLUDED: 'Von Abrechnung ausgeschlossen',
  VEHICLE_INCLUDED: 'Wieder abrechenbar',
  VEHICLE_ORG_TRANSFERRED: 'Organisationswechsel',
  SUBSCRIPTION_ACTIVATED: 'Abonnement aktiviert',
  SUBSCRIPTION_PAUSED: 'Abonnement pausiert',
  BASE_PLAN_CHANGED: 'Tarif geändert',
  ORG_BILLING_DEACTIVATED: 'Abrechnung deaktiviert',
  MANUAL_ADJUSTMENT: 'Manuelle Anpassung',
  SNAPSHOT_LOCK: 'Abrechnungsstand gesichert',
  SUBSCRIPTION_SYNC: 'Abonnement synchronisiert',
};

const CONTRACT_ACTION_LABELS: Record<string, string> = {
  SUBSCRIPTION_CREATED: 'Abonnement erstellt',
  SUBSCRIPTION_ACTIVATED: 'Abonnement aktiviert',
  SUBSCRIPTION_TRIAL_STARTED: 'Testphase gestartet',
  SUBSCRIPTION_CANCEL_SCHEDULED: 'Kündigung geplant',
  SUBSCRIPTION_CANCELLED: 'Abonnement beendet',
  SUBSCRIPTION_PAUSED: 'Abonnement pausiert',
  SUBSCRIPTION_REACTIVATED: 'Abonnement reaktiviert',
  PRICE_VERSION_SELECTED: 'Preisversion gewählt',
  DISCOUNT_ADDED: 'Rabatt hinzugefügt',
  DISCOUNT_ENDED: 'Rabatt beendet',
};

export function resolveVehicleLicenseEventLabel(eventType: string): string {
  return VEHICLE_LICENSE_EVENT_LABELS[eventType] ?? 'Abrechnungsänderung';
}

export function resolveContractActionLabel(action: string): string {
  return CONTRACT_ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

export function maskEmailRecipient(email: string | null | undefined): string | null {
  if (!email?.trim()) return null;
  const [local, domain] = email.trim().split('@');
  if (!domain) return '[email]';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

const BILLING_EMAIL_EVENT_LABELS: Record<string, string> = {
  'billing.subscription.activated': 'Abonnement aktiviert',
  'billing.subscription.trial_ending': 'Testphase endet',
  'billing.subscription.changed': 'Tarif geändert',
  'billing.subscription.cancel_scheduled': 'Kündigung geplant',
  'billing.subscription.cancelled': 'Abonnement beendet',
  'billing.invoice.finalized': 'Rechnung verfügbar',
  'billing.payment.succeeded': 'Zahlung erfolgreich',
  'billing.payment.failed': 'Zahlung fehlgeschlagen',
  'billing.payment_method.missing': 'Zahlungsmethode fehlt',
  'billing.invoice.overdue': 'Rechnung überfällig',
  'billing.refund.created': 'Rückerstattung',
  'billing.credit_note.created': 'Gutschrift',
};

export function resolveBillingEmailEventLabel(eventType: string): string {
  return BILLING_EMAIL_EVENT_LABELS[eventType] ?? 'Abrechnungs-E-Mail';
}
