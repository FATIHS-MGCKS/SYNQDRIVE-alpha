import { describe, expect, it } from 'vitest';
import {
  mapBookingEligibilityConfirmError,
  wizardCheckoutCanProceed,
} from './booking-wizard-eligibility';
import type { BookingWizardEligibilityPreview } from './booking-wizard-eligibility.types';

const basePreview = (): BookingWizardEligibilityPreview => ({
  status: 'ELIGIBLE',
  allowed: true,
  stage: 'CONFIRM',
  targetStatus: 'CONFIRMED',
  blockingReasons: [],
  warnings: [],
  missingFields: [],
  previewFingerprint: 'abc',
  engineVersion: '1.0.0',
  evaluatedAt: '2026-07-01T10:00:00.000Z',
  isPreviewOnly: true,
  rentalEligibility: null,
  canConfirm: true,
  canCreatePending: true,
});

describe('booking-wizard-eligibility', () => {
  it('maps structured booking eligibility errors', () => {
    const mapped = mapBookingEligibilityConfirmError({
      response: {
        data: {
          code: 'BOOKING_ELIGIBILITY_RULES_CHANGED',
          message: 'changed',
        },
      },
    });
    expect(mapped.category).toBe('rules_changed');
    expect(mapped.title).toContain('geändert');
  });

  it('blocks checkout when manual approval override reason is missing', () => {
    const preview: BookingWizardEligibilityPreview = {
      ...basePreview(),
      status: 'MANUAL_APPROVAL_REQUIRED',
      canConfirm: true,
      blockingReasons: [{ code: 'RENTAL_MANUAL_APPROVAL_REQUIRED', domain: 'rental_rules', message: 'Approval needed' }],
    };

    expect(
      wizardCheckoutCanProceed({
        preview,
        loading: false,
        error: null,
        hasPrice: true,
        priceLoading: false,
        hasQuote: true,
        agbAccepted: true,
        privacyAccepted: true,
        draftReady: true,
        canOverrideEligibility: true,
        preferConfirmed: true,
      }),
    ).toBe(false);

    expect(
      wizardCheckoutCanProceed({
        preview,
        loading: false,
        error: null,
        hasPrice: true,
        priceLoading: false,
        hasQuote: true,
        agbAccepted: true,
        privacyAccepted: true,
        draftReady: true,
        eligibilityOverrideReason: 'Manager approved exception',
        canOverrideEligibility: true,
        preferConfirmed: true,
      }),
    ).toBe(true);
  });
});
