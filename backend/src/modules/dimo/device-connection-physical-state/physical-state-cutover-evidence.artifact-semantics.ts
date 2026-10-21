/** Canonical artifact result strings for signed cutover evidence v1. */
export const CUTOVER_EVIDENCE_ARTIFACT_RESULT = {
  TARGET_APPROVAL: 'APPROVED',
  PRESEED_DRY_RUN: 'PASS',
  UNEXPLAINED_EXPORT: 'PASS',
  MIXED_REPLICA_VERIFY: 'PASS',
  RUNTIME_BUILD: 'PASS',
} as const;
