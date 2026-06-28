import type { BillingSummaryDto } from '../../types/billing.types';

export type BillingStripeUiState = 'configured' | 'prepared' | 'not_configured';

export function getBillingStripeUiState(
  summary?: Pick<BillingSummaryDto, 'stripeConfigured' | 'stripePortalPrepared'> | null,
): BillingStripeUiState {
  if (summary?.stripeConfigured) return 'configured';
  if (summary?.stripePortalPrepared) return 'prepared';
  return 'not_configured';
}

export function stripeStateLabel(state: BillingStripeUiState): string {
  switch (state) {
    case 'configured':
      return 'Zahlungen aktiv';
    case 'prepared':
      return 'Stripe wird vorbereitet';
    default:
      return 'Online-Zahlung nicht aktiv';
  }
}

export function stripeStateTone(state: BillingStripeUiState): string {
  switch (state) {
    case 'configured':
      return 'sq-tone-success';
    case 'prepared':
      return 'sq-tone-info';
    default:
      return 'sq-tone-neutral';
  }
}

export function stripeStateHint(state: BillingStripeUiState): string {
  switch (state) {
    case 'configured':
      return 'Zahlungsmethoden und Rechnungen werden über Stripe verwaltet.';
    case 'prepared':
      return 'Die Stripe-Anbindung wird vorbereitet. Zahlungsaktionen sind noch nicht verfügbar.';
    default:
      return 'Online-Zahlungen sind für diese Organisation noch nicht freigeschaltet.';
  }
}
