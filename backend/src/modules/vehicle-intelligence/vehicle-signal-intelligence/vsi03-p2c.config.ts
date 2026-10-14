export const VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENV =
  'VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED';

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
