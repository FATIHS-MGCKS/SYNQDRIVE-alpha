export const VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION = 'vsi-apds-p5b1-offline-v1' as const;

export const VSI_APDS_P5B1_EVIDENCE_STORE_CONTRACT_VERSION =
  'vsi-apds-p5b1-evidence-store-v1' as const;

export const VSI_APDS_P5B1_DEFAULT_BATCH_LIMIT = 100;
export const VSI_APDS_P5B1_MAX_BATCH_LIMIT = 500;
export const VSI_APDS_P5B1_MAX_TOTAL_DECISIONS = 5_000;
/** 90-day maximum decision window per operator invocation. */
export const VSI_APDS_P5B1_MAX_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
