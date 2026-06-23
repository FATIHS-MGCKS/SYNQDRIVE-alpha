import { normalizePhoneNumber } from './whatsapp-phone.util';

describe('normalizePhoneNumber', () => {
  it('strips formatting and keeps country code', () => {
    expect(normalizePhoneNumber('+49 170 1234567')).toBe('491701234567');
  });

  it('converts DE national leading zero conservatively', () => {
    expect(normalizePhoneNumber('01701234567')).toBe('491701234567');
  });

  it('returns null for empty input', () => {
    expect(normalizePhoneNumber('')).toBeNull();
  });
});
