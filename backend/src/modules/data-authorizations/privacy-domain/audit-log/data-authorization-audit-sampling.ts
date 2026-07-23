import {
  CRITICAL_DATA_CATEGORIES,
  CRITICAL_DECISION_OUTCOMES,
} from './data-authorization-audit.constants';

export interface AuditSamplingInput {
  decision: string;
  dataCategory: string;
  action: string;
  reasonCode: string;
  allowSamplingRate?: number;
}

/**
 * Risk-based sampling — critical accesses are NEVER sampled away.
 * Returns true when the event must be fully audited (no sampling skip).
 */
export function mustAuditFully(input: AuditSamplingInput): boolean {
  if (CRITICAL_DECISION_OUTCOMES.has(input.decision)) return true;
  if (CRITICAL_DATA_CATEGORIES.has(input.dataCategory)) return true;
  if (['DELETE', 'EXPORT', 'SHARE', 'USE_FOR_AI'].includes(input.action)) return true;
  if (input.reasonCode && input.reasonCode !== 'POLICY_MATCH') return true;
  return false;
}

/** Returns true when a non-critical ALLOW may be sampled (skipped from persistence). */
export function shouldSampleAllow(input: AuditSamplingInput): boolean {
  if (mustAuditFully(input)) return false;
  const rate = input.allowSamplingRate ?? 0;
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  const bucket = hashBucket(`${input.dataCategory}|${input.action}|${input.decision}`);
  return bucket < rate;
}

function hashBucket(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return (hash % 10_000) / 10_000;
}
