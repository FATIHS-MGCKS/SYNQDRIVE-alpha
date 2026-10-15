import type { DiV0P2AutoProjectionOutboxStatus } from './di-v0-p2-auto-projection-outbox.repository';
import type { DiV0TripGpsSpeedEvaluationUnavailableAvailability } from './di-v0-trip-speed-quality-product-read.types';

/** S4 PRIMARY work item is still executing or waiting for retry (see di_v0_s4_wi_status_ck). */
export const DI_V0_S4_WORK_ITEM_AWAITING_COMPLETION_STATUSES = new Set([
  'PENDING',
  'LEASED',
  'FAILED_RETRYABLE',
]);

/** Terminal S4 states — no in-flight settlement; product read must not show PENDING. */
export const DI_V0_S4_WORK_ITEM_TERMINAL_UNAVAILABLE_STATUSES = new Set([
  'FAILED_TERMINAL',
  'SKIPPED_INELIGIBLE',
]);

const PENDING_OUTBOX_STATUSES = new Set<DiV0P2AutoProjectionOutboxStatus>([
  'PENDING',
  'PROCESSING',
  'FAILED_RETRYABLE',
]);

/**
 * When no CURRENT V2 projection row is returned, derive product availability from
 * active PRIMARY work item + optional P2 outbox row (read-only).
 */
export function resolveGpsSpeedEvaluationAvailabilityWithoutProjection(
  workItemStatus: string | null,
  outboxStatus: DiV0P2AutoProjectionOutboxStatus | null,
): DiV0TripGpsSpeedEvaluationUnavailableAvailability {
  if (!workItemStatus) {
    return 'UNAVAILABLE';
  }

  if (DI_V0_S4_WORK_ITEM_AWAITING_COMPLETION_STATUSES.has(workItemStatus)) {
    return 'PENDING';
  }

  if (DI_V0_S4_WORK_ITEM_TERMINAL_UNAVAILABLE_STATUSES.has(workItemStatus)) {
    return 'UNAVAILABLE';
  }

  if (workItemStatus !== 'COMPLETED') {
    return 'UNAVAILABLE';
  }

  if (outboxStatus && PENDING_OUTBOX_STATUSES.has(outboxStatus)) {
    return 'PENDING';
  }

  // COMPLETED + outbox SUCCEEDED / SKIPPED_INELIGIBLE / absent → no CURRENT row yet or stale
  return 'UNAVAILABLE';
}
