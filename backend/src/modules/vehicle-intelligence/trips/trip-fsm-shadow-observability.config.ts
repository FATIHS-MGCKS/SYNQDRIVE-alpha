/**
 * Non-authoritative shadow observability rollout controls.
 * Default disabled — no runtime cost beyond config branch when off.
 */

export const TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED_ENV =
  'TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED';
export const TRIP_FSM_SHADOW_VEHICLE_IDS_ENV = 'TRIP_FSM_SHADOW_VEHICLE_IDS';

export function parseTripFsmShadowObservabilityEnabled(
  raw: string | undefined,
  fallback = false,
): boolean {
  if (raw == null || raw.trim() === '') return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

export function parseTripFsmShadowVehicleAllowlist(
  raw: string | undefined,
): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function isTripFsmShadowObservabilityEnabledForVehicle(
  vehicleId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!parseTripFsmShadowObservabilityEnabled(env[TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED_ENV])) {
    return false;
  }
  const allowlist = parseTripFsmShadowVehicleAllowlist(
    env[TRIP_FSM_SHADOW_VEHICLE_IDS_ENV],
  );
  // Fail closed: enabled without an explicit allowlist enables shadow for nobody.
  if (allowlist.size === 0) return false;
  return allowlist.has(vehicleId);
}
