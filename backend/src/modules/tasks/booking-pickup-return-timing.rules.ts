import {
  BOOKING_PICKUP_RULE_ID,
  BOOKING_RETURN_RULE_ID,
} from './booking-task-automation.constants';

const HOUR_MS = 60 * 60 * 1000;

/** Canonical timing defaults for BOOKING_PICKUP (handover operational task). */
export const BOOKING_PICKUP_TIMING_RULE = {
  ruleId: BOOKING_PICKUP_RULE_ID,
  ruleVersion: 1,
  /** Task becomes visible this long before planned pickup. */
  activationLeadBeforePickupMs: 2 * HOUR_MS,
  /** Due exactly at planned pickup (`startDate`). */
  dueLeadBeforePickupMs: 0,
  /** Priority when pickup moment has passed but handover is still open. */
  overduePriority: 'HIGH' as const,
  /** Escalate to CRITICAL when pickup is late beyond this threshold. */
  criticalOverdueAfterMs: 24 * HOUR_MS,
  significantRescheduleThresholdMs: 24 * HOUR_MS,
} as const;

/** Canonical timing defaults for BOOKING_RETURN (return handover only — no invoice/docs). */
export const BOOKING_RETURN_TIMING_RULE = {
  ruleId: BOOKING_RETURN_RULE_ID,
  ruleVersion: 1,
  /** Task becomes visible this long before planned return. */
  activationLeadBeforeReturnMs: 24 * HOUR_MS,
  /** Due exactly at planned return (`endDate`). */
  dueLeadBeforeReturnMs: 0,
  overduePriority: 'HIGH' as const,
  criticalOverdueAfterMs: 24 * HOUR_MS,
  significantRescheduleThresholdMs: 24 * HOUR_MS,
} as const;
