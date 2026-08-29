import { registerAs } from '@nestjs/config';

export type DimoProviderLimiterMode = 'off' | 'shadow' | 'enforce';

export interface DimoProviderLimiterConfigShape {
  enabled: boolean;
  mode: DimoProviderLimiterMode;
  /** Internal safety budget (req/s). DIMO Core documented ceiling is 25 req/s. */
  rateLimitPerSecond: number;
  rateBurst: number;
  maxInFlight: number;
  inFlightLeaseMs: number;
  /** Documented DIMO Core tier ceiling — observability reference only. */
  documentedCoreRatePerSecond: number;
}

const MIN_RATE = 1;
const MAX_RATE = 500;
const MIN_BURST = 0;
const MAX_BURST = 500;
const MIN_IN_FLIGHT = 1;
const MAX_IN_FLIGHT = 1000;
const MIN_LEASE_MS = 5_000;
const MAX_LEASE_MS = 120_000;

function parseBoundedInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw == null || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function parseMode(raw: string | undefined): DimoProviderLimiterMode {
  const normalized = (raw ?? 'shadow').trim().toLowerCase();
  if (normalized === 'off' || normalized === 'shadow' || normalized === 'enforce') {
    return normalized;
  }
  return 'shadow';
}

export function resolveDimoProviderLimiterConfig(
  env: NodeJS.ProcessEnv = process.env,
): DimoProviderLimiterConfigShape {
  const mode = parseMode(env.DIMO_PROVIDER_LIMITER_MODE);
  const enabledExplicit = env.DIMO_PROVIDER_LIMITER_ENABLED?.trim().toLowerCase();
  const enabled =
    enabledExplicit === 'false'
      ? false
      : enabledExplicit === 'true'
        ? true
        : mode !== 'off';

  return {
    enabled,
    mode,
    rateLimitPerSecond: parseBoundedInt(
      env.DIMO_PROVIDER_RATE_LIMIT_PER_SECOND,
      20,
      MIN_RATE,
      MAX_RATE,
    ),
    rateBurst: parseBoundedInt(env.DIMO_PROVIDER_RATE_BURST, 5, MIN_BURST, MAX_BURST),
    maxInFlight: parseBoundedInt(env.DIMO_PROVIDER_MAX_IN_FLIGHT, 40, MIN_IN_FLIGHT, MAX_IN_FLIGHT),
    inFlightLeaseMs: parseBoundedInt(
      env.DIMO_PROVIDER_INFLIGHT_LEASE_MS,
      45_000,
      MIN_LEASE_MS,
      MAX_LEASE_MS,
    ),
    documentedCoreRatePerSecond: 25,
  };
}

export default registerAs('dimoProviderLimiter', () => resolveDimoProviderLimiterConfig());
