import type { DashboardDomainStatusLevel, DashboardOverallStatus } from './types';
import type { StatusTone } from '../../components/patterns';

export function overallStatusLabel(status: DashboardOverallStatus): string {
  switch (status) {
    case 'healthy':
      return 'Betriebsbereit';
    case 'warning':
      return 'Eingeschränkt';
    case 'critical':
      return 'Kritisch';
    default:
      return 'Unbekannt';
  }
}

export function overallStatusTone(status: DashboardOverallStatus): StatusTone {
  if (status === 'critical') return 'critical';
  if (status === 'warning') return 'warning';
  if (status === 'healthy') return 'success';
  return 'neutral';
}

export function domainLevelTone(level: DashboardDomainStatusLevel): StatusTone {
  if (level === 'critical') return 'critical';
  if (level === 'warning') return 'warning';
  if (level === 'ok') return 'success';
  return 'neutral';
}

export { formatRelativeDe } from '../../components/patterns/format-utils';

export function formatDurationSince(iso: string): string {
  const start = new Date(iso).getTime();
  const diffMs = Math.max(0, Date.now() - start);
  const min = Math.floor(diffMs / 60000);
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} Std.`;
  return `${Math.floor(h / 24)} Tg.`;
}

export function formatGeneratedAt(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const REASON_LABELS: Record<string, string> = {
  PAST_DUE: 'Überfällig',
  RECONCILIATION_DRIFT: 'Abgleichsabweichung',
  PAYMENT_METHOD_MISSING: 'Keine Zahlungsmethode',
};

export function attentionReasonLabel(code: string): string {
  return REASON_LABELS[code] ?? code;
}

export function buildDrilldownUrl(
  view: string,
  params?: Record<string, string>,
): string {
  const q = new URLSearchParams({ view, ...(params ?? {}) });
  return `/master?${q.toString()}`;
}

export const DOMAIN_LABELS: Record<keyof import('./types').DashboardDomainStatusDto, string> = {
  runtime: 'Runtime',
  worker: 'Worker',
  dimo: 'DIMO',
  billing: 'Abrechnung',
  backup: 'Backup',
  support: 'Support',
};

export const FRESHNESS_LABELS: Record<string, string> = {
  live: 'Live',
  standby: 'Standby',
  signal_delayed: 'Soft Offline',
  offline: 'Offline',
  no_signal: 'Unbekannt',
};
