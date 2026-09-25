import { LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS } from './longitudinal-input.constants';

/** M3.3F F1 — bounded D3 materialization session read limit (not a scientific window). */
export const BATTERY_V2_LONGITUDINAL_MATERIALIZATION_SESSION_LIMIT_ENV =
  'BATTERY_V2_LONGITUDINAL_MATERIALIZATION_SESSION_LIMIT';

function parsePositiveIntEnv(value: string | undefined, defaultValue: number): number {
  if (value == null || value.trim() === '') return defaultValue;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return defaultValue;
  return parsed;
}

/**
 * Canonical F1 session limit for D3 materialization reads.
 * Never exceeds {@link LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS} (D1 engineering safety max).
 */
export function getBatteryV2LongitudinalMaterializationSessionLimit(): number {
  const configured = parsePositiveIntEnv(
    process.env[BATTERY_V2_LONGITUDINAL_MATERIALIZATION_SESSION_LIMIT_ENV],
    LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS,
  );
  return Math.min(configured, LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS);
}

export function normalizeLongitudinalMaterializationSessionLimitOverride(
  raw: number | undefined,
): number {
  if (raw == null) {
    return getBatteryV2LongitudinalMaterializationSessionLimit();
  }
  if (!Number.isFinite(raw) || raw < 1) {
    return getBatteryV2LongitudinalMaterializationSessionLimit();
  }
  return Math.min(Math.floor(raw), LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS);
}
