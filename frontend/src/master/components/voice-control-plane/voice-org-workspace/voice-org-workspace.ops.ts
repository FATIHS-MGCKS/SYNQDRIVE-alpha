import type {
  VoiceControlPlaneAuditEventRow,
  VoiceControlPlaneWebhookEventRow,
  VoiceMasterAdminOrgBilling,
} from '../../../../lib/api';
import { maskOrgId } from '../voice-platform-overview.ops';

export function maskTechnicalId(value: string | null | undefined): string {
  if (!value) return '—';
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function centsToEuros(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'gerade eben';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `vor ${sec}s`;
  if (sec < 3600) return `vor ${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `vor ${Math.floor(sec / 3600)}h`;
  return `vor ${Math.floor(sec / 86400)}d`;
}

export function formatOrgIdForDisplay(orgId: string): string {
  return maskOrgId(orgId);
}

export function filterOrgWebhookEvents(
  events: VoiceControlPlaneWebhookEventRow[],
  orgId: string,
): VoiceControlPlaneWebhookEventRow[] {
  return events.filter(event => event.organizationId === orgId);
}

export function filterOrgAuditEvents(
  events: VoiceControlPlaneAuditEventRow[],
  orgId: string,
): VoiceControlPlaneAuditEventRow[] {
  return events.filter(event => event.organizationId === orgId);
}

export function billingForecastHint(billing: VoiceMasterAdminOrgBilling | null): string | null {
  if (!billing) return null;
  const periodStart = new Date(billing.periodStart).getTime();
  const periodEnd = new Date(billing.periodEnd).getTime();
  const now = Date.now();
  if (now <= periodStart || now >= periodEnd) return null;
  const elapsed = now - periodStart;
  const total = periodEnd - periodStart;
  const projectedMinutes = (billing.consumedMinutes / elapsed) * total;
  return `Hochrechnung: ~${projectedMinutes.toFixed(0)} Min. bis Periodenende`;
}

export function budgetWarningLevel(
  billing: VoiceMasterAdminOrgBilling | null,
  monthlyBudgetCents: number | null,
): 'ok' | 'near_limit' | 'over_limit' | 'not_set' {
  if (!billing || !monthlyBudgetCents) return 'not_set';
  const usageCost = billing.estimatedCostCents ?? billing.providerCostCents;
  if (usageCost > monthlyBudgetCents) return 'over_limit';
  if (usageCost / monthlyBudgetCents >= 0.8) return 'near_limit';
  return 'ok';
}
