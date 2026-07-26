import { BillingStripeMode } from '@prisma/client';
import {
  assertBillingStripeModeMatchesRuntime,
  assertStripeWebhookLivemodeMatchesRuntime,
  resolveStripeEnvironment,
  resolveStripeModeFromSecretKey,
  StripeEnvironmentViolationError,
  STRIPE_ENVIRONMENT_ERROR,
  validateStripeEnvironmentOrThrow,
} from './stripe-environment.util';

describe('stripe-environment.util', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('resolves TEST mode from sk_test secret key', () => {
    expect(resolveStripeModeFromSecretKey('sk_test_abc')).toBe(BillingStripeMode.TEST);
  });

  it('resolves LIVE mode from sk_live secret key', () => {
    expect(resolveStripeModeFromSecretKey('sk_live_abc')).toBe(BillingStripeMode.LIVE);
  });

  it('rejects test keys in production by default', () => {
    expect(() =>
      validateStripeEnvironmentOrThrow(
        resolveStripeEnvironment({
          nodeEnv: 'production',
          secretKey: 'sk_test_abc',
        }),
      ),
    ).toThrow(StripeEnvironmentViolationError);

    try {
      validateStripeEnvironmentOrThrow(
        resolveStripeEnvironment({
          nodeEnv: 'production',
          secretKey: 'sk_test_abc',
        }),
      );
    } catch (error) {
      expect((error as StripeEnvironmentViolationError).code).toBe(
        STRIPE_ENVIRONMENT_ERROR.TEST_KEY_IN_PRODUCTION,
      );
    }
  });

  it('allows test keys in production only with explicit override', () => {
    expect(() =>
      validateStripeEnvironmentOrThrow(
        resolveStripeEnvironment({
          nodeEnv: 'production',
          secretKey: 'sk_test_abc',
          allowTestInProduction: true,
        }),
      ),
    ).not.toThrow();
  });

  it('requires STRIPE_ENVIRONMENT to match secret key prefix', () => {
    try {
      validateStripeEnvironmentOrThrow(
        resolveStripeEnvironment({
          nodeEnv: 'development',
          secretKey: 'sk_test_abc',
          explicitEnvironment: 'live',
        }),
      );
      fail('expected StripeEnvironmentViolationError');
    } catch (error) {
      expect(error).toBeInstanceOf(StripeEnvironmentViolationError);
      expect((error as StripeEnvironmentViolationError).code).toBe(
        STRIPE_ENVIRONMENT_ERROR.EXPLICIT_ENV_MISMATCH,
      );
    }
  });

  it('accepts live keys in production', () => {
    expect(() =>
      validateStripeEnvironmentOrThrow(
        resolveStripeEnvironment({
          nodeEnv: 'production',
          secretKey: 'sk_live_abc',
          explicitEnvironment: 'live',
        }),
      ),
    ).not.toThrow();
  });

  it('rejects webhook livemode mismatch', () => {
    try {
      assertStripeWebhookLivemodeMatchesRuntime(true, BillingStripeMode.TEST);
      fail('expected StripeEnvironmentViolationError');
    } catch (error) {
      expect(error).toBeInstanceOf(StripeEnvironmentViolationError);
      expect((error as StripeEnvironmentViolationError).code).toBe(
        STRIPE_ENVIRONMENT_ERROR.WEBHOOK_LIVEMODE_MISMATCH,
      );
    }
  });

  it('rejects catalog mapping mode mismatch', () => {
    try {
      assertBillingStripeModeMatchesRuntime(BillingStripeMode.LIVE, BillingStripeMode.TEST);
      fail('expected StripeEnvironmentViolationError');
    } catch (error) {
      expect(error).toBeInstanceOf(StripeEnvironmentViolationError);
      expect((error as StripeEnvironmentViolationError).code).toBe(
        STRIPE_ENVIRONMENT_ERROR.RESOURCE_MODE_MISMATCH,
      );
    }
  });
});
