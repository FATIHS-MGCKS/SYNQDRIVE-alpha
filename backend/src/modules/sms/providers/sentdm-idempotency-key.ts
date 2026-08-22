import { createHash } from 'crypto';

const SENT_DM_IDEMPOTENCY_KEY_MAX_LEN = 64;

/**
 * Deterministic sent.dm Idempotency-Key from org + business operation.
 * Uses SHA-256 hex (alphanumeric) — stable across retries, no PII.
 */
export function buildSentDmIdempotencyKey(organizationId: string, businessOperationId: string): string {
  const digest = createHash('sha256')
    .update(`${organizationId}:${businessOperationId}`, 'utf8')
    .digest('hex');
  return `sdm_${digest.slice(0, SENT_DM_IDEMPOTENCY_KEY_MAX_LEN - 4)}`;
}
