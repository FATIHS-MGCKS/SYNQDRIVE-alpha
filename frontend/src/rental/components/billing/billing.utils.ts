import type { BillingCalculationStatus, BillingSubscriptionStatus } from '../../types/billing.types';

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
    case 'ACTIVE':
      return 'Aktiv';
    case 'TRIALING':
      return 'Testphase';
    case 'PAST_DUE':
      return 'Überfällig';
    case 'CANCELLED':
      return 'Gekündigt';
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
  if (subscriptionStatus === 'ACTIVE') {
    return { label: 'Aktiv', tone: 'sq-tone-success' };
  }
  return { label: 'Vorbereitet', tone: 'sq-tone-warning' };
}

export function invoiceStatusLabel(status: string | null | undefined): string {
  const s = (status ?? '').toLowerCase();
  if (s === 'paid' || s === 'bezahlt') return 'Bezahlt';
  if (s === 'open' || s === 'pending' || s === 'draft') return 'Offen';
  if (s === 'overdue' || s === 'uncollectible') return 'Überfällig';
  if (s === 'void') return 'Storniert';
  return status ?? 'Offen';
}

export function invoiceStatusTone(status: string | null | undefined): string {
  const s = (status ?? '').toLowerCase();
  if (s === 'paid') return 'sq-tone-success';
  if (s === 'overdue' || s === 'uncollectible') return 'sq-tone-critical';
  return 'sq-tone-warning';
}

export function exclusionReasonLabel(reason: string): string {
  const map: Record<string, string> = {
    NOT_CONNECTED: 'Nicht verbunden',
    ARCHIVED: 'Archiviert',
    DEMO: 'Demo-Fahrzeug',
    DISABLED: 'Deaktiviert',
    BILLING_EXCLUDED: 'Manuell ausgeschlossen',
    ORG_INACTIVE: 'Organisation inaktiv',
    UNKNOWN: 'Unbekannt',
  };
  return map[reason] ?? reason;
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
