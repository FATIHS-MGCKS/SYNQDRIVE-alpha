import { BillingStripeMode } from '@prisma/client';

export const StripeRuntimeEnvironment = {
  TEST: 'TEST',
  LIVE: 'LIVE',
  UNCONFIGURED: 'UNCONFIGURED',
} as const;

export type StripeRuntimeEnvironment =
  (typeof StripeRuntimeEnvironment)[keyof typeof StripeRuntimeEnvironment];

export const STRIPE_ENVIRONMENT_ERROR = {
  TEST_KEY_IN_PRODUCTION: 'STRIPE_TEST_KEY_IN_PRODUCTION',
  EXPLICIT_ENV_MISMATCH: 'STRIPE_EXPLICIT_ENV_MISMATCH',
  LIVE_KEY_REQUIRED_IN_PRODUCTION: 'STRIPE_LIVE_KEY_REQUIRED_IN_PRODUCTION',
  WEBHOOK_LIVEMODE_MISMATCH: 'STRIPE_WEBHOOK_LIVEMODE_MISMATCH',
  RESOURCE_MODE_MISMATCH: 'STRIPE_RESOURCE_MODE_MISMATCH',
} as const;

export interface StripeEnvironmentInput {
  nodeEnv?: string;
  secretKey?: string | null;
  explicitEnvironment?: string | null;
  allowTestInProduction?: boolean;
}

export interface ResolvedStripeEnvironment {
  runtimeEnvironment: StripeRuntimeEnvironment;
  billingStripeMode: BillingStripeMode | null;
  nodeEnv: string;
  secretKey: string;
  explicitEnvironment: StripeRuntimeEnvironment | null;
  allowTestInProduction: boolean;
  isProductionNode: boolean;
  configured: boolean;
}

function normalizeExplicitEnvironment(
  raw: string | null | undefined,
): StripeRuntimeEnvironment | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  if (value === 'test' || value === 'testing') return StripeRuntimeEnvironment.TEST;
  if (value === 'live' || value === 'production' || value === 'prod') {
    return StripeRuntimeEnvironment.LIVE;
  }
  return null;
}

export function resolveStripeModeFromSecretKey(
  secretKey: string | undefined | null,
): BillingStripeMode | null {
  const key = secretKey?.trim() ?? '';
  if (key.startsWith('sk_test_')) return BillingStripeMode.TEST;
  if (key.startsWith('sk_live_')) return BillingStripeMode.LIVE;
  return null;
}

export function stripeLivemodeToBillingMode(livemode: boolean): BillingStripeMode {
  return livemode ? BillingStripeMode.LIVE : BillingStripeMode.TEST;
}

export function billingStripeModeToRuntimeEnvironment(
  mode: BillingStripeMode,
): StripeRuntimeEnvironment {
  return mode === BillingStripeMode.LIVE
    ? StripeRuntimeEnvironment.LIVE
    : StripeRuntimeEnvironment.TEST;
}

export function resolveStripeEnvironment(
  input: StripeEnvironmentInput = {},
): ResolvedStripeEnvironment {
  const nodeEnv = input.nodeEnv?.trim() || process.env.NODE_ENV || 'development';
  const secretKey = input.secretKey?.trim() ?? process.env.STRIPE_SECRET_KEY?.trim() ?? '';
  const explicitEnvironment = normalizeExplicitEnvironment(
    input.explicitEnvironment ?? process.env.STRIPE_ENVIRONMENT,
  );
  const allowTestInProduction =
    input.allowTestInProduction ??
    process.env.STRIPE_ALLOW_TEST_IN_PRODUCTION?.trim().toLowerCase() === 'true';

  const billingStripeMode = resolveStripeModeFromSecretKey(secretKey);
  const runtimeEnvironment = billingStripeMode
    ? billingStripeModeToRuntimeEnvironment(billingStripeMode)
    : StripeRuntimeEnvironment.UNCONFIGURED;

  return {
    runtimeEnvironment,
    billingStripeMode,
    nodeEnv,
    secretKey,
    explicitEnvironment,
    allowTestInProduction,
    isProductionNode: nodeEnv === 'production',
    configured: Boolean(secretKey),
  };
}

export class StripeEnvironmentViolationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'StripeEnvironmentViolationError';
    this.code = code;
  }
}

/**
 * Fail-fast guard for process startup and runtime Stripe operations.
 * Ensures production never runs with test keys unless explicitly overridden.
 */
export function validateStripeEnvironmentOrThrow(
  env: ResolvedStripeEnvironment = resolveStripeEnvironment(),
): ResolvedStripeEnvironment {
  if (!env.configured) {
    return env;
  }

  if (!env.billingStripeMode) {
    throw new StripeEnvironmentViolationError(
      STRIPE_ENVIRONMENT_ERROR.LIVE_KEY_REQUIRED_IN_PRODUCTION,
      'STRIPE_SECRET_KEY must start with sk_test_ or sk_live_',
    );
  }

  if (env.explicitEnvironment && env.explicitEnvironment !== env.runtimeEnvironment) {
    throw new StripeEnvironmentViolationError(
      STRIPE_ENVIRONMENT_ERROR.EXPLICIT_ENV_MISMATCH,
      `STRIPE_ENVIRONMENT=${env.explicitEnvironment} does not match STRIPE_SECRET_KEY mode (${env.runtimeEnvironment})`,
    );
  }

  if (
    env.isProductionNode &&
    env.runtimeEnvironment === StripeRuntimeEnvironment.TEST &&
    !env.allowTestInProduction
  ) {
    throw new StripeEnvironmentViolationError(
      STRIPE_ENVIRONMENT_ERROR.TEST_KEY_IN_PRODUCTION,
      'Production refuses sk_test_* Stripe keys. Use sk_live_* or set STRIPE_ALLOW_TEST_IN_PRODUCTION=true only in non-prod sandboxes.',
    );
  }

  if (
    env.isProductionNode &&
    env.runtimeEnvironment !== StripeRuntimeEnvironment.LIVE &&
    !env.allowTestInProduction
  ) {
    throw new StripeEnvironmentViolationError(
      STRIPE_ENVIRONMENT_ERROR.LIVE_KEY_REQUIRED_IN_PRODUCTION,
      'Production requires Stripe LIVE mode (sk_live_*)',
    );
  }

  return env;
}

export function assertStripeWebhookLivemodeMatchesRuntime(
  eventLivemode: boolean,
  runtimeMode: BillingStripeMode | null,
): void {
  if (!runtimeMode) return;
  const eventMode = stripeLivemodeToBillingMode(eventLivemode);
  if (eventMode !== runtimeMode) {
    throw new StripeEnvironmentViolationError(
      STRIPE_ENVIRONMENT_ERROR.WEBHOOK_LIVEMODE_MISMATCH,
      `Stripe webhook livemode mismatch: event=${eventMode}, runtime=${runtimeMode}`,
    );
  }
}

export function assertBillingStripeModeMatchesRuntime(
  resourceMode: BillingStripeMode,
  runtimeMode: BillingStripeMode | null,
): void {
  if (!runtimeMode) return;
  if (resourceMode !== runtimeMode) {
    throw new StripeEnvironmentViolationError(
      STRIPE_ENVIRONMENT_ERROR.RESOURCE_MODE_MISMATCH,
      `Stripe resource mode mismatch: resource=${resourceMode}, runtime=${runtimeMode}`,
    );
  }
}

export function isStripeSandboxOperationAllowed(
  env: ResolvedStripeEnvironment = resolveStripeEnvironment(),
): boolean {
  if (!env.configured) return false;
  if (env.runtimeEnvironment === StripeRuntimeEnvironment.TEST) return true;
  return !env.isProductionNode;
}
