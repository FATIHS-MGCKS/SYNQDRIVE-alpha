import { maskEmail, maskPhone, sanitizePreviewRecord } from './workflow-preview.util';

describe('workflow-preview.util', () => {
  it('masks email addresses', () => {
    expect(maskEmail('alice@example.com')).toBe('a***@e***.com');
  });

  it('masks phone numbers in strings', () => {
    expect(maskPhone('+49 170 1234567')).toBe('***67');
  });

  it('strips secret-like keys from preview records', () => {
    const out = sanitizePreviewRecord({
      title: 'Hello',
      apiKey: 'super-secret',
      nested: { bearerToken: 'x', note: 'ok' },
    });
    expect(out).toEqual({ title: 'Hello', nested: { note: 'ok' } });
  });
});
