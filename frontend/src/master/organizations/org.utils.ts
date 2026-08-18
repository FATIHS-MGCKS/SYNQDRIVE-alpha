import type { StatusTone } from '../../components/patterns';
import type { AttentionSeverity } from './types';

const ATTENTION_LABELS: Record<string, string> = {
  PAST_DUE: 'Überfällig',
  PAYMENT_METHOD_MISSING: 'Keine Zahlungsmethode',
  RECONCILIATION_DRIFT: 'Abgleichsabweichung',
  PRICE_NOT_CONFIGURED: 'Preis nicht konfiguriert',
  NO_ACTIVE_PRICE_VERSION: 'Keine aktive Preisversion',
  STRIPE_SYNC_PARTIAL: 'Stripe teilweise',
  STRIPE_SYNC_MISSING: 'Stripe nicht verknüpft',
  ORG_SUSPENDED: 'Organisation gesperrt',
  ORG_ARCHIVED: 'Archiviert',
  INTEGRATION_ERROR: 'Integrationsfehler',
  CONNECTIVITY_DEGRADED: 'Konnektivität eingeschränkt',
  CONNECTIVITY_CRITICAL: 'Viele Fahrzeuge offline',
};

export function attentionReasonLabel(code: string): string {
  return ATTENTION_LABELS[code] ?? code;
}

export function attentionSeverityTone(severity: AttentionSeverity): StatusTone {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'warning';
  return 'neutral';
}

export function billingHealthLabel(health: 'ok' | 'warning' | 'critical'): string {
  if (health === 'critical') return 'Kritisch';
  if (health === 'warning') return 'Warnung';
  return 'OK';
}

export function billingHealthTone(health: 'ok' | 'warning' | 'critical'): StatusTone {
  if (health === 'critical') return 'critical';
  if (health === 'warning') return 'warning';
  return 'success';
}

export function orgStatusTone(status: string): StatusTone {
  if (status === 'ACTIVE') return 'success';
  if (status === 'PENDING') return 'info';
  if (status === 'SUSPENDED') return 'critical';
  if (status === 'ARCHIVED') return 'watch';
  return 'neutral';
}

export function subscriptionStatusTone(status: string): StatusTone {
  if (status === 'ACTIVE') return 'success';
  if (status === 'TRIALING') return 'info';
  if (status === 'PAST_DUE') return 'critical';
  if (status === 'CANCELLED') return 'watch';
  return 'neutral';
}

export function connectivityHealthLabel(health: string): string {
  if (health === 'critical') return 'Kritisch';
  if (health === 'degraded') return 'Eingeschränkt';
  return 'OK';
}

export function connectivityHealthTone(health: string): StatusTone {
  if (health === 'critical') return 'critical';
  if (health === 'degraded') return 'warning';
  return 'success';
}

export function attentionDrilldownTab(reason: string): string {
  if (
    reason.startsWith('CONNECTIVITY') ||
    reason === 'CONNECTIVITY_DEGRADED' ||
    reason === 'CONNECTIVITY_CRITICAL'
  ) {
    return 'vehicles';
  }
  if (reason === 'INTEGRATION_ERROR') return 'integrations';
  if (reason === 'ORG_SUSPENDED' || reason === 'ORG_ARCHIVED') return 'settings';
  return 'billing';
}

export { formatRelativeDe } from '../../components/patterns/format-utils';

export function formatDateDe(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function maskId(value: string | null | undefined): string {
  if (!value) return '—';
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function buildOrgListQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== '' && val !== 'all') {
      q.set(key, String(val));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function readOrgListStateFromUrl(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.search);
  const keys = [
    'orgSearch',
    'orgPage',
    'orgStatus',
    'orgSubStatus',
    'orgAttention',
    'orgBillingHealth',
    'orgConnectivity',
    'orgSyncStatus',
    'orgBusinessType',
    'orgPaymentMethod',
  ];
  const state: Record<string, string> = {};
  for (const k of keys) {
    const v = p.get(k);
    if (v) state[k] = v;
  }
  return state;
}

export function writeOrgListStateToUrl(state: Record<string, string | undefined>, replace = false) {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams(window.location.search);
  const keys = [
    'orgSearch',
    'orgPage',
    'orgStatus',
    'orgSubStatus',
    'orgAttention',
    'orgBillingHealth',
    'orgConnectivity',
    'orgSyncStatus',
    'orgBusinessType',
    'orgPaymentMethod',
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

export function readOrgTabFromUrl(): string {
  if (typeof window === 'undefined') return 'overview';
  return new URLSearchParams(window.location.search).get('orgTab') ?? 'overview';
}

export function writeOrgTabToUrl(tab: string, replace = false) {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams(window.location.search);
  p.set('orgTab', tab);
  const next = `${window.location.pathname}?${p.toString()}`;
  if (replace) window.history.replaceState(null, '', next);
  else window.history.pushState(null, '', next);
}
