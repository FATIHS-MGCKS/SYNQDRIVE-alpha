export const M3_3G_GROUND_TRUTH_ADMISSION_CONTRACT = 'M3_3G_GROUND_TRUTH_ADMISSION_V1' as const;

export const M3_3G_GROUND_TRUTH_FINGERPRINT_VERSION = 'M3_3G_GROUND_TRUTH_FINGERPRINT_V1' as const;

/** Idempotency: active CONFIRMED rows unique on (organizationId, sourceContentFingerprint). */
export const GROUND_TRUTH_IDEMPOTENCY_KEY =
  'organizationId+sourceContentFingerprint@CONFIRMED' as const;
