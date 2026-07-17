import {
  mapTwilioSdkError,
  sanitizeTwilioLogMessage,
} from './twilio-provider-error.mapper';
import {
  TwilioProviderErrorCode,
  TwilioRateLimitedError,
  TwilioUnauthorizedError,
} from './twilio-provider.errors';

describe('twilio-provider-error.mapper', () => {
  it('maps unauthorized provider responses', () => {
    const err = mapTwilioSdkError({ status: 401, message: 'Authentication Error' });
    expect(err).toBeInstanceOf(TwilioUnauthorizedError);
    expect(err.code).toBe(TwilioProviderErrorCode.UNAUTHORIZED);
  });

  it('maps rate limited provider responses', () => {
    const err = mapTwilioSdkError({ status: 429, message: 'Too Many Requests' });
    expect(err).toBeInstanceOf(TwilioRateLimitedError);
  });

  it('redacts secret-like values from log messages', () => {
    const sanitized = sanitizeTwilioLogMessage('failed apiKeySecret=abc123 token=xyz');
    expect(sanitized).toContain('apiKeySecret=[REDACTED]');
    expect(sanitized).not.toContain('abc123');
  });
});
