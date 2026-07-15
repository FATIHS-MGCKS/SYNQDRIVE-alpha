import type { AdminBillingPriceTierDto } from '../../types/admin-billing.types';
import {
  validateTierRows as validateMasterPricingTierRows,
  type TierValidationIssue,
} from './master-pricing.utils';

export type { TierValidationIssue };

export {
  formatMoneyCents,
  formatDateDe,
  formatTierRange,
  subscriptionStatusLabel,
  subscriptionStatusTone,
  invoiceStatusLabel,
  invoiceStatusTone,
  paymentMethodLabel,
} from '../../../rental/components/billing/billing.utils';

export function priceStatusLabel(status: string): string {
  switch (status) {
    case 'OK':
      return 'Konfiguriert';
    case 'PRICE_NOT_CONFIGURED':
      return 'Preis fehlt';
    case 'NO_ACTIVE_PRICE_VERSION':
      return 'Keine aktive Version';
    case 'NO_BILLABLE_VEHICLES':
      return 'Keine abrechenbaren Fahrzeuge';
    default:
      return status;
  }
}

export function priceStatusTone(status: string): string {
  if (status === 'OK') return 'sq-tone-success';
  if (status === 'NO_BILLABLE_VEHICLES') return 'sq-tone-neutral';
  return 'sq-tone-warning';
}

export function paymentMethodStatusLabel(status: string): string {
  if (status === 'MISSING') return 'Fehlt';
  if (status === 'ACTIVE') return 'Aktiv';
  if (status === 'FAILED') return 'Fehlgeschlagen';
  if (status === 'REQUIRES_ACTION') return 'Aktion nötig';
  if (status === 'EXPIRED') return 'Abgelaufen';
  return status;
}

export function paymentMethodStatusTone(status: string): string {
  if (status === 'ACTIVE') return 'sq-tone-success';
  if (status === 'MISSING') return 'sq-tone-warning';
  return 'sq-tone-critical';
}

export function warningLabel(code: string): string {
  const map: Record<string, string> = {
    PAYMENT_METHOD_MISSING: 'Keine Zahlungsmethode',
    PRICE_NOT_CONFIGURED: 'Preis nicht konfiguriert',
    NO_ACTIVE_PRICE_VERSION: 'Keine aktive Preisversion',
    PAST_DUE: 'Überfällig',
    NO_BILLABLE_VEHICLES: 'Keine abrechenbaren Fahrzeuge',
    PAYMENT_METHOD_REQUIRES_ATTENTION: 'Zahlungsmethode prüfen',
    SUBSCRIPTION_MISSING: 'Kein Abo',
    PERIOD_ENDED: 'Zeitraum abgelaufen',
    CANCEL_AT_PERIOD_END: 'Kündigung aktiv',
  };
  return map[code] ?? code;
}

export function formatMoneyEuros(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

export function validateTierRows(tiers: AdminBillingPriceTierDto[]): TierValidationIssue[] {
  return validateMasterPricingTierRows(tiers);
}

export function parsePaginated<T>(payload: unknown): { data: T[]; total: number } {
  if (Array.isArray(payload)) return { data: payload as T[], total: payload.length };
  const p = payload as { data?: T[]; total?: number };
  return { data: p.data ?? [], total: p.total ?? p.data?.length ?? 0 };
}
