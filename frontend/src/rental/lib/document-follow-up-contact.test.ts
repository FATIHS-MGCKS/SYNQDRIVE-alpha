import { describe, expect, it } from 'vitest';
import { isContactPrepareSuggestionType } from './document-follow-up-contact';

describe('document-follow-up-contact', () => {
  it('identifies contact-prepare suggestion types', () => {
    expect(isContactPrepareSuggestionType('PREPARE_CUSTOMER_CONTACT')).toBe(true);
    expect(isContactPrepareSuggestionType('PREPARE_DRIVER_CONTACT')).toBe(true);
    expect(isContactPrepareSuggestionType('PAYMENT_REVIEW')).toBe(true);
    expect(isContactPrepareSuggestionType('INSURANCE_REVIEW')).toBe(true);
    expect(isContactPrepareSuggestionType('VEHICLE_INSPECTION')).toBe(false);
  });
});
