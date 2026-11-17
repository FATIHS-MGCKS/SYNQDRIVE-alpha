import {
  assertCoreAppM2mRateLimitConfigConsistent,
  isCoreAppM2mRateLimitEnabled,
  resolveCoreAppM2mRateLimitMaxPerClient,
  resolveCoreAppM2mRateLimitMaxPerIp,
  resolveCoreAppM2mRateLimitWindowMs,
} from './core-app-m2m-rate-limit.config';

describe('core-app-m2m-rate-limit.config', () => {
  it('defaults rate limiting to enabled with conservative limits', () => {
    expect(isCoreAppM2mRateLimitEnabled({})).toBe(true);
    expect(resolveCoreAppM2mRateLimitWindowMs({})).toBe(60_000);
    expect(resolveCoreAppM2mRateLimitMaxPerIp({})).toBe(30);
    expect(resolveCoreAppM2mRateLimitMaxPerClient({})).toBe(20);
  });

  it('rejects disabling rate limits while M2M runtime is enabled', () => {
    expect(() =>
      assertCoreAppM2mRateLimitConfigConsistent({
        CORE_APP_M2M_ENABLED: 'true',
        CORE_APP_M2M_RATE_LIMIT_ENABLED: 'false',
      }),
    ).toThrow(/CORE_APP_M2M_RATE_LIMIT_ENABLED cannot be false/);
  });
});