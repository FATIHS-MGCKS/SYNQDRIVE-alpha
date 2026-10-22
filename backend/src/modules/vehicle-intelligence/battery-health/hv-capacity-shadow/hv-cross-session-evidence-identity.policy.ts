import { createHash } from 'crypto';
import type { HvCrossSessionInputSession } from './hv-capacity-cross-session.types';

function formatEvidenceNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'null';
  return value.toFixed(6);
}

/**
 * Deterministic digest of cross-session input evidence (session medians, counts, M3 flags).
 * Used for idempotency — unchanged digest + same latest endAt => skip persist.
 */
export function buildHvCrossSessionEvidenceIdentityDigest(
  sessions: HvCrossSessionInputSession[],
): string {
  const parts = [...sessions]
    .sort((a, b) => a.sessionId.localeCompare(b.sessionId))
    .map((session) =>
      [
        session.sessionId,
        String(session.sessionEndAt.getTime()),
        formatEvidenceNumber(session.summary.stats.medianCapacityKwh),
        String(session.summary.stats.validSampleCount ?? 0),
        formatEvidenceNumber(session.summary.stats.coefficientOfVariation),
        formatEvidenceNumber(session.m3Validation?.estimatedCapacityKwh),
        session.m3Validation?.methodConflict === true ? '1' : '0',
      ].join('|'),
    );
  return parts.join(';;');
}

export function hashHvCrossSessionEvidenceIdentityDigest(rawDigest: string): string {
  return createHash('sha256').update(rawDigest).digest('hex').slice(0, 24);
}
