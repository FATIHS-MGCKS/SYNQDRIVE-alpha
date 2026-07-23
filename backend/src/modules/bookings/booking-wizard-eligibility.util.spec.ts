import { ConflictException } from '@nestjs/common';
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
