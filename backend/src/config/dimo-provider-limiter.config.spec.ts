import { resolveDimoProviderLimiterConfig } from './dimo-provider-limiter.config';
import { DimoProviderRequestPriority } from '@modules/dimo/provider/dimo-provider-limiter.types';

describe('dimo-provider-limiter.config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults to shadow mode with internal 20 req/s budget', () => {
    delete process.env.DIMO_PROVIDER_LIMITER_MODE;
    delete process.env.DIMO_PROVIDER_RATE_LIMIT_PER_SECOND;

    const config = resolveDimoProviderLimiterConfig(process.env);
    expect(config.mode).toBe('shadow');
    expect(config.enabled).toBe(true);
    expect(config.rateLimitPerSecond).toBe(20);
    expect(config.documentedCoreRatePerSecond).toBe(25);
  });

  it('treats invalid mode as shadow', () => {
    process.env.DIMO_PROVIDER_LIMITER_MODE = 'not-a-mode';
    expect(resolveDimoProviderLimiterConfig(process.env).mode).toBe('shadow');
  });

  it('disables limiter when mode=off', () => {
    process.env.DIMO_PROVIDER_LIMITER_MODE = 'off';
    const config = resolveDimoProviderLimiterConfig(process.env);
    expect(config.enabled).toBe(false);
  });

  it('clamps absurd numeric env values to defaults', () => {
    process.env.DIMO_PROVIDER_RATE_LIMIT_PER_SECOND = '-5';
    process.env.DIMO_PROVIDER_MAX_IN_FLIGHT = '99999';
    const config = resolveDimoProviderLimiterConfig(process.env);
    expect(config.rateLimitPerSecond).toBe(20);
    expect(config.maxInFlight).toBe(40);
  });

  it('parses S3 admission wait and cooldown settings', () => {
    process.env.DIMO_PROVIDER_MAX_WAIT_MS = '8000';
    process.env.DIMO_PROVIDER_RESERVED_HIGH_PRIORITY_SLOTS = '8';
    process.env.DIMO_PROVIDER_RETRY_AFTER_MAX_SECONDS = '90';
    const config = resolveDimoProviderLimiterConfig(process.env);
    expect(config.maxWaitMs).toBe(8000);
    expect(config.reservedHighPrioritySlots).toBe(8);
    expect(config.retryAfterMaxSeconds).toBe(90);
    expect(config.admissionPollMinMs).toBe(25);
    expect(config.maxWaitMsByPriority[DimoProviderRequestPriority.P0_CRITICAL]).toBe(16_000);
  });

  it('defaults to token_bucket rate algorithm (S4)', () => {
    delete process.env.DIMO_PROVIDER_RATE_ALGORITHM;
    expect(resolveDimoProviderLimiterConfig(process.env).rateAlgorithm).toBe('token_bucket');
  });

  it('parses canary org allowlist deterministically (S4)', () => {
    process.env.DIMO_PROVIDER_CANARY_ENFORCE_ORG_IDS = ' org-a , org-b ,';
    const config = resolveDimoProviderLimiterConfig(process.env);
    expect(config.canaryEnforceOrgIds.has('org-a')).toBe(true);
    expect(config.canaryEnforceOrgIds.has('org-b')).toBe(true);
    expect(config.canaryEnforceOrgIds.size).toBe(2);
  });

  it('parses S4 enforce canary env vars with safe defaults', () => {
    delete process.env.DIMO_PROVIDER_ENFORCE_CANARY_ENABLED;
    delete process.env.DIMO_PROVIDER_ENFORCE_CANARY_PERCENT;
    const config = resolveDimoProviderLimiterConfig(process.env);
    expect(config.enforceCanaryEnabled).toBe(false);
    expect(config.enforceCanaryPercent).toBe(0);
    expect(config.enforceCanaryVehicleIds.size).toBe(0);
  });

  it('parses enforce canary percent and vehicle allowlist', () => {
    process.env.DIMO_PROVIDER_ENFORCE_CANARY_ENABLED = 'true';
    process.env.DIMO_PROVIDER_ENFORCE_CANARY_PERCENT = '15';
    process.env.DIMO_PROVIDER_ENFORCE_CANARY_VEHICLE_IDS = ' veh-1 , veh-2 ';
    const config = resolveDimoProviderLimiterConfig(process.env);
    expect(config.enforceCanaryEnabled).toBe(true);
    expect(config.enforceCanaryPercent).toBe(15);
    expect(config.enforceCanaryVehicleIds.has('veh-1')).toBe(true);
    expect(config.enforceCanaryVehicleIds.has('veh-2')).toBe(true);
  });
});
