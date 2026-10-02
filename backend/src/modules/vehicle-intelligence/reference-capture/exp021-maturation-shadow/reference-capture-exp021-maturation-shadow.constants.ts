/** BullMQ job name for maturation shadow observation execution. */
export const REFERENCE_CAPTURE_EXP021_MATURATION_SHADOW_JOB_NAME =
  'reference-capture-exp021-maturation-shadow-observe';

/** Bounded worker concurrency — experiment isolated; default 1. */
export const EXP021_MATURATION_SHADOW_WORKER_CONCURRENCY = 1;

/** Max transport retries per observation slot (application-level, not BullMQ auto-retry). */
export const EXP021_MATURATION_SHADOW_MAX_TRANSPORT_RETRIES = 3;

/** Base delay before transport retry re-enqueue (ms). */
export const EXP021_MATURATION_SHADOW_TRANSPORT_RETRY_BASE_DELAY_MS = 5_000;

/**
 * Deterministic BullMQ job ID from canonical scientific identity.
 * MUST NOT include enrollmentEventId, random UUID, replica, or timestamp.
 */
export function buildExp021MaturationShadowJobId(input: {
  windowFamilyId: string;
  windowStratumId: string;
  plannedAgeMs: number;
  transportRetryOrdinal?: number;
}): string {
  const retrySuffix =
    input.transportRetryOrdinal != null && input.transportRetryOrdinal > 0
      ? `-retry-${input.transportRetryOrdinal}`
      : '';
  return `rc-exp021-ms-${input.windowFamilyId}-${input.windowStratumId}-${input.plannedAgeMs}${retrySuffix}`;
}
