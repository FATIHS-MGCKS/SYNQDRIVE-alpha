import { ConflictException } from '@nestjs/common';
import type { EffectiveRentalRequirement } from '@modules/rental-rules/rental-rules.types';
import { createActiveRentalRulesActivationSnapshot } from '@modules/rental-rules/rental-rules-activation.policy';
import type { BookingEligibilityGateResult } from './booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.types';
import {
  assertWizardPreviewFingerprintMatches,
  buildEligibilityPreviewFingerprint,
  mapGatekeeperToWizardPreview,
} from './booking-wizard-eligibility.util';
import { BOOKING_ELIGIBILITY_TRANSITION_CODE } from './booking-eligibility-gatekeeper/booking-eligibility-transition.policy';

import { testGateResult } from './booking-eligibility-gatekeeper/booking-eligibility-test.fixtures';

function buildGateResult(
  overrides: Parameters<typeof testGateResult>[0] = {},
) {
  return testGateResult({
    bookingId: 'booking-1',
    sourceRuleIds: ['org:org-1'],
    evaluatedAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  });
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

  it('changes preview fingerprint when effective rental rule values change but status stays eligible', () => {
    const layer = { source: 'ORGANIZATION_DEFAULT' as const, sourceName: 'Org' };
    const effectiveRules = {
      organizationId: 'org-1',
      vehicleId: 'vehicle-1',
      rentalCategoryId: null,
      rentalCategoryName: null,
      rentalCategoryType: null,
      rulesActive: true,
      activation: createActiveRentalRulesActivationSnapshot(),
      minimumAgeYears: { value: 18, ...layer },
      minimumLicenseHoldingMonths: { value: 0, ...layer },
      depositAmountCents: { value: 50_000, ...layer },
      depositAmount: { value: 50_000, ...layer },
      depositCurrency: { value: 'EUR', ...layer },
      creditCardRequired: { value: false, ...layer },
      foreignTravelPolicy: { value: 'ALLOWED' as const, ...layer },
      additionalDriverPolicy: { value: 'ALLOWED' as const, ...layer },
      youngDriverPolicy: { value: 'ALLOWED' as const, ...layer },
      insuranceRequirement: { value: null, source: null, sourceName: null },
      manualApprovalRequired: { value: false, ...layer },
      notes: { value: null, source: null, sourceName: null },
      minimumLicenseHoldingYears: { value: 0, ...layer },
      minimumLicenseHoldingRemainderMonths: { value: 0, ...layer },
    } satisfies EffectiveRentalRequirement;

    const base = buildGateResult({
      domains: {
        customer: { evaluated: true, canProceedForStage: true, result: null },
        verification: { evaluated: true, result: null },
        rentalRules: {
          evaluated: true,
          result: {
            status: 'ELIGIBLE',
            blockingReasons: [],
            warningReasons: [],
            missingFields: [],
            manualApprovalReasons: [],
            effectiveRules,
            decisionSource: 'RENTAL_RULES_EFFECTIVE',
            facts: [],
            customerId: 'cust-1',
            vehicleId: 'vehicle-1',
          },
        },
        vehicle: { evaluated: true, vehicleFound: true, vehicleId: 'vehicle-1' },
        vehicleReadiness: { evaluated: false, skipped: true, blocked: false },
        pricingDeposit: { evaluated: false, skipped: true },
      },
    });

    const aged = buildEligibilityPreviewFingerprint(base);
    const updated = buildEligibilityPreviewFingerprint({
      ...base,
      domains: {
        ...base.domains,
        rentalRules: {
          ...base.domains.rentalRules,
          result: {
            ...base.domains.rentalRules.result!,
            effectiveRules: {
              ...effectiveRules,
              minimumAgeYears: { value: 19, ...layer },
            },
          },
        },
      },
    });
    expect(updated).not.toBe(aged);
  });

  it('maps gatekeeper preview flags for confirm and pending', () => {
    const preview = mapGatekeeperToWizardPreview(buildGateResult(), 'CONFIRMED');
    expect(preview.isPreviewOnly).toBe(true);
    expect(preview.canConfirm).toBe(true);
    expect(preview.canCreatePending).toBe(true);
    expect(preview.previewFingerprint).toHaveLength(64);
  });

  it('requires validated approval for manual approval confirm preview', () => {
    const preview = mapGatekeeperToWizardPreview(
      buildGateResult({ status: 'MANUAL_APPROVAL_REQUIRED', allowed: false }),
      'CONFIRMED',
    );
    expect(preview.canConfirm).toBe(false);
    const withApproval = mapGatekeeperToWizardPreview(
      buildGateResult({ status: 'MANUAL_APPROVAL_REQUIRED', allowed: false }),
      'CONFIRMED',
      {
        validatedApproval: {
          id: 'approval-1',
          status: 'APPROVED',
          eligibilityFingerprint: 'fp',
          ruleRevision: 'rev',
          bookingDataVersion: 'data',
          targetBookingStatus: 'CONFIRMED',
          gateStage: 'CONFIRM',
        },
      },
    );
    expect(withApproval.canConfirm).toBe(true);
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
