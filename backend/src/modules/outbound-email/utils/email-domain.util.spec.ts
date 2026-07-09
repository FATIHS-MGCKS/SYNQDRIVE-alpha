import { emailBelongsToDomain, normalizeDomain } from '../utils/email-domain.util';

describe('email-domain.util', () => {
  it('normalizes domain input', () => {
    expect(normalizeDomain(' HTTPS://Mail.Acme.Test/ ')).toBe('mail.acme.test');
  });

  it('accepts emails on verified domain and subdomains', () => {
    expect(emailBelongsToDomain('noreply@acme.test', 'acme.test')).toBe(true);
    expect(emailBelongsToDomain('alerts@mail.acme.test', 'acme.test')).toBe(true);
  });

  it('rejects foreign domains', () => {
    expect(emailBelongsToDomain('admin@evil.test', 'acme.test')).toBe(false);
  });
});
