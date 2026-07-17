import {
  maskExternalId,
  redactProviderPayload,
  sanitizeElevenLabsLogMessage,
} from './elevenlabs-provider.redaction';

describe('elevenlabs-provider.redaction', () => {
  it('masks external identifiers for client-safe views', () => {
    expect(maskExternalId('agent_abcdefghijklmnop', 'agent')).toBe('agen***mnop');
  });

  it('redacts secrets and ids from provider payloads', () => {
    const redacted = redactProviderPayload({
      agent_id: 'agent_abcdefghijklmnop',
      token: 'twilio-secret-token',
      signed_url: 'https://example.test/signed',
      phone_number_id: 'phnum_abcdefghijklmnop',
    });

    expect(redacted.token).toBe('[REDACTED]');
    expect(redacted.signed_url).toBe('[REDACTED]');
    expect(String(redacted.agent_id)).not.toContain('abcdefghijklmnop');
    expect(String(redacted.phone_number_id)).not.toContain('abcdefghijklmnop');
  });

  it('sanitizes log messages', () => {
    const sanitized = sanitizeElevenLabsLogMessage(
      "failed xi-api-key: sk_test_123 agent_abcdefghijklmnop phnum_abcdefghijklmnop",
    );
    expect(sanitized).toContain('xi-api-key=[REDACTED]');
    expect(sanitized).toContain('agent_[REDACTED]');
    expect(sanitized).not.toContain('sk_test_123');
  });
});
