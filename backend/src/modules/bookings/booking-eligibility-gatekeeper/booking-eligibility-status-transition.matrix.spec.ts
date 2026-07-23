import { ConflictException } from '@nestjs/common';
import {
  assertBookingEligibilityTransitionAllowed,
  BOOKING_ELIGIBILITY_TRANSITION_CODE,
  resolveEligibilityPolicyMode,
  resolveGateStageForPolicyMode,
  shouldSkipEligibilityEnforcement,
} from './booking-eligibility-transition.policy';
import {
  buildBookingEligibilityTransitionMatrix,
  gateStatusAllowsTransition,
  listInvalidationFactsFromMutation,
  resolveBookingEligibilityTransition,
  shouldEnforceBookingEligibilityForUpdate,
} from './booking-eligibility-status-transition.matrix';
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

describe('booking-eligibility-status-transition.matrix', () => {
  it('skips wizard draft pending creation', () => {
    const decision = resolveBookingEligibilityTransition({
      from: 'DRAFT',
      to: 'PENDING',
      isWizardDraft: true,
      mutation: { statusChanged: true },
    });
    expect(decision.enforceEligibility).toBe(false);
    expect(decision.policyMode).toBe('DRAFT');
  });

  it('enforces pending to confirmed transition', () => {
    const decision = resolveBookingEligibilityTransition({
      from: 'PENDING',
      to: 'CONFIRMED',
      mutation: { statusChanged: true },
    });
    expect(decision.enforceEligibility).toBe(true);
    expect(decision.policyMode).toBe('CONFIRMED');
    expect(decision.gateStage).toBe('CONFIRM');
  });

  it('enforces confirmed to active pickup transition', () => {
    const decision = resolveBookingEligibilityTransition({
      from: 'CONFIRMED',
      to: 'ACTIVE',
      mutation: { statusChanged: true },
    });
    expect(decision.enforceEligibility).toBe(true);
    expect(decision.policyMode).toBe('ACTIVE');
    expect(decision.gateStage).toBe('PICKUP');
    expect(decision.invalidatesPriorDecision).toBe(true);
  });

  it('rejects active transition from non-confirmed states', () => {
    const decision = resolveBookingEligibilityTransition({
      from: 'PENDING',
      to: 'ACTIVE',
      mutation: { statusChanged: true },
    });
    expect(decision.allowed).toBe(false);
  });

  it('does not enforce terminal transitions', () => {
    for (const to of ['CANCELLED', 'NO_SHOW', 'COMPLETED'] as const) {
      const decision = resolveBookingEligibilityTransition({
        from: 'CONFIRMED',
        to,
        mutation: { statusChanged: true },
      });
      expect(decision.enforceEligibility).toBe(false);
    }
  });

  it('invalidates prior decisions when customer or vehicle changes on confirmed booking', () => {
    const facts = listInvalidationFactsFromMutation({
      customerIdChanged: true,
      vehicleIdChanged: true,
      datesChanged: true,
      paymentIntentChanged: true,
      extrasChanged: true,
      additionalDriversChanged: true,
      statusChanged: false,
    });
    expect(facts).toEqual(
      expect.arrayContaining([
        'customer',
        'vehicle',
        'period',
        'document_status',
        'license_validity',
        'rule_revision',
        'deposit_payment',
        'foreign_travel',
        'additional_drivers',
      ]),
    );

    expect(
      shouldEnforceBookingEligibilityForUpdate({
        existingStatus: 'CONFIRMED',
        targetStatus: 'CONFIRMED',
        isWizardDraft: false,
        mutation: { customerIdChanged: true },
      }),
    ).toBe(true);
  });

  it('maps policy modes to gate stages including pickup', () => {
    expect(resolveGateStageForPolicyMode('ACTIVE')).toBe('PICKUP');
    expect(resolveGateStageForPolicyMode('CONFIRMED')).toBe('CONFIRM');
    expect(resolveGateStageForPolicyMode('PENDING')).toBe('CREATE');
    expect(resolveEligibilityPolicyMode({ targetStatus: 'ACTIVE', isWizardDraft: false })).toBe(
      'ACTIVE',
    );
    expect(shouldSkipEligibilityEnforcement('DRAFT')).toBe(true);
    expect(shouldSkipEligibilityEnforcement('ACTIVE')).toBe(false);
  });

  it('defines allowed gate statuses per policy mode', () => {
    expect(gateStatusAllowsTransition('MISSING_INFORMATION', 'PENDING')).toBe(true);
    expect(gateStatusAllowsTransition('NOT_ELIGIBLE', 'PENDING')).toBe(false);
    expect(gateStatusAllowsTransition('ELIGIBLE', 'ACTIVE')).toBe(true);
    expect(gateStatusAllowsTransition('MISSING_INFORMATION', 'ACTIVE')).toBe(false);
  });

  it('blocks pickup when not eligible', () => {
    expect(() =>
      assertBookingEligibilityTransitionAllowed(gateResult('NOT_ELIGIBLE'), 'ACTIVE', {
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

  it('exposes a complete transition matrix without unexpected holes for enforced paths', () => {
    const matrix = buildBookingEligibilityTransitionMatrix();
    const enforced = matrix.filter((row) => row.decision.enforceEligibility);
    const enforcedPairs = enforced.map((row) => `${row.from}->${row.to}`);

    expect(enforcedPairs).toEqual(
      expect.arrayContaining([
        'PENDING->CONFIRMED',
        'CONFIRMED->ACTIVE',
      ]),
    );

    expect(
      matrix.find((row) => row.from === 'PENDING' && row.to === 'ACTIVE')?.decision.allowed,
    ).toBe(false);
  });
});
