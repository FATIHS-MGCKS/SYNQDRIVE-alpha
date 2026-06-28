import { describe, expect, it } from 'vitest';
import {
  BILLING_ORG_MISSING_MESSAGE,
  BILLING_PERMISSION_DENIED_MESSAGE,
  mapBillingLoadError,
} from './billing-load.utils';

describe('mapBillingLoadError', () => {
  it('maps organization context errors to tenant-friendly copy', () => {
    expect(mapBillingLoadError(new Error('Organization context required'))).toBe(
      BILLING_ORG_MISSING_MESSAGE,
    );
    expect(mapBillingLoadError(new Error('No organization context in token'))).toBe(
      BILLING_ORG_MISSING_MESSAGE,
    );
  });

  it('maps permission and access errors', () => {
    expect(mapBillingLoadError(new Error('Missing permission: billing.read'))).toBe(
      BILLING_PERMISSION_DENIED_MESSAGE,
    );
    expect(
      mapBillingLoadError(new Error('You do not have access to this organization')),
    ).toBe(BILLING_PERMISSION_DENIED_MESSAGE);
  });

  it('maps generic API and network errors to friendly copy', () => {
    expect(mapBillingLoadError(new Error('Network timeout'))).toBe(
      'Abrechnungsdaten konnten nicht geladen werden. Bitte später erneut versuchen.',
    );
    expect(mapBillingLoadError(new Error('API error 500'))).toBe(
      'Abrechnungsdaten konnten nicht geladen werden. Bitte später erneut versuchen.',
    );
  });

  it('passes through unknown specific errors', () => {
    expect(mapBillingLoadError(new Error('Custom billing validation failed'))).toBe(
      'Custom billing validation failed',
    );
  });
});
