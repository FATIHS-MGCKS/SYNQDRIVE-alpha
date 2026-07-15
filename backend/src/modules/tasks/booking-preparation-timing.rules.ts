import { BOOKING_PREPARATION_RULE_ID, BOOKING_PREPARATION_RULE_VERSION } from './booking-task-automation.constants';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Canonical timing defaults for BOOKING_PREPARATION (Task Domain V2).
 * Org-specific overrides are reserved for a later phase — not UI-configurable yet.
 */
export const BOOKING_PREPARATION_TIMING_RULE = {
  ruleId: BOOKING_PREPARATION_RULE_ID,
  ruleVersion: BOOKING_PREPARATION_RULE_VERSION,
  /** Task becomes eligible this long before planned pickup. */
  activationLeadBeforePickupMs: 48 * HOUR_MS,
  /** Operational due moment before planned pickup. */
  dueLeadBeforePickupMs: 2 * HOUR_MS,
  /**
   * After a preparation task was manually completed, a pickup move of at least
   * this duration materializes a fresh preparation task (upsert recycles closed row).
   *
   * Phase identity rule (no separate phase dedup suffix on the happy path):
   * - Active/planned task + pickup moved → same `booking:prep:{bookingId}` row,
   *   timing updated via `TIMING_CHANGED`.
   * - DONE task + pickup moved < threshold → no reopen, no new task.
   * - DONE task + pickup moved ≥ threshold → `upsertByDedup` parks the closed
   *   row's dedupKey and creates a new OPEN preparation task on the canonical key.
   */
  significantRescheduleThresholdMs: 24 * HOUR_MS,
} as const;
