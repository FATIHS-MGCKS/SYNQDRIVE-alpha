import {
  TwilioInvalidConfigurationError,
  TwilioProviderError,
  TwilioProviderUnavailableError,
  TwilioRateLimitedError,
  TwilioResourceNotFoundError,
  TwilioUnauthorizedError,
} from './twilio-provider.errors';

type TwilioSdkErrorShape = {
  status?: number;
  code?: number | string;
  message?: string;
};

export function mapTwilioSdkError(err: unknown): TwilioProviderError {
  if (err instanceof TwilioProviderError) {
    return err;
  }

  const shaped: TwilioSdkErrorShape =
    err && typeof err === 'object'
      ? (err as TwilioSdkErrorShape)
      : { message: err instanceof Error ? err.message : 'Unknown Twilio error' };

  const status = shaped.status;
  const message = shaped.message?.trim() || 'Twilio provider request failed.';

  if (status === 401 || status === 403) {
    return new TwilioUnauthorizedError(message);
  }
  if (status === 404) {
    return new TwilioResourceNotFoundError(message);
  }
  if (status === 429) {
    return new TwilioRateLimitedError(message);
  }
  if (status !== undefined && status >= 500) {
    return new TwilioProviderUnavailableError(message);
  }

  return new TwilioProviderUnavailableError(message);
}

export function sanitizeTwilioLogMessage(message: string): string {
  return message
    .replace(/apiKeySecret[=:]\s*['"]?[\w-]+['"]?/gi, 'apiKeySecret=[REDACTED]')
    .replace(/authToken[=:]\s*['"]?[\w-]+['"]?/gi, 'authToken=[REDACTED]')
    .replace(/SK[0-9a-fA-F]{32}/g, 'SK[REDACTED]')
    .replace(/AC[0-9a-fA-F]{32}/g, (match, offset, whole) =>
      offset > 0 && whole[offset - 1] === '*' ? match : 'AC[REDACTED]',
    );
}

export function toHttpSafeProviderMessage(err: TwilioProviderError): string {
  return sanitizeTwilioLogMessage(err.message);
}

export function assertValidTwilioCredentialShape(
  value: unknown,
): asserts value is { accountSid: string; apiKeySid: string; apiKeySecret: string } {
  if (!value || typeof value !== 'object') {
    throw new TwilioInvalidConfigurationError('Resolved secret is not an object.');
  }
  const record = value as Record<string, unknown>;
  for (const key of ['accountSid', 'apiKeySid', 'apiKeySecret'] as const) {
    if (typeof record[key] !== 'string' || !record[key]?.trim()) {
      throw new TwilioInvalidConfigurationError(`Resolved secret is missing field: ${key}`);
    }
  }
}
