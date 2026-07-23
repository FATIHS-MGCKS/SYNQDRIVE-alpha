import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import {
  assertBookingEligibilityTransitionAllowed,
  BOOKING_ELIGIBILITY_TRANSITION_CODE,
  resolveEligibilityPolicyMode,
  shouldSkipEligibilityEnforcement,
} from './booking-eligibility-transition.policy';
import { testGateResult } from './booking-eligibility-test.fixtures';

function gateResult(
  status: ReturnType<typeof testGateResult>['status'],
) {
  return testGateResult({ status });
}

const approvedForConfirm = {
  id: 'approval-1',
  status: 'APPROVED' as const,
  eligibilityFingerprint: 'fp',
  ruleRevision: 'rev',
  bookingDataVersion: 'data',
  targetBookingStatus: 'CONFIRMED',
  gateStage: 'CONFIRM',
};

const approvedForPickup = {
  ...approvedForConfirm,
  id: 'approval-2',
  targetBookingStatus: 'ACTIVE',
  gateStage: 'PICKUP',
};

describe('booking-eligibility-transition.policy', () => {
  it('skips enforcement for wizard drafts', () => {
    expect(
      shouldSkipEligibilityEnforcement(
        resolveEligibilityPolicyMode({
          targetStatus: 'PENDING',
          isWizardDraft: true,
        }),
      ),
    ).toBe(true);
  });

  it('allows missing information on pending transitions', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(gateResult('MISSING_INFORMATION'), 'PENDING', {
        validatedApproval: null,
      }),
    ).not.toThrow();
  });

  it('blocks not eligible on pending transitions', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(gateResult('NOT_ELIGIBLE'), 'PENDING', {
        validatedApproval: null,
      }),
    ).toThrow(ConflictException);
  });

  it('blocks confirmed when not eligible', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(gateResult('NOT_ELIGIBLE'), 'CONFIRMED', {
        validatedApproval: null,
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: BOOKING_ELIGIBILITY_TRANSITION_CODE.NOT_ELIGIBLE,
        }),
      }),
    );
  });

  it('requires persisted approval for manual approval on confirm', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(
        gateResult('MANUAL_APPROVAL_REQUIRED'),
        'CONFIRMED',
        { validatedApproval: null },
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: BOOKING_ELIGIBILITY_TRANSITION_CODE.APPROVAL_REQUIRED,
        }),
      }),
    );
  });

  it('allows confirmed manual approval with validated approval object', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(
        gateResult('MANUAL_APPROVAL_REQUIRED'),
        'CONFIRMED',
        { validatedApproval: approvedForConfirm },
      ),
    ).not.toThrow();
  });

  it('rejects pickup approval object on confirm transition', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(
        gateResult('MANUAL_APPROVAL_REQUIRED'),
        'CONFIRMED',
        { validatedApproval: approvedForPickup },
      ),
    ).toThrow(ConflictException);
  });

  it('blocks active pickup when missing information', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(gateResult('MISSING_INFORMATION'), 'ACTIVE', {
        validatedApproval: null,
      }),
    ).toThrow(ConflictException);
  });

  it('blocks confirmed on technical error with 503', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(gateResult('TECHNICAL_ERROR'), 'CONFIRMED', {
        validatedApproval: null,
      }),
    ).toThrow(ServiceUnavailableException);
  });

  it('allows active pickup with validated approval object', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(
        gateResult('MANUAL_APPROVAL_REQUIRED'),
        'ACTIVE',
        { validatedApproval: approvedForPickup },
      ),
    ).not.toThrow();
  });
});
