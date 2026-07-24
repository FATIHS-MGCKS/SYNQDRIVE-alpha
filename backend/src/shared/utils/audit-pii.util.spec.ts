import { scrubPiiJson, scrubPiiString } from './audit-pii.util';

describe('audit-pii.util', () => {
  it('redacts sensitive coordinate and token keys from metadata', () => {
    const scrubbed = scrubPiiJson({
      latitude: 51.1,
      longitude: 9.4,
      accessToken: 'secret',
      nested: { callbackUrl: 'https://example.com?token=abc' },
      safe: 'ok',
    });

    expect(scrubbed).toEqual({
      latitude: '[REDACTED]',
      longitude: '[REDACTED]',
      accessToken: '[REDACTED]',
      nested: { callbackUrl: '[REDACTED]' },
      safe: 'ok',
    });
  });

  it('redacts emails and long digit sequences in free text', () => {
    expect(scrubPiiString('Contact user@example.com with id 12345678901')).toBe(
      'Contact [email] with id [11-digit]',
    );
  });
});
