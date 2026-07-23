export const BOOKING_ELIGIBILITY_RECHECK_TRIGGER = {
  RULE_PUBLISH: 'rule_publish',
  CUSTOMER_CHANGE: 'customer_change',
  DOCUMENT_STATUS_CHANGE: 'document_status_change',
  VEHICLE_CHANGE: 'vehicle_change',
  PERIOD_CHANGE: 'period_change',
  ADDITIONAL_DRIVER_CHANGE: 'additional_driver_change',
  FOREIGN_TRAVEL_CHANGE: 'foreign_travel_change',
  APPROVAL_EXPIRED: 'approval_expired',
  PAYMENT_CHANGE: 'payment_change',
  SCHEDULED_RECHECK: 'scheduled_recheck',
  PICKUP_PRECHECK: 'pickup_precheck',
} as const;

export type BookingEligibilityRecheckTrigger =
  (typeof BOOKING_ELIGIBILITY_RECHECK_TRIGGER)[keyof typeof BOOKING_ELIGIBILITY_RECHECK_TRIGGER];

export const RETROACTIVITY_SNAPSHOT_POLICY = {
  LIVE_REEVALUATE: 'LIVE_REEVALUATE',
  FROZEN_GRANDFATHER: 'FROZEN_GRANDFATHER',
  PICKUP_RECHECK: 'PICKUP_RECHECK',
  NO_RETROACTIVE_CHANGE: 'NO_RETROACTIVE_CHANGE',
} as const;

export type RetroactivitySnapshotPolicy =
  (typeof RETROACTIVITY_SNAPSHOT_POLICY)[keyof typeof RETROACTIVITY_SNAPSHOT_POLICY];

export const RETROACTIVITY_RECHECK_OUTCOME = {
  NOT_APPLICABLE: 'not_applicable',
  REEVALUATED: 'reevaluated',
  GRANDFATHERED: 'grandfathered',
  REVIEW_REQUIRED: 'review_required',
  PICKUP_RECHECK_PENDING: 'pickup_recheck_pending',
  DRIFT_DETECTED: 'drift_detected',
} as const;

export type RetroactivityRecheckOutcome =
  (typeof RETROACTIVITY_RECHECK_OUTCOME)[keyof typeof RETROACTIVITY_RECHECK_OUTCOME];

export const BOOKING_ELIGIBILITY_RECHECK_ERROR_CODE = {
  AUTO_CANCEL_FORBIDDEN: 'BOOKING_ELIGIBILITY_AUTO_CANCEL_FORBIDDEN',
} as const;
