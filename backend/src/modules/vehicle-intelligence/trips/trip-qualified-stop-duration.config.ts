import { CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS } from './trip-qualified-stop-duration.policy';

export function parseNonNegativeIntMs(
  raw: string | undefined,
): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Single runtime duration authority for qualified-stop same-trip vs split.
 *
 * Precedence:
 * 1. TRIP_SAME_TRIP_MAX_STOP_MS (canonical env)
 * 2. TRIP_MID_GAP_SPLIT_MS (legacy env — same semantic after V1 migration)
 * 3. CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS (300000)
 */
export function resolveMaxSameTripQualifiedStopMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const canonical = parseNonNegativeIntMs(env.TRIP_SAME_TRIP_MAX_STOP_MS);
  if (canonical != null) return canonical;
  const legacy = parseNonNegativeIntMs(env.TRIP_MID_GAP_SPLIT_MS);
  if (legacy != null) return legacy;
  return CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS;
}
