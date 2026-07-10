import { MistralError } from '@mistralai/mistralai/models/errors/mistralerror.js';
import { RequestTimeoutError } from '@mistralai/mistralai/models/errors/httpclienterrors.js';
import { mapMistralOcrProviderError } from './mistral-ocr-error.mapper';
import { MISTRAL_OCR_ERROR_CODES } from './mistral-ocr.errors';

function makeMistralHttpError(statusCode: number, message: string): MistralError {
  const response = new Response(message, { status: statusCode });
  return new MistralError(message, {
    response,
    request: new Request('https://api.mistral.ai/v1/ocr'),
    body: message,
  });
}

describe('mapMistralOcrProviderError', () => {
  it('maps timeout errors as retryable OCR_TIMEOUT', () => {
    const mapped = mapMistralOcrProviderError(new RequestTimeoutError('timed out'));
    expect(mapped.code).toBe(MISTRAL_OCR_ERROR_CODES.OCR_TIMEOUT);
    expect(mapped.retryable).toBe(true);
    expect(mapped.stage).toBe('OCR');
  });

  it('maps 429 as retryable OCR_RATE_LIMITED', () => {
    const mapped = mapMistralOcrProviderError(makeMistralHttpError(429, 'rate limit'));
    expect(mapped.code).toBe(MISTRAL_OCR_ERROR_CODES.OCR_RATE_LIMITED);
    expect(mapped.retryable).toBe(true);
  });

  it('maps 500/503 as retryable OCR_PROVIDER_UNAVAILABLE', () => {
    expect(mapMistralOcrProviderError(makeMistralHttpError(500, 'server')).code).toBe(
      MISTRAL_OCR_ERROR_CODES.OCR_PROVIDER_UNAVAILABLE,
    );
    expect(mapMistralOcrProviderError(makeMistralHttpError(503, 'unavailable')).retryable).toBe(
      true,
    );
  });

  it('maps auth failures as non-retryable OCR_AUTHENTICATION_FAILED', () => {
    const mapped = mapMistralOcrProviderError(makeMistralHttpError(401, 'unauthorized'));
    expect(mapped.code).toBe(MISTRAL_OCR_ERROR_CODES.OCR_AUTHENTICATION_FAILED);
    expect(mapped.retryable).toBe(false);
  });
});
