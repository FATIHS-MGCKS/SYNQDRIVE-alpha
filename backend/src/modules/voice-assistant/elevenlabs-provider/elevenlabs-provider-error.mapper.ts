import {
  ElevenLabsInvalidConfigurationError,
  ElevenLabsProviderConflictError,
  ElevenLabsProviderError,
  ElevenLabsProviderUnavailableError,
  ElevenLabsRateLimitedError,
  ElevenLabsResourceNotFoundError,
  ElevenLabsUnauthorizedError,
  ElevenLabsUnsupportedFeatureError,
} from './elevenlabs-provider.errors';
import { sanitizeElevenLabsLogMessage } from './elevenlabs-provider.redaction';

type ElevenLabsSdkErrorShape = {
  status?: number;
  message?: string;
};

export function mapElevenLabsSdkError(err: unknown): ElevenLabsProviderError {
  if (err instanceof ElevenLabsProviderError) {
    return err;
  }

  const shaped: ElevenLabsSdkErrorShape =
    err && typeof err === 'object'
      ? (err as ElevenLabsSdkErrorShape)
      : { message: err instanceof Error ? err.message : 'Unknown ElevenLabs error' };

  const status = shaped.status;
  const message = shaped.message?.trim() || 'ElevenLabs provider request failed.';

  if (status === 401 || status === 403) {
    return new ElevenLabsUnauthorizedError(message);
  }
  if (status === 404) {
    return new ElevenLabsResourceNotFoundError(message);
  }
  if (status === 409) {
    return new ElevenLabsProviderConflictError(message);
  }
  if (status === 422) {
    return new ElevenLabsInvalidConfigurationError(message);
  }
  if (status === 429) {
    return new ElevenLabsRateLimitedError(message);
  }
  if (status === 501 || status === 405) {
    return new ElevenLabsUnsupportedFeatureError(message);
  }
  if (status !== undefined && status >= 500) {
    return new ElevenLabsProviderUnavailableError(message);
  }

  return new ElevenLabsProviderUnavailableError(message);
}

export function toHttpSafeElevenLabsMessage(err: ElevenLabsProviderError): string {
  return sanitizeElevenLabsLogMessage(err.message);
}
