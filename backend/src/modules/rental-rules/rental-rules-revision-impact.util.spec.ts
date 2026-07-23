import { buildNormalizedRentalRulesDocument } from './rental-rules-revision.util';
import { buildRentalRuleRevisionDiff } from './rental-rules-revision-diff.util';
import {
  assessCriticalRuleChanges,
  RENTAL_RULE_CRITICAL_CHANGE_CODES,
} from './rental-rules-revision-impact.util';

describe('rental-rules-revision-impact.util', () => {
  it('flags critical changes and confirmed booking exposure', () => {
    const diff = buildRentalRuleRevisionDiff({
      scopeType: 'ORGANIZATION',
      scopeId: 'org1',
      active: buildNormalizedRentalRulesDocument({
        scopeType: 'ORGANIZATION',
        row: { minimumAgeYears: 21, manualApprovalRequired: false, isActive: true },
      }),
      draft: buildNormalizedRentalRulesDocument({
        scopeType: 'ORGANIZATION',
        row: { minimumAgeYears: 25, manualApprovalRequired: true, isActive: true },
      }),
    });

    const assessment = assessCriticalRuleChanges({
      diff,
      bookingImpact: {
        wizardDraft: { count: 1, bookingIds: ['b-draft'] },
        pending: { count: 2, bookingIds: ['b1', 'b2'] },
        confirmed: { count: 1, bookingIds: ['b-confirmed'] },
        confirmedBookingsUnchanged: true,
      },
      manualApprovalImpact: {
        pendingApprovalCount: 1,
        approvalIds: ['a1'],
        bookingIds: ['b-confirmed'],
      },
    });

    expect(assessment.isCritical).toBe(true);
    expect(assessment.requiresAcknowledgement).toBe(true);
    expect(assessment.codes).toEqual(
      expect.arrayContaining([
        RENTAL_RULE_CRITICAL_CHANGE_CODES.MINIMUM_AGE_INCREASED,
        RENTAL_RULE_CRITICAL_CHANGE_CODES.MANUAL_APPROVAL_ENABLED,
        RENTAL_RULE_CRITICAL_CHANGE_CODES.CONFIRMED_BOOKINGS_AFFECTED,
        RENTAL_RULE_CRITICAL_CHANGE_CODES.PENDING_APPROVALS_AFFECTED,
      ]),
    );
  });
});
