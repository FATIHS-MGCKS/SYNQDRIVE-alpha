/**
 * P1B — runtime shadow for evidence-backed start boundary admission.
 * Default disabled (fail-closed). Does not affect legacy canonical start when off.
 */

export const TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV =
  'TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED';

/** Optional shadow-only route enrichment when legacy had a DIMO segment match (extra provider budget). */
export const TRIP_START_BOUNDARY_ADMISSION_SHADOW_ROUTE_FETCH_ENABLED_ENV =
  'TRIP_START_BOUNDARY_ADMISSION_SHADOW_ROUTE_FETCH_ENABLED';

/** Comma-separated vehicle UUID allowlist; required when global shadow is ON (fail-closed when empty). */
export const TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV =
  'TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS';

export const TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_ALLOWLIST_MAX = 16;

const CANONICAL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TripStartBoundaryAdmissionShadowAllowlistParseResult =
  | { ok: true; allowlist: Set<string> }
  | { ok: false; reason: 'invalid_entry' | 'too_many' };

export function parseTripStartBoundaryAdmissionShadowEnabled(
  raw: string | undefined,
  fallback = false,
): boolean {
  if (raw == null || raw.trim() === '') return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

export function isTripStartBoundaryAdmissionShadowEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return parseTripStartBoundaryAdmissionShadowEnabled(
    env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV],
    false,
  );
}

export function isTripStartBoundaryAdmissionShadowRouteFetchEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return parseTripStartBoundaryAdmissionShadowEnabled(
    env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ROUTE_FETCH_ENABLED_ENV],
    false,
  );
}

function isCanonicalVehicleUuid(token: string): boolean {
  return CANONICAL_UUID_RE.test(token);
}

/**
 * Parses a comma-separated allowlist. Any malformed entry invalidates the **entire** list.
 * Duplicate canonical UUIDs are deduplicated. Max 16 unique IDs.
 */
export function parseTripStartBoundaryAdmissionShadowVehicleAllowlist(
  raw: string | undefined,
): TripStartBoundaryAdmissionShadowAllowlistParseResult {
  if (raw == null || raw.trim() === '') {
    return { ok: true, allowlist: new Set() };
  }

  const allowlist = new Set<string>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '') {
      return { ok: false, reason: 'invalid_entry' };
    }
    if (trimmed.toUpperCase() === 'ALL' || trimmed.includes('*')) {
      return { ok: false, reason: 'invalid_entry' };
    }
    if (!isCanonicalVehicleUuid(trimmed)) {
      return { ok: false, reason: 'invalid_entry' };
    }
    allowlist.add(trimmed.toLowerCase());
  }

  if (allowlist.size > TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_ALLOWLIST_MAX) {
    return { ok: false, reason: 'too_many' };
  }

  return { ok: true, allowlist };
}

/**
 * P1B.5 — vehicle-scoped shadow pilot gate (global OFF by default).
 * Global ON with empty, invalid, or oversize allowlist → shadow for nobody (fail-closed).
 */
export function isTripStartBoundaryAdmissionShadowEnabledForVehicle(
  vehicleId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isTripStartBoundaryAdmissionShadowEnabled(env)) {
    return false;
  }
  const parsed = parseTripStartBoundaryAdmissionShadowVehicleAllowlist(
    env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV],
  );
  if (!parsed.ok || parsed.allowlist.size === 0) {
    return false;
  }
  const normalizedVehicleId = vehicleId.trim().toLowerCase();
  if (!isCanonicalVehicleUuid(normalizedVehicleId)) {
    return false;
  }
  return parsed.allowlist.has(normalizedVehicleId);
}
