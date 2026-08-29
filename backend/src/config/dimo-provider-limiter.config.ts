import { registerAs } from '@nestjs/config';
import { DimoProviderRequestPriority } from '@modules/dimo/provider/dimo-provider-limiter.types';

export type DimoProviderLimiterMode = 'off' | 'shadow' | 'enforce';

export type DimoProviderRateAlgorithm = 'token_bucket' | 'fixed_window';

export interface DimoProviderLimiterConfigShape {
  enabled: boolean;
  mode: DimoProviderLimiterMode;
  /** Internal safety budget (req/s). DIMO Core documented ceiling is 25 req/s. */
  rateLimitPerSecond: number;
  rateBurst: number;
  /** Rate smoothing algorithm (S4 default: token_bucket). */
  rateAlgorithm: DimoProviderRateAlgorithm;
  maxInFlight: number;
  inFlightLeaseMs: number;
  /** In-flight slots reserved for P0/P1 when global cap is reached. */
  reservedHighPrioritySlots: number;
  /** Default max admission wait (enforce mode). */
  maxWaitMs: number;
  /** Per-priority max admission wait overrides (enforce mode). */
  maxWaitMsByPriority: Record<DimoProviderRequestPriority, number>;
  /** Minimum poll interval while waiting for admission. */
  admissionPollMinMs: number;
  /** Maximum poll interval while waiting for admission. */
  admissionPollMaxMs: number;
  /** Upper bound for provider Retry-After seconds stored in Redis cooldown. */
  retryAfterMaxSeconds: number;
  /** Deterministic canary org allowlist — enforce only for listed orgs when mode=shadow. */
  canaryEnforceOrgIds: ReadonlySet<string>;
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
const MIN_WAIT_MS = 0;
const MAX_WAIT_MS = 120_000;
const MIN_RESERVED = 0;
const MAX_RESERVED = 500;

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

function parseRateAlgorithm(raw: string | undefined): DimoProviderRateAlgorithm {
  const normalized = (raw ?? 'token_bucket').trim().toLowerCase();
  if (normalized === 'fixed_window' || normalized === 'token_bucket') {
    return normalized;
  }
  return 'token_bucket';
}

function parseCanaryOrgIds(raw: string | undefined): ReadonlySet<string> {
  if (raw == null || raw.trim() === '') return new Set();
  const ids = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return new Set(ids);
}

function resolveMaxWaitByPriority(
  env: NodeJS.ProcessEnv,
  defaultMaxWaitMs: number,
): Record<DimoProviderRequestPriority, number> {
  return {
    [DimoProviderRequestPriority.P0_CRITICAL]: parseBoundedInt(
      env.DIMO_PROVIDER_MAX_WAIT_MS_P0,
      defaultMaxWaitMs * 2,
      MIN_WAIT_MS,
      MAX_WAIT_MS,
    ),
    [DimoProviderRequestPriority.P1_LIVE]: parseBoundedInt(
      env.DIMO_PROVIDER_MAX_WAIT_MS_P1,
      defaultMaxWaitMs * 2,
      MIN_WAIT_MS,
      MAX_WAIT_MS,
    ),
    [DimoProviderRequestPriority.P2_INTERACTIVE]: parseBoundedInt(
      env.DIMO_PROVIDER_MAX_WAIT_MS_P2,
      defaultMaxWaitMs,
      MIN_WAIT_MS,
      MAX_WAIT_MS,
    ),
    [DimoProviderRequestPriority.P3_NORMAL]: parseBoundedInt(
      env.DIMO_PROVIDER_MAX_WAIT_MS_P3,
      Math.floor(defaultMaxWaitMs * 0.75),
      MIN_WAIT_MS,
      MAX_WAIT_MS,
    ),
    [DimoProviderRequestPriority.P4_BACKGROUND]: parseBoundedInt(
      env.DIMO_PROVIDER_MAX_WAIT_MS_P4,
      Math.floor(defaultMaxWaitMs * 0.5),
      MIN_WAIT_MS,
      MAX_WAIT_MS,
    ),
  };
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

  const maxWaitMs = parseBoundedInt(env.DIMO_PROVIDER_MAX_WAIT_MS, 5_000, MIN_WAIT_MS, MAX_WAIT_MS);
  const maxInFlight = parseBoundedInt(env.DIMO_PROVIDER_MAX_IN_FLIGHT, 40, MIN_IN_FLIGHT, MAX_IN_FLIGHT);
  const reservedHighPrioritySlots = parseBoundedInt(
    env.DIMO_PROVIDER_RESERVED_HIGH_PRIORITY_SLOTS,
    Math.min(12, Math.max(1, Math.floor(maxInFlight * 0.3))),
    MIN_RESERVED,
    MAX_RESERVED,
  );

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
    rateAlgorithm: parseRateAlgorithm(env.DIMO_PROVIDER_RATE_ALGORITHM),
    maxInFlight,
    inFlightLeaseMs: parseBoundedInt(
      env.DIMO_PROVIDER_INFLIGHT_LEASE_MS,
      45_000,
      MIN_LEASE_MS,
      MAX_LEASE_MS,
    ),
    reservedHighPrioritySlots,
    maxWaitMs,
    maxWaitMsByPriority: resolveMaxWaitByPriority(env, maxWaitMs),
    admissionPollMinMs: parseBoundedInt(env.DIMO_PROVIDER_ADMISSION_POLL_MIN_MS, 25, 5, 5_000),
    admissionPollMaxMs: parseBoundedInt(env.DIMO_PROVIDER_ADMISSION_POLL_MAX_MS, 250, 25, 10_000),
    retryAfterMaxSeconds: parseBoundedInt(
      env.DIMO_PROVIDER_RETRY_AFTER_MAX_SECONDS,
      120,
      1,
      600,
    ),
    canaryEnforceOrgIds: parseCanaryOrgIds(env.DIMO_PROVIDER_CANARY_ENFORCE_ORG_IDS),
    documentedCoreRatePerSecond: 25,
  };
}

export default registerAs('dimoProviderLimiter', () => resolveDimoProviderLimiterConfig());
