import {
  maskEmail,
  maskPhoneNumber,
  redactSensitiveCustomerFields,
  toBookingReference,
  toCustomerReference,
} from './voice-mcp-privacy.util';

describe('voice-mcp-privacy.util', () => {
  it('masks phone numbers by default', () => {
    expect(maskPhoneNumber('+491701234567')).toBe('***4567');
  });

  it('reveals phone numbers only for active call context', () => {
    expect(maskPhoneNumber('+491701234567', { revealForCall: true })).toBe('+491701234567');
  });

  it('creates short customer and booking references', () => {
    const id = '11111111-2222-3333-4444-555566667777';
    expect(toCustomerReference(id)).toHaveLength(8);
    expect(toBookingReference(id)).toHaveLength(8);
  });

  it('redacts license, id, and payment fields from customer payloads', () => {
    const redacted = redactSensitiveCustomerFields({
      id: 'cust-1',
      organizationId: 'org-1',
      firstName: 'Alex',
      lastName: 'Muster',
      phone: '+491701234567',
      email: 'alex@example.com',
      licenseNumber: 'B1234567',
      idNumber: 'T22000129',
      paymentCardLast4: '4242',
    });

    expect(redacted.licenseNumber).toBeUndefined();
    expect(redacted.idNumber).toBeUndefined();
    expect(redacted.paymentCardLast4).toBeUndefined();
    expect(redacted.customerRef).toBeTruthy();
    expect(redacted.phone).toBe('***4567');
    expect(maskEmail('alex@example.com')).toBe('al***@example.com');
  });
});
