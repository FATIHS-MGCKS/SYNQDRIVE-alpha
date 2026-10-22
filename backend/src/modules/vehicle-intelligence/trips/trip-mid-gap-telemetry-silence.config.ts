/**
 * P1B.9C — optional live mid-gap telemetry-silence hardening (default off).
 * Vehicle rollout requires global enable + explicit UUID allowlist (fail-closed).
 */

export const TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_ENABLED_ENV =
  'TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_ENABLED';
export const TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_VEHICLE_IDS_ENV =
  'TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_VEHICLE_IDS';

const UUID_V4_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseTripMidGapTelemetrySilenceHardeningEnabled(
  raw: string | undefined,
  fallback = false,
): boolean {
  if (raw == null || raw.trim() === '') return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

export function parseTripMidGapTelemetrySilenceHardeningVehicleAllowlist(
  raw: string | undefined,
): Set<string> {
  if (!raw?.trim()) return new Set();
  const ids = raw
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
  for (const id of ids) {
    if (!UUID_V4_LIKE.test(id)) {
      return new Set();
    }
  }
  return new Set(ids);
}

/**
 * Per-vehicle hardening is only active when the global flag is true AND the
 * vehicle id is on a non-empty, valid UUID allowlist. Global on with an empty
 * allowlist enables hardening for nobody (no implicit fleet-wide canary).
 */
export function isTripMidGapTelemetrySilenceHardeningEnabledForVehicle(
  vehicleId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (
    !parseTripMidGapTelemetrySilenceHardeningEnabled(
      env[TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_ENABLED_ENV],
    )
  ) {
    return false;
  }
  const allowlist = parseTripMidGapTelemetrySilenceHardeningVehicleAllowlist(
    env[TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_VEHICLE_IDS_ENV],
  );
  if (allowlist.size === 0) return false;
  return allowlist.has(vehicleId.trim().toLowerCase());
}
