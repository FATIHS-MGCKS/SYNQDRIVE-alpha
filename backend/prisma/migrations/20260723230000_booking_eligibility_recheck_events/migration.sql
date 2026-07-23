-- Extend eligibility decision event types for retroactivity recheck snapshots.
ALTER TYPE "BookingEligibilityDecisionEventType" ADD VALUE IF NOT EXISTS 'RULE_PUBLISH_RECHECK';
ALTER TYPE "BookingEligibilityDecisionEventType" ADD VALUE IF NOT EXISTS 'MUTATION_RECHECK';
ALTER TYPE "BookingEligibilityDecisionEventType" ADD VALUE IF NOT EXISTS 'SCHEDULED_RECHECK';
ALTER TYPE "BookingEligibilityDecisionEventType" ADD VALUE IF NOT EXISTS 'APPROVAL_EXPIRED_RECHECK';
