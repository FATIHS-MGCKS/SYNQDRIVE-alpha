import { mapResendOperatorError } from './resend-error.util';

describe('mapResendOperatorError', () => {
  it('maps sending-only API key restriction to German operator message', () => {
    const msg = mapResendOperatorError('This API key is restricted to only send emails');
    expect(msg).toContain('Full access');
    expect(msg).toContain('RESEND_API_KEY');
  });

  it('passes through unknown errors', () => {
    expect(mapResendOperatorError('Domain already exists')).toBe('Domain already exists');
  });

  it('returns fallback for empty input', () => {
    expect(mapResendOperatorError(undefined)).toBe('Resend-Anfrage fehlgeschlagen');
  });
});
