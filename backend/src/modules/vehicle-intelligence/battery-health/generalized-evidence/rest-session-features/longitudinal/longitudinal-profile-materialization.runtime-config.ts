import { LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS } from './longitudinal-input.constants';

/** M3.3F F1 — bounded D3 materialization session read limit (not a scientific window). */
export const BATTERY_V2_LONGITUDINAL_MATERIALIZATION_SESSION_LIMIT_ENV =
  'BATTERY_V2_LONGITUDINAL_MATERIALIZATION_SESSION_LIMIT';

/** Strict positive integer grammar for env and CLI session limits. */
export const STRICT_POSITIVE_INTEGER_STRING_PATTERN = /^[1-9][0-9]*$/;

export function parseStrictPositiveIntegerString(
  raw: string | undefined,
): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!STRICT_POSITIVE_INTEGER_STRING_PATTERN.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return parsed;
}

function parseStrictPositiveIntEnv(value: string | undefined, defaultValue: number): number {
  const parsed = parseStrictPositiveIntegerString(value);
  if (parsed == null) return defaultValue;
  return parsed;
}

/**
 * Canonical F1 session limit for D3 materialization reads.
 * Never exceeds {@link LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS} (D1 engineering safety max).
 */
export function getBatteryV2LongitudinalMaterializationSessionLimit(): number {
  const configured = parseStrictPositiveIntEnv(
    process.env[BATTERY_V2_LONGITUDINAL_MATERIALIZATION_SESSION_LIMIT_ENV],
    LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS,
  );
  return Math.min(configured, LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS);
}

export type LongitudinalMaterializationSessionLimitResolution =
  | { status: 'OK'; sessionLimit: number }
  | { status: 'INVALID_OVERRIDE'; message: string };

export function resolveLongitudinalMaterializationSessionLimitOverride(
  raw: number | undefined,
): LongitudinalMaterializationSessionLimitResolution {
  if (raw == null) {
    return {
      status: 'OK',
      sessionLimit: getBatteryV2LongitudinalMaterializationSessionLimit(),
    };
  }
  if (!Number.isFinite(raw) || !Number.isSafeInteger(raw) || raw < 1) {
    return {
      status: 'INVALID_OVERRIDE',
      message: 'sessionLimit must be a positive safe integer',
    };
  }
  return {
    status: 'OK',
    sessionLimit: Math.min(raw, LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS),
  };
}

/** @deprecated use resolveLongitudinalMaterializationSessionLimitOverride */
export function normalizeLongitudinalMaterializationSessionLimitOverride(
  raw: number | undefined,
): number {
  const resolved = resolveLongitudinalMaterializationSessionLimitOverride(raw);
  if (resolved.status === 'INVALID_OVERRIDE') {
    return getBatteryV2LongitudinalMaterializationSessionLimit();
  }
  return resolved.sessionLimit;
}

export function parseCliSessionLimitArg(
  raw: string | undefined,
): { status: 'OMITTED' } | { status: 'OK'; value: number } | { status: 'INVALID'; message: string } {
  if (raw == null || raw.trim() === '') {
    return { status: 'OMITTED' };
  }
  const parsed = parseStrictPositiveIntegerString(raw);
  if (parsed == null) {
    return {
      status: 'INVALID',
      message: 'session-limit must be a positive integer without fractional or suffix garbage',
    };
  }
  return { status: 'OK', value: Math.min(parsed, LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS) };
}
