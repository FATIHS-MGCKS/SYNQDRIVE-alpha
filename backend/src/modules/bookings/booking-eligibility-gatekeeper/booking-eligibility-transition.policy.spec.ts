import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  assertBookingEligibilityTransitionAllowed,
  BOOKING_ELIGIBILITY_TRANSITION_CODE,
  resolveEligibilityPolicyMode,
  shouldSkipEligibilityEnforcement,
} from './booking-eligibility-transition.policy';
import type { BookingEligibilityGateResult } from './booking-eligibility-gatekeeper.types';

function gateResult(
  status: BookingEligibilityGateResult['status'],
): BookingEligibilityGateResult {
  return {
    status,
    stage: 'CONFIRM',
    allowed: status === 'ELIGIBLE' || status === 'MANUAL_APPROVAL_REQUIRED',
    reasonCodes: [],
    blockingReasons: [],
    warnings: [],
    missingFields: [],
    sourceRuleIds: [],
    evaluatedAt: new Date().toISOString(),
    recheckRequired: false,
    engineVersion: '1.0.0',
    organizationId: 'org-1',
    customerId: 'cust-1',
    vehicleId: 'veh-1',
    domains: {
      customer: { evaluated: true, canProceedForStage: true, result: null },
      verification: { evaluated: true, result: null },
      rentalRules: { evaluated: true, result: null },
      vehicle: { evaluated: true, vehicleFound: true, vehicleId: 'veh-1' },
      vehicleReadiness: { evaluated: false, skipped: true, blocked: false },
      pricingDeposit: { evaluated: false, skipped: true },
    },
  };
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
});
