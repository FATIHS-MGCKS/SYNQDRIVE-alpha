import type { StatusTone } from '../../components/patterns';
import type { BillingAttentionSeverity, BillingHealth, ReconciliationHealth } from './types';

const ATTENTION_LABELS: Record<string, string> = {
  PAST_DUE: 'Überfällig',
  PAYMENT_FAILED: 'Fehlzahlung',
  PAYMENT_METHOD_MISSING: 'Keine Zahlungsmethode',
  PAYMENT_METHOD_REQUIRES_ATTENTION: 'Zahlungsmethode prüfen',
  RECONCILIATION_DRIFT: 'Abgleichsabweichung',
  STRIPE_MAPPING_MISSING: 'Stripe nicht verknüpft',
  STRIPE_MAPPING_PARTIAL: 'Stripe teilweise verknüpft',
  PRICE_NOT_CONFIGURED: 'Preis nicht konfiguriert',
  NO_ACTIVE_PRICE_VERSION: 'Keine aktive Preisversion',
  TRIAL_EXPIRING: 'Testphase endet bald',
  CANCEL_SCHEDULED: 'Kündigung geplant',
  SUBSCRIPTION_MISSING: 'Kein Vertrag',
  WEBHOOK_FAILURE: 'Webhook-Fehler',
  NO_BILLABLE_VEHICLES: 'Keine abrechenbaren Fahrzeuge',
};

const DOMAIN_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Entwurf',
  TRIALING: 'Testphase',
  ACTIVE: 'Aktiv',
  PAUSED: 'Pausiert',
  PAST_DUE: 'Überfällig',
  CANCEL_SCHEDULED: 'Kündigung geplant',
  CANCELLED: 'Gekündigt',
  INCOMPLETE: 'Unvollständig',
  NONE: 'Kein Vertrag',
};

export function attentionReasonLabel(code: string): string {
  return ATTENTION_LABELS[code] ?? code;
}

export function domainStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Kein Vertrag';
  return DOMAIN_STATUS_LABELS[status] ?? status;
}

export function attentionSeverityTone(severity: BillingAttentionSeverity): StatusTone {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'warning';
  if (severity === 'info') return 'info';
  return 'neutral';
}

export function billingHealthLabel(health: BillingHealth): string {
  if (health === 'critical') return 'Kritisch';
  if (health === 'warning') return 'Warnung';
  return 'OK';
}

export function billingHealthTone(health: BillingHealth): StatusTone {
  if (health === 'critical') return 'critical';
  if (health === 'warning') return 'warning';
  return 'success';
}

export function reconciliationHealthLabel(health: ReconciliationHealth): string {
  if (health === 'critical') return 'Abweichung';
  if (health === 'warning') return 'Teilweise';
  return 'Synchron';
}

export function reconciliationHealthTone(health: ReconciliationHealth): StatusTone {
  if (health === 'critical') return 'critical';
  if (health === 'warning') return 'warning';
  return 'success';
}

export function domainStatusTone(status: string | null | undefined): StatusTone {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'TRIALING':
      return 'info';
    case 'PAST_DUE':
      return 'critical';
    case 'CANCEL_SCHEDULED':
      return 'warning';
    case 'PAUSED':
    case 'CANCELLED':
      return 'watch';
    default:
      return 'neutral';
  }
}

export function platformBillingHealthTone(health: 'healthy' | 'attention' | 'critical'): StatusTone {
  if (health === 'critical') return 'critical';
  if (health === 'attention') return 'warning';
  return 'success';
}

export function formatDateDe(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatRelativeDe(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = d.getTime() - Date.now();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  if (days > 1 && days <= 14) return `in ${days} Tagen`;
  return formatDateDe(iso);
}

export function formatMoneyCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function formatMoneyEuros(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

export function buildBillingListQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== '' && val !== 'all') {
      q.set(key, String(val));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function readBillingListStateFromUrl(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.search);
  const keys = [
    'billingSearch',
    'billingPage',
    'billingDomainStatus',
    'billingHealth',
    'billingReconciliation',
    'billingTrial',
    'billingAttention',
    'billingProduct',
    'billingSort',
    'billingSortDir',
  ];
  const state: Record<string, string> = {};
  for (const k of keys) {
    const v = p.get(k);
    if (v) state[k] = v;
  }
  return state;
}

export function writeBillingListStateToUrl(state: Record<string, string | undefined>, replace = false) {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams(window.location.search);
  const keys = [
    'billingSearch',
    'billingPage',
    'billingDomainStatus',
    'billingHealth',
    'billingReconciliation',
    'billingTrial',
    'billingAttention',
    'billingProduct',
    'billingSort',
    'billingSortDir',
  ];
  for (const k of keys) {
    p.delete(k);
  }
  for (const [k, v] of Object.entries(state)) {
    if (v && v !== 'all') p.set(k, v);
  }
  const next = `${window.location.pathname}?${p.toString()}`;
  if (replace) window.history.replaceState(null, '', next);
  else window.history.pushState(null, '', next);
}
