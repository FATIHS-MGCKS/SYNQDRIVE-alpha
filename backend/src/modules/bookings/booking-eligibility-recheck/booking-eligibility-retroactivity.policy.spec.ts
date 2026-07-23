import type { BookingStatus } from '@prisma/client';
import {
  BOOKING_ELIGIBILITY_RECHECK_TRIGGER,
  RETROACTIVITY_RECHECK_OUTCOME,
  RETROACTIVITY_SNAPSHOT_POLICY,
} from './booking-eligibility-retroactivity.constants';
import {
  buildRetroactivityMatrix,
  resolveRetroactivityPolicy,
} from './booking-eligibility-retroactivity.policy';

describe('booking eligibility retroactivity policy', () => {
  describe('resolveRetroactivityPolicy', () => {
    it('reevaluates wizard drafts on rule publish without enforcing gatekeeper immediately', () => {
      const decision = resolveRetroactivityPolicy({
        bookingStatus: 'PENDING',
        notes: '[synq:wizard-draft]',
        trigger: BOOKING_ELIGIBILITY_RECHECK_TRIGGER.RULE_PUBLISH,
      });

      expect(decision.isWizardDraft).toBe(true);
      expect(decision.snapshotPolicy).toBe(RETROACTIVITY_SNAPSHOT_POLICY.LIVE_REEVALUATE);
      expect(decision.enforceGatekeeper).toBe(false);
      expect(decision.revokeApprovals).toBe(true);
      expect(decision.allowAutoCancel).toBe(false);
    });

    it('reevaluates real pending bookings on customer change', () => {
      const decision = resolveRetroactivityPolicy({
        bookingStatus: 'PENDING',
        trigger: BOOKING_ELIGIBILITY_RECHECK_TRIGGER.CUSTOMER_CHANGE,
        invalidationFacts: ['customer', 'document_status'],
      });

      expect(decision.enforceGatekeeper).toBe(true);
      expect(decision.snapshotPolicy).toBe(RETROACTIVITY_SNAPSHOT_POLICY.LIVE_REEVALUATE);
      expect(decision.expectedOutcome).toBe(RETROACTIVITY_RECHECK_OUTCOME.REEVALUATED);
    });

    it('grandfathers confirmed bookings on rule publish and marks review when drift is critical', () => {
      const decision = resolveRetroactivityPolicy({
        bookingStatus: 'CONFIRMED',
        trigger: BOOKING_ELIGIBILITY_RECHECK_TRIGGER.RULE_PUBLISH,
        ruleDriftDetected: true,
        criticalRuleChange: true,
      });

      expect(decision.snapshotPolicy).toBe(RETROACTIVITY_SNAPSHOT_POLICY.FROZEN_GRANDFATHER);
      expect(decision.enforceGatekeeper).toBe(false);
      expect(decision.revokeApprovals).toBe(true);
      expect(decision.markReviewRequired).toBe(true);
      expect(decision.expectedOutcome).toBe(RETROACTIVITY_RECHECK_OUTCOME.REVIEW_REQUIRED);
      expect(decision.allowAutoCancel).toBe(false);
    });

    it('reevaluates confirmed bookings on vehicle change without auto-cancel', () => {
      const decision = resolveRetroactivityPolicy({
        bookingStatus: 'CONFIRMED',
        trigger: BOOKING_ELIGIBILITY_RECHECK_TRIGGER.VEHICLE_CHANGE,
        invalidationFacts: ['vehicle', 'rule_revision'],
      });

      expect(decision.enforceGatekeeper).toBe(true);
      expect(decision.revokeApprovals).toBe(true);
      expect(decision.allowAutoCancel).toBe(false);
    });

    it('requires pickup recheck for confirmed bookings on scheduled recheck', () => {
      const decision = resolveRetroactivityPolicy({
        bookingStatus: 'CONFIRMED',
        trigger: BOOKING_ELIGIBILITY_RECHECK_TRIGGER.SCHEDULED_RECHECK,
      });

      expect(decision.snapshotPolicy).toBe(RETROACTIVITY_SNAPSHOT_POLICY.PICKUP_RECHECK);
      expect(decision.enforceGatekeeper).toBe(true);
      expect(decision.expectedOutcome).toBe(RETROACTIVITY_RECHECK_OUTCOME.PICKUP_RECHECK_PENDING);
    });

    it('does not retroactively change active rentals except pickup precheck enforcement', () => {
      const decision = resolveRetroactivityPolicy({
        bookingStatus: 'ACTIVE',
        trigger: BOOKING_ELIGIBILITY_RECHECK_TRIGGER.RULE_PUBLISH,
        ruleDriftDetected: true,
      });

      expect(decision.snapshotPolicy).toBe(RETROACTIVITY_SNAPSHOT_POLICY.NO_RETROACTIVE_CHANGE);
      expect(decision.enforceGatekeeper).toBe(false);
      expect(decision.markReviewRequired).toBe(true);
    });

    it('skips terminal bookings', () => {
      const statuses: BookingStatus[] = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
      for (const bookingStatus of statuses) {
        const decision = resolveRetroactivityPolicy({
          bookingStatus,
          trigger: BOOKING_ELIGIBILITY_RECHECK_TRIGGER.RULE_PUBLISH,
        });
        expect(decision.expectedOutcome).toBe(RETROACTIVITY_RECHECK_OUTCOME.NOT_APPLICABLE);
        expect(decision.appendRecheckSnapshot).toBe(false);
      }
    });
  });

  describe('buildRetroactivityMatrix', () => {
    it('covers all booking statuses and never allows auto-cancel', () => {
      const matrix = buildRetroactivityMatrix();
      const statuses = new Set(matrix.map((row) => row.status));

      expect(statuses.has('PENDING')).toBe(true);
      expect(statuses.has('CONFIRMED')).toBe(true);
      expect(statuses.has('ACTIVE')).toBe(true);
      expect(statuses.has('COMPLETED')).toBe(true);
      expect(matrix.every((row) => row.decision.allowAutoCancel === false)).toBe(true);
    });
  });
});
