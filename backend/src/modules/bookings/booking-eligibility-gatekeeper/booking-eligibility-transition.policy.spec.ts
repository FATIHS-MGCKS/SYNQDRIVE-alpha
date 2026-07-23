import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
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
        hasOverridePermission: false,
      }),
    ).not.toThrow();
  });

  it('blocks not eligible on pending transitions', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(gateResult('NOT_ELIGIBLE'), 'PENDING', {
        hasOverridePermission: false,
      }),
    ).toThrow(ConflictException);
  });

  it('blocks confirmed when not eligible', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(gateResult('NOT_ELIGIBLE'), 'CONFIRMED', {
        hasOverridePermission: false,
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: BOOKING_ELIGIBILITY_TRANSITION_CODE.NOT_ELIGIBLE,
        }),
      }),
    );
  });

  it('blocks confirmed when missing information', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(gateResult('MISSING_INFORMATION'), 'CONFIRMED', {
        hasOverridePermission: false,
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: BOOKING_ELIGIBILITY_TRANSITION_CODE.MISSING_INFORMATION,
        }),
      }),
    );
  });

  it('requires override reason for manual approval on confirm', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(
        gateResult('MANUAL_APPROVAL_REQUIRED'),
        'CONFIRMED',
        { hasOverridePermission: true },
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: BOOKING_ELIGIBILITY_TRANSITION_CODE.MANUAL_APPROVAL_REQUIRED,
        }),
      }),
    );
  });

  it('allows confirmed manual approval with override permission and reason', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(
        gateResult('MANUAL_APPROVAL_REQUIRED'),
        'CONFIRMED',
        { hasOverridePermission: true, eligibilityOverrideReason: 'Approved by station manager' },
      ),
    ).not.toThrow();
  });

  it('denies confirmed manual approval override without permission', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(
        gateResult('MANUAL_APPROVAL_REQUIRED'),
        'CONFIRMED',
        { hasOverridePermission: false, eligibilityOverrideReason: 'Approved' },
      ),
    ).toThrow(ForbiddenException);
  });

  it('blocks active pickup when missing information', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(gateResult('MISSING_INFORMATION'), 'ACTIVE', {
        hasOverridePermission: false,
      }),
    ).toThrow(ConflictException);
  });

  it('blocks confirmed on technical error with 503', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(gateResult('TECHNICAL_ERROR'), 'CONFIRMED', {
        hasOverridePermission: false,
      }),
    ).toThrow(ServiceUnavailableException);
  });

  it('allows active pickup with manual override reason and permission', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(
        gateResult('MANUAL_APPROVAL_REQUIRED'),
        'ACTIVE',
        { hasOverridePermission: true, eligibilityOverrideReason: 'Station manager approved pickup' },
      ),
    ).not.toThrow();
  });
});
