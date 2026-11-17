import { isCoreAppM2mEnabled } from './core-app-m2m.config';

export const CORE_APP_M2M_RATE_LIMIT_WINDOW_SECONDS_DEFAULT = 60;
export const CORE_APP_M2M_RATE_LIMIT_MAX_PER_IP_DEFAULT = 30;
export const CORE_APP_M2M_RATE_LIMIT_MAX_PER_CLIENT_DEFAULT = 20;

/** Default ON — cannot be turned off while M2M runtime is enabled. */
export function isCoreAppM2mRateLimitEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CORE_APP_M2M_RATE_LIMIT_ENABLED?.trim().toLowerCase();
  if (raw === 'false') {
    return false;
  }
  return true;
}

export function resolveCoreAppM2mRateLimitWindowMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CORE_APP_M2M_RATE_LIMIT_WINDOW_SECONDS?.trim();
  const seconds = raw
    ? Number.parseInt(raw, 10)
    : CORE_APP_M2M_RATE_LIMIT_WINDOW_SECONDS_DEFAULT;
  if (!Number.isFinite(seconds) || seconds < 10 || seconds > 3600) {
    return CORE_APP_M2M_RATE_LIMIT_WINDOW_SECONDS_DEFAULT * 1000;
  }
  return seconds * 1000;
}

export function resolveCoreAppM2mRateLimitMaxPerIp(env: NodeJS.ProcessEnv = process.env): number {
  return resolveBoundedLimit(
    env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_IP,
    CORE_APP_M2M_RATE_LIMIT_MAX_PER_IP_DEFAULT,
    1,
    10_000,
  );
}

export function resolveCoreAppM2mRateLimitMaxPerClient(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return resolveBoundedLimit(
    env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_CLIENT,
    CORE_APP_M2M_RATE_LIMIT_MAX_PER_CLIENT_DEFAULT,
    1,
    10_000,
  );
}

function resolveBoundedLimit(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw?.trim()) {
    return fallback;
  }
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

/** Fail fast at bootstrap when operator arms M2M without rate limiting. */
export function assertCoreAppM2mRateLimitConfigConsistent(env: NodeJS.ProcessEnv = process.env): void {
  if (isCoreAppM2mEnabled(env) && !isCoreAppM2mRateLimitEnabled(env)) {
    throw new Error(
      'FATAL: CORE_APP_M2M_RATE_LIMIT_ENABLED cannot be false while CORE_APP_M2M_ENABLED=true',
    );
  }
}