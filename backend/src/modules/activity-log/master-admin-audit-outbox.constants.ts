export const MASTER_ADMIN_AUDIT_OUTBOX = {
  payloadVersion: 1,
  pollBatchSize: 25,
  maxAttempts: 5,
  backoffMs: 2_000,
  staleProcessingMs: 5 * 60_000,
} as const;