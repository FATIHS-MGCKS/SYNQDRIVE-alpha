import {
  mapElevenLabsSdkError,
  toHttpSafeElevenLabsMessage,
} from './elevenlabs-provider-error.mapper';
import {
  ElevenLabsProviderErrorCode,
  ElevenLabsRateLimitedError,
  ElevenLabsUnauthorizedError,
} from './elevenlabs-provider.errors';

describe('elevenlabs-provider-error.mapper', () => {
  it('maps unauthorized provider responses', () => {
    const err = mapElevenLabsSdkError({ status: 401, message: 'Invalid API key' });
    expect(err).toBeInstanceOf(ElevenLabsUnauthorizedError);
    expect(err.code).toBe(ElevenLabsProviderErrorCode.UNAUTHORIZED);
  });

  it('maps rate limited provider responses', () => {
    const err = mapElevenLabsSdkError({ status: 429, message: 'Too Many Requests' });
    expect(err).toBeInstanceOf(ElevenLabsRateLimitedError);
  });

  it('redacts secret-like values from HTTP-safe messages', () => {
    const sanitized = toHttpSafeElevenLabsMessage(
      new ElevenLabsUnauthorizedError('xi-api-key: sk_live_secret_value agent_abcdefghijklmnop'),
    );
    expect(sanitized).toContain('xi-api-key=[REDACTED]');
    expect(sanitized).not.toContain('sk_live_secret_value');
    expect(sanitized).not.toContain('abcdefghijklmnop');
  });
});
