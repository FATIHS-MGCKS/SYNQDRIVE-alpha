import {
  normalizeVerificationStatus,
  resolveDocumentEligibilityStatus,
} from './customer-verification-status.util';

describe('customer-verification-status.util', () => {
  it('maps NOT_SUBMITTED with submission to pickup_required when confirm not required', () => {
    const status = normalizeVerificationStatus('NOT_SUBMITTED', {
      requireForConfirm: false,
      requireForPickup: true,
      hasAnySubmission: true,
    });
    expect(status).toBe('pickup_required');
  });

  it('resolveDocumentEligibilityStatus returns pickup_required without inflight check', () => {
    const result = resolveDocumentEligibilityStatus(
      'ID_DOCUMENT',
      null,
      'NOT_SUBMITTED',
      {
        requireForConfirm: false,
        requireForPickup: true,
        hasAnySubmission: true,
      },
    );
    expect(result).toBe('pickup_required');
  });
});
