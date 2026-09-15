import { assertCanonicalIso8601Utc } from './physical-state-cutover-evidence.canonical';

export type CutoverEvidenceTimestampValidation =
  | { ok: true; canonical: string; ms: number }
  | { ok: false; reason: string };

export function validateCutoverEvidenceTimestamp(
  value: unknown,
  nowMs: number,
  options?: {
    disallowFuture?: boolean;
    maxAgeMs?: number;
  },
): CutoverEvidenceTimestampValidation {
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, reason: 'timestamp_missing' };
  }

  try {
    const canonical = assertCanonicalIso8601Utc(value);
    const ms = Date.parse(canonical);
    if (!Number.isFinite(ms)) {
      return { ok: false, reason: 'timestamp_unparseable' };
    }
    if (options?.disallowFuture !== false && ms > nowMs) {
      return { ok: false, reason: 'timestamp_in_future' };
    }
    if (options?.maxAgeMs !== undefined && nowMs - ms > options.maxAgeMs) {
      return { ok: false, reason: 'timestamp_stale' };
    }
    return { ok: true, canonical, ms };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'timestamp_invalid',
    };
  }
}
