import { ConflictException } from '@nestjs/common';
import type { BookingEligibilityGateResult } from './booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.types';
import {
  assertWizardPreviewFingerprintMatches,
  buildEligibilityPreviewFingerprint,
  mapGatekeeperToWizardPreview,
} from './booking-wizard-eligibility.util';
import { BOOKING_ELIGIBILITY_TRANSITION_CODE } from './booking-eligibility-gatekeeper/booking-eligibility-transition.policy';

function buildGateResult(
  overrides: Partial<BookingEligibilityGateResult> = {},
): BookingEligibilityGateResult {
  return {
    status: 'ELIGIBLE',
    stage: 'CONFIRM',
    allowed: true,
    reasonCodes: [],
    blockingReasons: [],
    warnings: [],
    missingFields: [],
    sourceRuleIds: ['org:org-1'],
    evaluatedAt: '2026-07-01T10:00:00.000Z',
    recheckRequired: false,
    engineVersion: '1.0.0',
    organizationId: 'org-1',
    customerId: 'cust-1',
    vehicleId: 'veh-1',
    bookingId: 'booking-1',
    domains: {
      customer: { evaluated: true, canProceedForStage: true, result: null },
      verification: { evaluated: true, result: null },
      rentalRules: { evaluated: true, result: null },
      vehicle: { evaluated: true, vehicleFound: true, vehicleId: 'veh-1' },
      vehicleReadiness: { evaluated: false, skipped: true, blocked: false },
      pricingDeposit: { evaluated: false, skipped: true },
    },
    ...overrides,
  };
}

describe('booking-wizard-eligibility.util', () => {
  it('builds stable preview fingerprints', () => {
    const gate = buildGateResult();
    const first = buildEligibilityPreviewFingerprint(gate);
    const second = buildEligibilityPreviewFingerprint({
      ...gate,
      sourceRuleIds: ['org:org-1'],
    });
    expect(first).toBe(second);
  });

  it('maps gatekeeper preview flags for confirm and pending', () => {
    const preview = mapGatekeeperToWizardPreview(buildGateResult(), 'CONFIRMED');
    expect(preview.isPreviewOnly).toBe(true);
    expect(preview.canConfirm).toBe(true);
    expect(preview.canCreatePending).toBe(true);
    expect(preview.previewFingerprint).toHaveLength(64);
  });

  it('throws RULES_CHANGED when preview fingerprint is stale', () => {
    const fresh = buildGateResult({
      status: 'NOT_ELIGIBLE',
      allowed: false,
      blockingReasons: [
        {
          code: 'MINIMUM_AGE_NOT_MET',
          domain: 'rental_rules',
          message: 'Too young',
        },
      ],
      reasonCodes: ['MINIMUM_AGE_NOT_MET'],
    });

    expect(() =>
      assertWizardPreviewFingerprintMatches('stale-fingerprint', fresh),
    ).toThrow(ConflictException);

    try {
      assertWizardPreviewFingerprintMatches('stale-fingerprint', fresh);
    } catch (error) {
      const response = (error as ConflictException).getResponse() as { code?: string };
      expect(response.code).toBe(BOOKING_ELIGIBILITY_TRANSITION_CODE.RULES_CHANGED);
    }
  });
});
