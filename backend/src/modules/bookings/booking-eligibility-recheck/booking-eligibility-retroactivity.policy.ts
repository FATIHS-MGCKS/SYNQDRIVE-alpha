import type { BookingStatus } from '@prisma/client';
import { isWizardDraftBooking } from '../booking-wizard-draft.util';
import type { BookingEligibilityInvalidationFact } from '../booking-eligibility-gatekeeper/booking-eligibility-status-transition.matrix';
import {
  BOOKING_ELIGIBILITY_RECHECK_TRIGGER,
  type BookingEligibilityRecheckTrigger,
  RETROACTIVITY_RECHECK_OUTCOME,
  type RetroactivityRecheckOutcome,
  RETROACTIVITY_SNAPSHOT_POLICY,
  type RetroactivitySnapshotPolicy,
} from './booking-eligibility-retroactivity.constants';

export interface RetroactivityPolicyInput {
  bookingStatus: BookingStatus;
  notes?: string | null;
  trigger: BookingEligibilityRecheckTrigger;
  invalidationFacts?: BookingEligibilityInvalidationFact[];
  ruleDriftDetected?: boolean;
  criticalRuleChange?: boolean;
}

export interface RetroactivityPolicyDecision {
  bookingStatus: BookingStatus;
  isWizardDraft: boolean;
  trigger: BookingEligibilityRecheckTrigger;
  snapshotPolicy: RetroactivitySnapshotPolicy;
  enforceGatekeeper: boolean;
  revokeApprovals: boolean;
  appendRecheckSnapshot: boolean;
  markReviewRequired: boolean;
  expectedOutcome: RetroactivityRecheckOutcome;
  /** Never true — cancellations require explicit business policy outside eligibility recheck. */
  allowAutoCancel: false;
}

const TERMINAL_STATUSES = new Set<BookingStatus>(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

export function resolveInvalidationFactsToTrigger(
  facts: BookingEligibilityInvalidationFact[],
): BookingEligibilityRecheckTrigger {
  if (facts.includes('vehicle')) return BOOKING_ELIGIBILITY_RECHECK_TRIGGER.VEHICLE_CHANGE;
  if (facts.includes('customer') || facts.includes('document_status') || facts.includes('license_validity')) {
    return facts.includes('document_status')
      ? BOOKING_ELIGIBILITY_RECHECK_TRIGGER.DOCUMENT_STATUS_CHANGE
      : BOOKING_ELIGIBILITY_RECHECK_TRIGGER.CUSTOMER_CHANGE;
  }
  if (facts.includes('period')) return BOOKING_ELIGIBILITY_RECHECK_TRIGGER.PERIOD_CHANGE;
  if (facts.includes('additional_drivers')) {
    return BOOKING_ELIGIBILITY_RECHECK_TRIGGER.ADDITIONAL_DRIVER_CHANGE;
  }
  if (facts.includes('foreign_travel')) {
    return BOOKING_ELIGIBILITY_RECHECK_TRIGGER.FOREIGN_TRAVEL_CHANGE;
  }
  if (facts.includes('deposit_payment')) {
    return BOOKING_ELIGIBILITY_RECHECK_TRIGGER.PAYMENT_CHANGE;
  }
  if (facts.includes('rule_revision')) return BOOKING_ELIGIBILITY_RECHECK_TRIGGER.RULE_PUBLISH;
  return BOOKING_ELIGIBILITY_RECHECK_TRIGGER.CUSTOMER_CHANGE;
}

export function resolveRetroactivityPolicy(
  input: RetroactivityPolicyInput,
): RetroactivityPolicyDecision {
  const isWizardDraft =
    input.bookingStatus === 'PENDING' &&
    isWizardDraftBooking({ status: input.bookingStatus, notes: input.notes });

  if (TERMINAL_STATUSES.has(input.bookingStatus)) {
    return baseDecision(input, isWizardDraft, {
      snapshotPolicy: RETROACTIVITY_SNAPSHOT_POLICY.NO_RETROACTIVE_CHANGE,
      enforceGatekeeper: false,
      revokeApprovals: false,
      appendRecheckSnapshot: false,
      markReviewRequired: false,
      expectedOutcome: RETROACTIVITY_RECHECK_OUTCOME.NOT_APPLICABLE,
    });
  }

  if (input.bookingStatus === 'ACTIVE') {
    const markReview = Boolean(input.ruleDriftDetected || input.criticalRuleChange);
    return baseDecision(input, isWizardDraft, {
      snapshotPolicy: RETROACTIVITY_SNAPSHOT_POLICY.NO_RETROACTIVE_CHANGE,
      enforceGatekeeper: input.trigger === BOOKING_ELIGIBILITY_RECHECK_TRIGGER.PICKUP_PRECHECK,
      revokeApprovals: false,
      appendRecheckSnapshot: markReview,
      markReviewRequired: markReview,
      expectedOutcome: markReview
        ? RETROACTIVITY_RECHECK_OUTCOME.REVIEW_REQUIRED
        : RETROACTIVITY_RECHECK_OUTCOME.NOT_APPLICABLE,
    });
  }

  if (input.bookingStatus === 'CONFIRMED') {
    if (input.trigger === BOOKING_ELIGIBILITY_RECHECK_TRIGGER.RULE_PUBLISH) {
      const markReview = Boolean(input.ruleDriftDetected || input.criticalRuleChange);
      return baseDecision(input, isWizardDraft, {
        snapshotPolicy: RETROACTIVITY_SNAPSHOT_POLICY.FROZEN_GRANDFATHER,
        enforceGatekeeper: false,
        revokeApprovals: true,
        appendRecheckSnapshot: true,
        markReviewRequired: markReview,
        expectedOutcome: markReview
          ? RETROACTIVITY_RECHECK_OUTCOME.REVIEW_REQUIRED
          : RETROACTIVITY_RECHECK_OUTCOME.GRANDFATHERED,
      });
    }

    if (
      input.trigger === BOOKING_ELIGIBILITY_RECHECK_TRIGGER.PICKUP_PRECHECK ||
      input.trigger === BOOKING_ELIGIBILITY_RECHECK_TRIGGER.SCHEDULED_RECHECK
    ) {
      return baseDecision(input, isWizardDraft, {
        snapshotPolicy: RETROACTIVITY_SNAPSHOT_POLICY.PICKUP_RECHECK,
        enforceGatekeeper: true,
        revokeApprovals: false,
        appendRecheckSnapshot: true,
        markReviewRequired: false,
        expectedOutcome: RETROACTIVITY_RECHECK_OUTCOME.PICKUP_RECHECK_PENDING,
      });
    }

    return baseDecision(input, isWizardDraft, {
      snapshotPolicy: RETROACTIVITY_SNAPSHOT_POLICY.FROZEN_GRANDFATHER,
      enforceGatekeeper: true,
      revokeApprovals: true,
      appendRecheckSnapshot: true,
      markReviewRequired: false,
      expectedOutcome: RETROACTIVITY_RECHECK_OUTCOME.REEVALUATED,
    });
  }

  if (isWizardDraft || input.bookingStatus === 'PENDING') {
    const onPublish = input.trigger === BOOKING_ELIGIBILITY_RECHECK_TRIGGER.RULE_PUBLISH;
    return baseDecision(input, isWizardDraft, {
      snapshotPolicy: RETROACTIVITY_SNAPSHOT_POLICY.LIVE_REEVALUATE,
      enforceGatekeeper: !onPublish,
      revokeApprovals: onPublish || Boolean(input.invalidationFacts?.length),
      appendRecheckSnapshot: true,
      markReviewRequired: false,
      expectedOutcome: onPublish
        ? RETROACTIVITY_RECHECK_OUTCOME.REEVALUATED
        : RETROACTIVITY_RECHECK_OUTCOME.REEVALUATED,
    });
  }

  return baseDecision(input, isWizardDraft, {
    snapshotPolicy: RETROACTIVITY_SNAPSHOT_POLICY.NO_RETROACTIVE_CHANGE,
    enforceGatekeeper: false,
    revokeApprovals: false,
    appendRecheckSnapshot: false,
    markReviewRequired: false,
    expectedOutcome: RETROACTIVITY_RECHECK_OUTCOME.NOT_APPLICABLE,
  });
}

function baseDecision(
  input: RetroactivityPolicyInput,
  isWizardDraft: boolean,
  fields: Omit<
    RetroactivityPolicyDecision,
    'bookingStatus' | 'isWizardDraft' | 'trigger' | 'allowAutoCancel'
  >,
): RetroactivityPolicyDecision {
  return {
    bookingStatus: input.bookingStatus,
    isWizardDraft,
    trigger: input.trigger,
    allowAutoCancel: false,
    ...fields,
  };
}

export function buildRetroactivityMatrix(): Array<{
  status: BookingStatus;
  isWizardDraft: boolean;
  trigger: BookingEligibilityRecheckTrigger;
  decision: RetroactivityPolicyDecision;
}> {
  const statuses: BookingStatus[] = [
    'PENDING',
    'CONFIRMED',
    'ACTIVE',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW',
  ];
  const triggers = Object.values(BOOKING_ELIGIBILITY_RECHECK_TRIGGER);
  const rows: Array<{
    status: BookingStatus;
    isWizardDraft: boolean;
    trigger: BookingEligibilityRecheckTrigger;
    decision: RetroactivityPolicyDecision;
  }> = [];

  for (const status of statuses) {
    for (const isWizardDraft of [false, true]) {
      if (status !== 'PENDING' && isWizardDraft) continue;
      for (const trigger of triggers) {
        rows.push({
          status,
          isWizardDraft,
          trigger,
          decision: resolveRetroactivityPolicy({
            bookingStatus: status,
            notes: isWizardDraft ? '[synq:wizard-draft]' : null,
            trigger,
            ruleDriftDetected: trigger === BOOKING_ELIGIBILITY_RECHECK_TRIGGER.RULE_PUBLISH,
            criticalRuleChange: trigger === BOOKING_ELIGIBILITY_RECHECK_TRIGGER.RULE_PUBLISH,
          }),
        });
      }
    }
  }

  return rows;
}
