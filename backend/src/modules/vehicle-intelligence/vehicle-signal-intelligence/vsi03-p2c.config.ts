export const VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENV =
  'VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED';

/** P2D — pilot allowlist gate (default OFF; required in addition to capture flag). */
export const VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_ENABLED_ENV =
  'VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_ENABLED';

export const VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_JSON_ENV =
  'VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_JSON';

export const VSI03_P2C_STRICT_ADVANCE_READ_ENV =
  'VSI03_P2C_STRICT_ADVANCE_FROM_OBSERVATIONS_ENABLED';

export function isVsi03P2cSourceObservationCaptureEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENV]?.trim().toLowerCase() === 'true';
}

export function isVsi03P2cStrictAdvanceReadEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[VSI03_P2C_STRICT_ADVANCE_READ_ENV]?.trim().toLowerCase() === 'true';
}

/** Max skew between latest observation fetch time and VLS providerFetchedAt for integrity gate. */
export const VSI03_P2C_VLS_FETCH_ALIGNMENT_TOLERANCE_MS = 5_000;
