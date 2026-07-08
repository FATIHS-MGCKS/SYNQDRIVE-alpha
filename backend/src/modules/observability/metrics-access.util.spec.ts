import type { MetricsConfigShape } from '@config/metrics.config';
import {
  evaluateMetricsAccess,
  extractMetricsBearerToken,
  resolveMetricsClientIp,
} from './metrics-access.util';

const baseConfig = (): MetricsConfigShape => ({
  enabled: true,
  requireToken: false,
  token: null,
  allowedIps: [],
});

describe('metrics-access.util', () => {
  describe('resolveMetricsClientIp', () => {
    it('prefers the first X-Forwarded-For hop', () => {
      expect(
        resolveMetricsClientIp({
          xForwardedFor: '203.0.113.10, 10.0.0.1',
          remoteAddress: '127.0.0.1',
        }),
      ).toBe('203.0.113.10');
    });

    it('falls back to remoteAddress', () => {
      expect(
        resolveMetricsClientIp({ remoteAddress: '127.0.0.1' }),
      ).toBe('127.0.0.1');
    });
  });

  describe('extractMetricsBearerToken', () => {
    it('parses Bearer tokens case-insensitively', () => {
      expect(extractMetricsBearerToken('Bearer secret-token')).toBe(
        'secret-token',
      );
    });
  });

  describe('evaluateMetricsAccess', () => {
    it('returns 404 when metrics are disabled', () => {
      const decision = evaluateMetricsAccess(
        { ...baseConfig(), enabled: false },
        { clientIp: '127.0.0.1' },
      );
      expect(decision).toEqual({
        allowed: false,
        statusCode: 404,
        reason: 'metrics_disabled',
      });
    });

    it('allows open access in dev when token is not required', () => {
      const decision = evaluateMetricsAccess(baseConfig(), {
        clientIp: '127.0.0.1',
      });
      expect(decision).toEqual({ allowed: true });
    });

    it('blocks when token is required but missing', () => {
      const decision = evaluateMetricsAccess(
        { ...baseConfig(), requireToken: true, token: 'scrape-secret' },
        { clientIp: '127.0.0.1' },
      );
      expect(decision).toEqual({
        allowed: false,
        statusCode: 403,
        reason: 'invalid_or_missing_token',
      });
    });

    it('allows when token is required and Bearer matches', () => {
      const decision = evaluateMetricsAccess(
        { ...baseConfig(), requireToken: true, token: 'scrape-secret' },
        {
          clientIp: '127.0.0.1',
          authorizationHeader: 'Bearer scrape-secret',
        },
      );
      expect(decision).toEqual({ allowed: true });
    });

    it('allows when token is required and X-Metrics-Token matches', () => {
      const decision = evaluateMetricsAccess(
        { ...baseConfig(), requireToken: true, token: 'scrape-secret' },
        {
          clientIp: '127.0.0.1',
          metricsTokenHeader: 'scrape-secret',
        },
      );
      expect(decision).toEqual({ allowed: true });
    });

    it('fail-closes when token is required but server token is unset', () => {
      const decision = evaluateMetricsAccess(
        { ...baseConfig(), requireToken: true, token: null },
        {
          clientIp: '127.0.0.1',
          authorizationHeader: 'Bearer anything',
        },
      );
      expect(decision).toEqual({
        allowed: false,
        statusCode: 403,
        reason: 'token_required_but_not_configured',
      });
    });

    it('blocks clients outside the IP allowlist', () => {
      const decision = evaluateMetricsAccess(
        { ...baseConfig(), allowedIps: ['127.0.0.1'] },
        { clientIp: '203.0.113.55' },
      );
      expect(decision).toEqual({
        allowed: false,
        statusCode: 403,
        reason: 'ip_not_allowed',
      });
    });

    it('allows clients on the IP allowlist without token when token not required', () => {
      const decision = evaluateMetricsAccess(
        { ...baseConfig(), allowedIps: ['127.0.0.1', '::1'] },
        { clientIp: '127.0.0.1' },
      );
      expect(decision).toEqual({ allowed: true });
    });
  });
});
