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
});
