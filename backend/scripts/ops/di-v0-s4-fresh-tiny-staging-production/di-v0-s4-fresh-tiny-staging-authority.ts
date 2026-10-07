/**
 * EXP-021 S4F-7V — fresh Tiny staging authority validation (ops-only; no runtime import from S4B).
 */
import { OPS_FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE } from '../di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-frozen-not-before';

/** Canonical UTC Z with exactly three millisecond digits (same as S4F-7J ops). */
export const FRESH_NOT_BEFORE_CANONICAL =
  /^(?<y>\d{4})-(?<mo>\d{2})-(?<d>\d{2})T(?<h>\d{2}):(?<mi>\d{2}):(?<s>\d{2})\.(?<ms>\d{3})Z$/;

export const FRESH_STAGING_AUTHORITY_MAX_AGE_SECONDS = 900;

/** Historical frozen v1 STAGED cutoff — reject as fresh authority input. */
export const HISTORICAL_FROZEN_V1_STAGED_NOT_BEFORE = OPS_FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE;

/**
 * S4F-7U sample authority (evidence only). Tests may reference as explicitly expired fixture — never default.
 */
export const EXPIRED_S4F7U_EVIDENCE_NOT_BEFORE = '2026-10-06T18:33:26.610Z';
export const EXPIRED_S4F7U_EVIDENCE_FINGERPRINT =
  '9abb1a57cd25a5937bb033f43f90e98a4f5eab58a66147f977c2c2665049474a';

export const CANONICAL_TINY_ORGANIZATION_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
export const CANONICAL_TINY_VEHICLE_ID = 'c10351f8-b6a2-4258-947f-631aeaa6d359';

export const EXPECTED_PRESTATE_ATTESTATION_FINGERPRINT =
  'b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d';

export const DI_S4_TINY_FRESH_NOT_BEFORE_ENV = 'DI_S4_TINY_FRESH_NOT_BEFORE';
export const DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT_ENV = 'DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT';
export const DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST_ENV = 'DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST';
export const DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST_ENV = 'DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST';

export const EXPECTED_FRESH_TINY_STAGING_TOOL_SHA_ENV = 'EXPECTED_FRESH_TINY_STAGING_TOOL_SHA';

export type FreshNotBeforeRejectReason =
  | 'MISSING'
  | 'MALFORMED_CANONICAL'
  | 'NOT_UTC_Z'
  | 'OFFSET_OR_LOCAL'
  | 'DATE_ONLY'
  | 'ROUND_TRIP_MISMATCH'
  | 'HISTORICAL_FROZEN_CUTOFF'
  | 'FUTURE_RELATIVE_TO_DB_CLOCK'
  | 'AUTHORITY_TOO_OLD'
  | 'AUTHORITY_AGE_NEGATIVE';

export function parseCanonicalUtcNotBefore(candidate: string): { ok: true; epochMs: number; canonical: string } | { ok: false; reason: FreshNotBeforeRejectReason } {
  const trimmed = candidate.trim();
  if (trimmed === '') return { ok: false, reason: 'MISSING' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { ok: false, reason: 'DATE_ONLY' };
  if (!trimmed.endsWith('Z')) return { ok: false, reason: 'NOT_UTC_Z' };
  if (trimmed.includes('+') || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return { ok: false, reason: 'OFFSET_OR_LOCAL' };
  }
  const m = FRESH_NOT_BEFORE_CANONICAL.exec(trimmed);
  if (!m?.groups) return { ok: false, reason: 'MALFORMED_CANONICAL' };
  const epochMs = Date.UTC(
    Number(m.groups.y),
    Number(m.groups.mo) - 1,
    Number(m.groups.d),
    Number(m.groups.h),
    Number(m.groups.mi),
    Number(m.groups.s),
    Number(m.groups.ms),
  );
  if (!Number.isFinite(epochMs)) return { ok: false, reason: 'MALFORMED_CANONICAL' };
  const roundTrip = new Date(epochMs).toISOString();
  if (roundTrip !== trimmed) return { ok: false, reason: 'ROUND_TRIP_MISMATCH' };
  return { ok: true, epochMs, canonical: trimmed };
}

export function parsePostgresClockTimestampUtc(canonical: string): { ok: true; epochMs: number } | { ok: false } {
  const p = parseCanonicalUtcNotBefore(canonical);
  if (!p.ok) return { ok: false };
  return { ok: true, epochMs: p.epochMs };
}

export function validateFreshNotBeforeAgainstHistorical(candidate: string | undefined): { ok: true; canonical: string } | { ok: false; reason: FreshNotBeforeRejectReason } {
  if (candidate == null || candidate.trim() === '') return { ok: false, reason: 'MISSING' };
  const parsed = parseCanonicalUtcNotBefore(candidate);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  if (parsed.canonical === HISTORICAL_FROZEN_V1_STAGED_NOT_BEFORE) {
    return { ok: false, reason: 'HISTORICAL_FROZEN_CUTOFF' };
  }
  return { ok: true, canonical: parsed.canonical };
}

export function computeFreshAuthorityAgeSeconds(dbClockCanonicalUtc: string, freshNotBeforeCanonical: string): {
  ok: true;
  ageSeconds: number;
} | { ok: false; reason: FreshNotBeforeRejectReason } {
  const db = parsePostgresClockTimestampUtc(dbClockCanonicalUtc);
  const fresh = parseCanonicalUtcNotBefore(freshNotBeforeCanonical);
  if (!db.ok || !fresh.ok) return { ok: false, reason: 'MALFORMED_CANONICAL' };
  const ageMs = db.epochMs - fresh.epochMs;
  const ageSeconds = ageMs / 1000;
  if (ageSeconds < 0) return { ok: false, reason: 'AUTHORITY_AGE_NEGATIVE' };
  if (fresh.epochMs > db.epochMs) return { ok: false, reason: 'FUTURE_RELATIVE_TO_DB_CLOCK' };
  return { ok: true, ageSeconds };
}

export function assertFreshAuthorityAgeWithinWindow(
  dbClockCanonicalUtc: string,
  freshNotBeforeCanonical: string,
  maxAgeSeconds: number = FRESH_STAGING_AUTHORITY_MAX_AGE_SECONDS,
): { ok: true; ageSeconds: number } | { ok: false; reason: FreshNotBeforeRejectReason } {
  const age = computeFreshAuthorityAgeSeconds(dbClockCanonicalUtc, freshNotBeforeCanonical);
  if (!age.ok) return age;
  if (age.ageSeconds > maxAgeSeconds) return { ok: false, reason: 'AUTHORITY_TOO_OLD' };
  return { ok: true, ageSeconds: age.ageSeconds };
}

export function isValidSha256LowerHex(fingerprint: string | undefined): boolean {
  if (!fingerprint) return false;
  return /^[0-9a-f]{64}$/.test(fingerprint.trim());
}

export function validatePinnedTinyAllowlistIds(org: string | undefined, vehicle: string | undefined): {
  ok: boolean;
  orgOk: boolean;
  vehicleOk: boolean;
  wildcardPresent: boolean;
} {
  const orgTrim = (org ?? '').trim();
  const vehTrim = (vehicle ?? '').trim();
  const wildcardPresent = orgTrim.includes('*') || vehTrim.includes(',') || vehTrim.includes('*') || orgTrim.includes(',');
  const orgOk = orgTrim === CANONICAL_TINY_ORGANIZATION_ID;
  const vehicleOk = vehTrim === CANONICAL_TINY_VEHICLE_ID;
  return { ok: orgOk && vehicleOk && !wildcardPresent, orgOk, vehicleOk, wildcardPresent };
}
