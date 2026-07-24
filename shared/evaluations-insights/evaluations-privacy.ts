/**
 * GDPR Privacy-by-Design helpers for Auswertungen (evaluations / financial insights).
 * Shared between backend API redaction and frontend display minimization.
 */

export type EvaluationsPiiTier = 'full' | 'pseudonymous' | 'none';

/** Matches dashboard insight run pruning (`pruneOldRuns` default). */
export const EVALUATIONS_INSIGHT_RETENTION_DAYS = 7;

/** Documented operational retention for predictive forecast artefacts. */
export const EVALUATIONS_FORECAST_RETENTION_DAYS = 365;

const INSIGHT_PII_METRIC_KEYS = [
  'customerName',
  'customerEmail',
  'customerPhone',
  'driverName',
  'driverEmail',
  'driverPhone',
] as const;

const INSIGHT_PII_REASON_PREFIXES = ['Kunde:', 'Customer:', 'Fahrer:', 'Driver:'];

export interface EvaluationsAccessContext {
  membershipRole: string;
  /** @deprecated use canReadCustomerPii */
  canReadInvoices?: boolean;
  /** @deprecated use canReadCustomerPii */
  canReadCustomers?: boolean;
  canReadCustomerPii?: boolean;
  canReadFinance?: boolean;
  canReadExecutive?: boolean;
}

export function resolveEvaluationsPiiTier(ctx: EvaluationsAccessContext): EvaluationsPiiTier {
  if (ctx.membershipRole === 'ORG_ADMIN' || ctx.membershipRole === 'MASTER_ADMIN') {
    return 'full';
  }

  const canPii =
    ctx.canReadCustomerPii ??
    (Boolean(ctx.canReadInvoices) && Boolean(ctx.canReadCustomers));

  if (ctx.membershipRole === 'SUB_ADMIN' && canPii) {
    return 'full';
  }
  if (canPii) {
    return 'full';
  }

  const canFinance = ctx.canReadFinance ?? ctx.canReadInvoices ?? false;
  if (canFinance) {
    return 'pseudonymous';
  }
  return 'none';
}

export function canAccessEvaluationsSurface(
  ctx: Pick<EvaluationsAccessContext, 'canReadExecutive' | 'canReadInvoices'>,
): boolean {
  return Boolean(ctx.canReadExecutive ?? ctx.canReadInvoices);
}

export function pseudonymizeCustomerId(customerId: string): string {
  const tail = customerId.replace(/-/g, '').slice(-6).toUpperCase();
  return `Kunde ····${tail}`;
}

export function pseudonymizeLicensePlate(plate: string): string {
  const trimmed = plate.trim();
  if (!trimmed) return 'Fahrzeug';
  if (trimmed.length <= 4) return `${trimmed.slice(0, 1)}···`;
  return `${trimmed.slice(0, 2)}···${trimmed.slice(-2)}`;
}

export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '***@***';
  const domain = trimmed.slice(at + 1);
  const domainParts = domain.split('.');
  const tld = domainParts.length > 1 ? domainParts[domainParts.length - 1] : '***';
  return `${trimmed[0]}···@···.${tld}`;
}

export function buildCustomerDisplayLabel(input: {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
  tier: EvaluationsPiiTier;
}): string {
  if (input.tier === 'none') return pseudonymizeCustomerId(input.id);
  if (input.tier === 'pseudonymous') return pseudonymizeCustomerId(input.id);

  const composed = [input.firstName, input.lastName].filter(Boolean).join(' ').trim();
  const direct = input.name?.trim() || composed;
  if (direct) return direct;
  return pseudonymizeCustomerId(input.id);
}

export interface RedactableDashboardInsight {
  message: string;
  metrics?: Record<string, unknown> | null;
  reasons?: string[] | null;
}

export function redactDashboardInsightForTier<T extends RedactableDashboardInsight>(
  insight: T,
  tier: EvaluationsPiiTier,
): T {
  if (tier === 'full') return insight;

  const redacted: T = {
    ...insight,
    message: redactInsightMessage(insight.message, tier),
    metrics: insight.metrics ? redactInsightMetrics(insight.metrics, tier) : insight.metrics,
    reasons: insight.reasons ? redactInsightReasons(insight.reasons) : insight.reasons,
  };

  return redacted;
}

export function redactDashboardInsightsResponse<T extends { insights: RedactableDashboardInsight[] }>(
  response: T,
  tier: EvaluationsPiiTier,
): T {
  if (tier === 'full') return response;
  return {
    ...response,
    insights: response.insights.map((insight) => redactDashboardInsightForTier(insight, tier)),
  };
}

function redactInsightMessage(message: string, tier: EvaluationsPiiTier): string {
  const replacement = tier === 'pseudonymous' ? 'Kunde' : 'Kunde (geschützt)';

  const pickupPattern = /^(.+?) · (.+?) — (geplanter Pickup .+)$/i;
  const pickupMatch = message.match(pickupPattern);
  if (pickupMatch) {
    return `${pickupMatch[1]} · ${replacement} — ${pickupMatch[3]}`;
  }

  return message
    .replace(/\b[A-ZÄÖÜ][\wäöüß-]+ [A-ZÄÖÜ][\wäöüß-]+\b/g, replacement)
    .replace(/\S+@\S+\.\S+/g, '***@***');
}

function redactInsightMetrics(
  metrics: Record<string, unknown>,
  tier: EvaluationsPiiTier,
): Record<string, unknown> {
  const out = { ...metrics };

  for (const key of INSIGHT_PII_METRIC_KEYS) {
    if (key in out) out[key] = null;
  }

  if (tier !== 'full') {
    delete out.customerId;
    delete out.driverId;
    delete out.assignedDriverId;
  }

  if (typeof out.vehicleLicense === 'string') {
    out.vehicleLicense = pseudonymizeLicensePlate(out.vehicleLicense);
  }

  return out;
}

function redactInsightReasons(reasons: string[]): string[] {
  return reasons.filter(
    (reason) => !INSIGHT_PII_REASON_PREFIXES.some((prefix) => reason.startsWith(prefix)),
  );
}

export interface MisuseCaseCockpitRow {
  id: string;
  title: string;
  description?: string | null;
  severity: string;
  recommendedAction?: string | null;
  category?: string;
  type?: string;
  status?: string;
  vehicleId?: string;
  informationalOnly?: boolean;
  evidenceLevel?: string | null;
}

export function toMisuseCaseCockpitRow(row: Record<string, unknown>): MisuseCaseCockpitRow {
  const evidenceCase = (row.evidenceCase ?? null) as Record<string, unknown> | null;
  return {
    id: String(row.id),
    title: String(row.title ?? row.type ?? 'Auffälligkeit'),
    description:
      typeof evidenceCase?.explanation === 'string'
        ? evidenceCase.explanation
        : typeof row.description === 'string'
          ? row.description
          : null,
    severity: String(row.severity ?? 'WATCH'),
    recommendedAction:
      typeof row.recommendedAction === 'string' ? row.recommendedAction : null,
    category: typeof row.category === 'string' ? row.category : undefined,
    type: typeof row.type === 'string' ? row.type : undefined,
    status: typeof row.status === 'string' ? row.status : undefined,
    vehicleId: typeof row.vehicleId === 'string' ? row.vehicleId : undefined,
    informationalOnly: row.informationalOnly === true,
    evidenceLevel:
      typeof evidenceCase?.evidenceLevel === 'string' ? evidenceCase.evidenceLevel : null,
  };
}
