import {
  computeExponentialBackoffMs,
  isNonRetryableDimoHttpError,
  isRetryableDimoHttpError,
  parseRetryAfterMs,
  readRetryAfterMsFromError,
} from './dimo-http-error.util';

describe('dimo-http-error.util', () => {
  describe('parseRetryAfterMs', () => {
    it('parses Retry-After seconds', () => {
      expect(parseRetryAfterMs('30', 120_000)).toBe(30_000);
    });

    it('parses Retry-After HTTP date', () => {
      const now = Date.parse('2026-08-29T12:00:00.000Z');
      const header = 'Wed, 29 Aug 2026 12:00:30 GMT';
      expect(parseRetryAfterMs(header, 120_000, now)).toBe(30_000);
    });

    it('caps malformed Retry-After', () => {
      expect(parseRetryAfterMs('not-a-date', 5_000)).toBe(1_000);
    });
  });

  describe('readRetryAfterMsFromError', () => {
    it('reads axios Retry-After header on 429', () => {
      const err = {
        response: { status: 429, headers: { 'retry-after': '12' } },
      };
      expect(readRetryAfterMsFromError(err, 60_000)).toBe(12_000);
    });
  });

  describe('retry classification', () => {
    it('429 is retryable', () => {
      expect(isRetryableDimoHttpError({ response: { status: 429 } })).toBe(true);
    });

    it('5xx is retryable', () => {
      expect(isRetryableDimoHttpError({ response: { status: 503 } })).toBe(true);
    });

    it('timeout is retryable', () => {
      expect(isRetryableDimoHttpError({ code: 'ETIMEDOUT' })).toBe(true);
    });

    it('4xx (non-429) is non-retryable', () => {
      expect(isNonRetryableDimoHttpError({ response: { status: 400 } })).toBe(true);
    });
  });

  describe('computeExponentialBackoffMs', () => {
    it('grows with attempt', () => {
      expect(computeExponentialBackoffMs(0, 500)).toBeGreaterThanOrEqual(500);
      expect(computeExponentialBackoffMs(2, 500)).toBeGreaterThanOrEqual(2_000);
    });
  });
});
