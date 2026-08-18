import { OrganizationStatus } from '@prisma/client';

export type AttentionSeverity = 'none' | 'warning' | 'critical';

export interface OrganizationAttentionState {
  severity: AttentionSeverity;
  reasons: string[];
  primaryReason: string | null;
  reasonCount: number;
}

export interface AttentionInput {
  orgStatus: OrganizationStatus;
  billingWarnings: string[];
  syncStatus: 'NONE' | 'SYNCED' | 'PARTIAL' | 'MISSING';
  hasActiveSubscription: boolean;
  hasIntegrationError: boolean;
  connectivityHealth: 'ok' | 'degraded' | 'critical';
  hasReconciliationDrift: boolean;
}

const WARNING_SEVERITY: Record<string, AttentionSeverity> = {
  PAST_DUE: 'warning',
  PAYMENT_METHOD_MISSING: 'warning',
  PRICE_NOT_CONFIGURED: 'warning',
  NO_ACTIVE_PRICE_VERSION: 'warning',
  STRIPE_SYNC_PARTIAL: 'warning',
  ORG_ARCHIVED: 'warning',
  CONNECTIVITY_DEGRADED: 'warning',
};

const CRITICAL_SEVERITY: Record<string, AttentionSeverity> = {
  RECONCILIATION_DRIFT: 'critical',
  STRIPE_SYNC_MISSING: 'critical',
  ORG_SUSPENDED: 'critical',
  INTEGRATION_ERROR: 'critical',
  CONNECTIVITY_CRITICAL: 'critical',
};

function escalate(current: AttentionSeverity, next: AttentionSeverity): AttentionSeverity {
  if (current === 'critical' || next === 'critical') return 'critical';
  if (current === 'warning' || next === 'warning') return 'warning';
  return 'none';
}

export function buildOrganizationAttention(input: AttentionInput): OrganizationAttentionState {
  const reasons: string[] = [];

  for (const code of input.billingWarnings) {
    if (!reasons.includes(code)) reasons.push(code);
  }

  if (input.hasReconciliationDrift && !reasons.includes('RECONCILIATION_DRIFT')) {
    reasons.push('RECONCILIATION_DRIFT');
  }

  if (input.orgStatus === OrganizationStatus.SUSPENDED && !reasons.includes('ORG_SUSPENDED')) {
    reasons.push('ORG_SUSPENDED');
  }
  if (input.orgStatus === OrganizationStatus.ARCHIVED && !reasons.includes('ORG_ARCHIVED')) {
    reasons.push('ORG_ARCHIVED');
  }

  if (input.hasIntegrationError && !reasons.includes('INTEGRATION_ERROR')) {
    reasons.push('INTEGRATION_ERROR');
  }

  if (input.syncStatus === 'PARTIAL' && !reasons.includes('STRIPE_SYNC_PARTIAL')) {
    reasons.push('STRIPE_SYNC_PARTIAL');
  }
  if (
    input.syncStatus === 'MISSING' &&
    input.hasActiveSubscription &&
    !reasons.includes('STRIPE_SYNC_MISSING')
  ) {
    reasons.push('STRIPE_SYNC_MISSING');
  }

  if (input.connectivityHealth === 'degraded' && !reasons.includes('CONNECTIVITY_DEGRADED')) {
    reasons.push('CONNECTIVITY_DEGRADED');
  }
  if (input.connectivityHealth === 'critical' && !reasons.includes('CONNECTIVITY_CRITICAL')) {
    reasons.push('CONNECTIVITY_CRITICAL');
  }

  let severity: AttentionSeverity = 'none';
  for (const code of reasons) {
    const next =
      CRITICAL_SEVERITY[code] ?? WARNING_SEVERITY[code] ?? ('warning' as AttentionSeverity);
    severity = escalate(severity, next);
  }

  return {
    severity,
    reasons,
    primaryReason: reasons[0] ?? null,
    reasonCount: reasons.length,
  };
}

export function deriveBillingHealth(
  warnings: string[],
  syncStatus: AttentionInput['syncStatus'],
): 'ok' | 'warning' | 'critical' {
  const criticalCodes = new Set([
    'RECONCILIATION_DRIFT',
    'STRIPE_SYNC_MISSING',
    'PAST_DUE',
  ]);
  const warningCodes = new Set([
    'PAYMENT_METHOD_MISSING',
    'PRICE_NOT_CONFIGURED',
    'NO_ACTIVE_PRICE_VERSION',
    'STRIPE_SYNC_PARTIAL',
  ]);

  if (warnings.some((w) => criticalCodes.has(w))) return 'critical';
  if (syncStatus === 'MISSING' || syncStatus === 'PARTIAL') return 'warning';
  if (warnings.some((w) => warningCodes.has(w))) return 'warning';
  return 'ok';
}

export function classifyConnectivityHealth(
  dimoLinked: number,
  freshness: { offline: number; no_signal: number },
): 'ok' | 'degraded' | 'critical' {
  if (dimoLinked <= 0) return 'ok';
  const offlineRatio = (freshness.offline + freshness.no_signal) / dimoLinked;
  if (offlineRatio > 0.5 || freshness.offline + freshness.no_signal === dimoLinked) {
    return 'critical';
  }
  if (offlineRatio > 0.25) return 'degraded';
  return 'ok';
}
