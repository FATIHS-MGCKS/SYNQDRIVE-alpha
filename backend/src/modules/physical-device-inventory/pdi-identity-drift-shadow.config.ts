/**
 * PDI identity drift shadow — default OFF, fail-closed.
 */
export function isPdiIdentityDriftShadowEnabled(): boolean {
  const raw = process.env.PDI_IDENTITY_DRIFT_SHADOW_ENABLED;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

/** Mirror identity older than this is not trusted for drift confirmation (24h sync + buffer). */
export const PDI_IDENTITY_DRIFT_MIRROR_MAX_AGE_MS = 25 * 60 * 60 * 1000;

export const PDI_IDENTITY_DRIFT_SHADOW_META_KEY = 'pdiIdentityDriftShadowV1';
