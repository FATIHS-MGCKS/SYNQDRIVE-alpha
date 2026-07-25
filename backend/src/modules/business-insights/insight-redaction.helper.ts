import { MembershipRole } from '@prisma/client';
import type { DashboardInsightDto } from './insight.types';

const PII_METRIC_KEYS = new Set([
  'customerId',
  'customerName',
  'customerEmail',
  'bookingId',
  'financialImpactCents',
  'hoursUntilPickup',
]);

const PII_TIME_CONTEXT_KEYS = new Set(['customerId', 'bookingId']);

/**
 * GDPR insight redaction helper (VW-F-012) — mirrors notification privacy policy.
 * Stored rows are unchanged; API responses are redacted by role.
 */
export function redactInsightDtoForRole(
  insight: DashboardInsightDto,
  role: MembershipRole,
): DashboardInsightDto {
  if (role === MembershipRole.ORG_ADMIN || role === MembershipRole.SUB_ADMIN) {
    return insight;
  }

  const metrics =
    insight.metrics && typeof insight.metrics === 'object'
      ? (redactRecord(
          insight.metrics as Record<string, unknown>,
          PII_METRIC_KEYS,
        ) as Record<string, unknown>)
      : insight.metrics;

  const timeContext =
    insight.timeContext && typeof insight.timeContext === 'object'
      ? (redactRecord(
          insight.timeContext as Record<string, unknown>,
          PII_TIME_CONTEXT_KEYS,
        ) as Record<string, string>)
      : insight.timeContext;

  return {
    ...insight,
    metrics,
    timeContext,
  };
}

function redactRecord(
  record: Record<string, unknown>,
  keys: Set<string>,
): Record<string, unknown> {
  const out = { ...record };
  for (const key of keys) {
    if (key in out) out[key] = null;
  }
  return out;
}
