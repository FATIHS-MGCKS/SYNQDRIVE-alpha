import type {
  BillingCalculationStatus,
  BillingSubscriptionStatus,
  BillingSummaryDto,
} from '../../types/billing.types';
import {
  mapInvoiceStatusToLabel,
  mapInvoiceStatusToTone,
  SubscriptionStatus,
} from '../../../lib/billing-domain';

export function formatMoneyCents(
  cents: number | null | undefined,
  currency = 'EUR',
): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function formatDateDe(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function formatTierRange(min: number, max: number | null): string {
  if (max == null) return `${min}+ Fahrzeuge`;
  if (min === max) return `${min} Fahrzeug${min === 1 ? '' : 'e'}`;
  return `${min}–${max} Fahrzeuge`;
}

export function subscriptionStatusLabel(status: BillingSubscriptionStatus): string {
  switch (status) {
    case SubscriptionStatus.ACTIVE:
    case 'ACTIVE':
      return 'Aktiv';
    case SubscriptionStatus.TRIALING:
    case 'TRIALING':
      return 'Testphase';
    case SubscriptionStatus.PAST_DUE:
    case 'PAST_DUE':
      return 'Überfällig';
    case SubscriptionStatus.CANCELLED:
    case 'CANCELLED':
      return 'Gekündigt';
    case SubscriptionStatus.CANCEL_SCHEDULED:
      return 'Kündigung geplant';
    case SubscriptionStatus.PAUSED:
      return 'Pausiert';
    case SubscriptionStatus.INCOMPLETE:
      return 'Unvollständig';
    case 'NONE':
      return 'Kein Abo';
    default:
      return 'Kein Abo';
  }
}

export function subscriptionStatusTone(status: BillingSubscriptionStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'sq-tone-success';
    case 'TRIALING':
      return 'sq-tone-info';
    case 'PAST_DUE':
      return 'sq-tone-critical';
    case 'CANCELLED':
      return 'sq-tone-neutral';
    default:
      return 'sq-tone-warning';
  }
}

export function headerBadgeFromSummary(
  subscriptionStatus: BillingSubscriptionStatus,
  calculationStatus: BillingCalculationStatus,
): { label: string; tone: string } {
  if (
    calculationStatus === 'NO_ACTIVE_PRICE_VERSION' ||
    calculationStatus === 'PRICE_NOT_CONFIGURED'
  ) {
    return { label: 'Preis nicht konfiguriert', tone: 'sq-tone-warning' };
  }
  if (subscriptionStatus === 'PAST_DUE') {
    return { label: 'Überfällig', tone: 'sq-tone-critical' };
  }
  if (subscriptionStatus === 'TRIALING') {
    return { label: 'Testphase', tone: 'sq-tone-info' };
  }
  if (subscriptionStatus === 'CANCELLED') {
    return { label: 'Gekündigt', tone: 'sq-tone-neutral' };
  }
  if (subscriptionStatus === 'CANCEL_SCHEDULED') {
    return { label: 'Kündigung geplant', tone: 'sq-tone-warning' };
  }
  if (subscriptionStatus === 'ACTIVE') {
    return { label: 'Aktiv', tone: 'sq-tone-success' };
  }
  return { label: 'Vorbereitet', tone: 'sq-tone-warning' };
}

export function invoiceStatusLabel(status: string | null | undefined): string {
  return mapInvoiceStatusToLabel(status);
}

export function invoiceStatusTone(status: string | null | undefined): string {
  return mapInvoiceStatusToTone(status);
}

export function exclusionReasonLabel(reason: string): string {
  const map: Record<string, string> = {
    NOT_CONNECTED: 'Nicht verbunden',
    ARCHIVED: 'Archiviert',
    DEMO: 'Demo-Fahrzeug',
    DISABLED: 'Deaktiviert',
    BILLING_EXCLUDED: 'Manuell von Abrechnung ausgeschlossen',
    OUT_OF_SERVICE: 'Außer Betrieb',
    ORG_INACTIVE: 'Organisation inaktiv',
    UNKNOWN: 'Unbekannt',
  };
  return map[reason] ?? reason;
}

export function planLabelFromSummary(summary: BillingSummaryDto): string {
  if (summary.products.length > 0) {
    return summary.products.map((p) => p.planDisplay || p.name).join(' · ');
  }
  if (!summary.subscription || summary.subscriptionStatus === 'NONE') {
    return 'Kein aktives Abo';
  }
  return summary.priceBook?.name ?? 'SynqDrive';
}

export function paymentMethodLabel(type?: string): string {
  switch (type) {
    case 'CARD':
      return 'Karte';
    case 'SEPA_DEBIT':
      return 'SEPA-Lastschrift';
    default:
      return 'Zahlungsmethode';
  }
}

export function paymentMethodStatusLabel(status?: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'Aktiv';
    case 'FAILED':
      return 'Fehlgeschlagen';
    case 'REQUIRES_ACTION':
      return 'Aktion erforderlich';
    case 'EXPIRED':
      return 'Abgelaufen';
    default:
      return status ?? 'Unbekannt';
  }
}
