/**
 * P1B — runtime shadow for evidence-backed start boundary admission.
 * Default disabled (fail-closed). Does not affect legacy canonical start when off.
 */

export const TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV =
  'TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED';

/** Optional shadow-only route enrichment when legacy had a DIMO segment match (extra provider budget). */
export const TRIP_START_BOUNDARY_ADMISSION_SHADOW_ROUTE_FETCH_ENABLED_ENV =
  'TRIP_START_BOUNDARY_ADMISSION_SHADOW_ROUTE_FETCH_ENABLED';

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
