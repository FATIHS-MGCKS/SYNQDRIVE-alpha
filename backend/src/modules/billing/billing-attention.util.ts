export type BillingAttentionSeverity = 'none' | 'info' | 'warning' | 'critical';

export interface BillingAttentionSummary {
  severity: BillingAttentionSeverity;
  reasons: string[];
  primaryReason: string | null;
  reasonCount: number;
  detectedAt: string | null;
}

export type BillingHealth = 'ok' | 'warning' | 'critical';
export type ReconciliationHealth = 'ok' | 'warning' | 'critical';

export interface BillingAttentionInput {
  warnings: string[];
  domainStatus: string;
  syncStatus: 'NONE' | 'SYNCED' | 'PARTIAL' | 'MISSING';
  hasOpenDrift: boolean;
  hasFailedPayment: boolean;
  trialExpiringWithinDays: number | null;
  paymentMethodStatus: string;
}

const CRITICAL_CODES = new Set([
  'PAST_DUE',
  'PAYMENT_FAILED',
  'RECONCILIATION_DRIFT',
  'STRIPE_MAPPING_MISSING',
  'SUBSCRIPTION_MISSING',
]);

const WARNING_CODES = new Set([
  'PAYMENT_METHOD_MISSING',
  'PAYMENT_METHOD_REQUIRES_ATTENTION',
  'PRICE_NOT_CONFIGURED',
  'NO_ACTIVE_PRICE_VERSION',
  'STRIPE_MAPPING_PARTIAL',
  'WEBHOOK_FAILURE',
  'TRIAL_EXPIRING',
  'CANCEL_SCHEDULED',
  'NO_BILLABLE_VEHICLES',
]);

function escalate(
  current: BillingAttentionSeverity,
  next: BillingAttentionSeverity,
): BillingAttentionSeverity {
  const rank: Record<BillingAttentionSeverity, number> = {
    none: 0,
    info: 1,
    warning: 2,
    critical: 3,
  };
  return rank[next] > rank[current] ? next : current;
}

export function buildBillingAttention(input: BillingAttentionInput): BillingAttentionSummary {
  const reasons: string[] = [];

  for (const code of input.warnings) {
    if (!reasons.includes(code)) reasons.push(code);
  }

  if (input.domainStatus === 'PAST_DUE' && !reasons.includes('PAST_DUE')) {
    reasons.push('PAST_DUE');
  }

  if (input.hasFailedPayment && !reasons.includes('PAYMENT_FAILED')) {
    reasons.push('PAYMENT_FAILED');
  }

  if (input.hasOpenDrift && !reasons.includes('RECONCILIATION_DRIFT')) {
    reasons.push('RECONCILIATION_DRIFT');
  }

  if (input.syncStatus === 'MISSING' && input.domainStatus !== 'NONE' && input.domainStatus !== 'CANCELLED') {
    if (!reasons.includes('STRIPE_MAPPING_MISSING')) reasons.push('STRIPE_MAPPING_MISSING');
  } else if (input.syncStatus === 'PARTIAL') {
    if (!reasons.includes('STRIPE_MAPPING_PARTIAL')) reasons.push('STRIPE_MAPPING_PARTIAL');
  }

  if (
    input.trialExpiringWithinDays != null &&
    input.trialExpiringWithinDays <= 7 &&
    input.trialExpiringWithinDays >= 0
  ) {
    if (!reasons.includes('TRIAL_EXPIRING')) reasons.push('TRIAL_EXPIRING');
  }

  if (input.domainStatus === 'CANCEL_SCHEDULED' && !reasons.includes('CANCEL_SCHEDULED')) {
    reasons.push('CANCEL_SCHEDULED');
  }

  if (
    input.paymentMethodStatus === 'REQUIRES_ACTION' &&
    !reasons.includes('PAYMENT_METHOD_REQUIRES_ATTENTION')
  ) {
    reasons.push('PAYMENT_METHOD_REQUIRES_ATTENTION');
  }

  let severity: BillingAttentionSeverity = 'none';
  for (const code of reasons) {
    let next: BillingAttentionSeverity = 'warning';
    if (CRITICAL_CODES.has(code)) next = 'critical';
    else if (code === 'CANCEL_SCHEDULED' || code === 'TRIAL_EXPIRING') next = 'info';
    else if (WARNING_CODES.has(code)) next = 'warning';
    severity = escalate(severity, next);
  }

  return {
    severity,
    reasons,
    primaryReason: reasons[0] ?? null,
    reasonCount: reasons.length,
    detectedAt: new Date().toISOString(),
  };
}

export function deriveBillingHealthFromAttention(attention: BillingAttentionSummary): BillingHealth {
  if (attention.severity === 'critical') return 'critical';
  if (attention.severity === 'warning' || attention.severity === 'info') return 'warning';
  return 'ok';
}

export function deriveReconciliationHealth(
  syncStatus: BillingAttentionInput['syncStatus'],
  hasOpenDrift: boolean,
): ReconciliationHealth {
  if (hasOpenDrift) return 'critical';
  if (syncStatus === 'MISSING') return 'critical';
  if (syncStatus === 'PARTIAL') return 'warning';
  return 'ok';
}

export const DOMAIN_STATUS_LABELS: Record<string, string> = {
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
