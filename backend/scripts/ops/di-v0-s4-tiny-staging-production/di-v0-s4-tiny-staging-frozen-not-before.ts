/**
 * Ops-only frozen NOT_BEFORE validation (S4F-7J.1). No S4B runtime import.
 * Semantic authority: vehicle_trips.end_time >= cutoff (documented only).
 */

export const OPS_DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV = 'DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE';

export const OPS_FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE = '2026-10-02T05:55:28.839Z';

/** Canonical UTC Z only — exactly three millisecond digits. */
export const OPS_FROZEN_NOT_BEFORE_CANONICAL =
  /^(?<y>\d{4})-(?<mo>\d{2})-(?<d>\d{2})T(?<h>\d{2}):(?<mi>\d{2}):(?<s>\d{2})\.(?<ms>\d{3})Z$/;

export type OpsFrozenNotBeforeRejectReason =
  | 'EMPTY'
  | 'NOT_EXACT_FROZEN_VALUE'
  | 'MALFORMED_CANONICAL'
  | 'NOT_UTC_Z'
  | 'OFFSET_OR_LOCAL'
  | 'DATE_ONLY'
  | 'ROUND_TRIP_MISMATCH';

export function validateOpsFrozenNotBeforeCandidate(
  candidate: string | undefined,
): { ok: true; canonical: string } | { ok: false; reason: OpsFrozenNotBeforeRejectReason } {
  if (candidate == null || candidate.trim() === '') {
    return { ok: false, reason: 'EMPTY' };
  }
  const trimmed = candidate.trim();
  if (trimmed !== OPS_FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE) {
    return { ok: false, reason: 'NOT_EXACT_FROZEN_VALUE' };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { ok: false, reason: 'DATE_ONLY' };
  }
  if (!trimmed.endsWith('Z')) {
    return { ok: false, reason: 'NOT_UTC_Z' };
  }
  if (/[+-]\d{2}:?\d{2}$/.test(trimmed) || trimmed.includes('+') || (trimmed.lastIndexOf('-') > 10 && !trimmed.endsWith('Z'))) {
    return { ok: false, reason: 'OFFSET_OR_LOCAL' };
  }
  const m = OPS_FROZEN_NOT_BEFORE_CANONICAL.exec(trimmed);
  if (!m?.groups) {
    return { ok: false, reason: 'MALFORMED_CANONICAL' };
  }
  const epoch = Date.UTC(
    Number(m.groups.y),
    Number(m.groups.mo) - 1,
    Number(m.groups.d),
    Number(m.groups.h),
    Number(m.groups.mi),
    Number(m.groups.s),
    Number(m.groups.ms),
  );
  if (!Number.isFinite(epoch)) {
    return { ok: false, reason: 'MALFORMED_CANONICAL' };
  }
  const roundTrip = new Date(epoch).toISOString();
  if (roundTrip !== trimmed) {
    return { ok: false, reason: 'ROUND_TRIP_MISMATCH' };
  }
  return { ok: true, canonical: trimmed };
}

export function validateOpsFrozenNotBeforeAuthority(): {
  ok: boolean;
  canonicalValid: boolean;
  timezone: 'UTC_Z' | 'INVALID';
} {
  const v = validateOpsFrozenNotBeforeCandidate(OPS_FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE);
  if (!v.ok) {
    return { ok: false, canonicalValid: false, timezone: 'INVALID' };
  }
  return { ok: true, canonicalValid: true, timezone: 'UTC_Z' };
}
