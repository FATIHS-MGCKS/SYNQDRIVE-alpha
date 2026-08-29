import { registerAs } from '@nestjs/config';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export interface DimoProviderBudgetConfigShape {
  globalBudgetEnabled: boolean;
  globalMaxInFlight: number;
  globalAcquireTimeoutMs: number;
  globalLeaseMs: number;
  globalRetryAfterMaxMs: number;
  globalMaxRetries: number;
  /** Minimum slots reserved for CRITICAL/HIGH when saturated. */
  reservedHighPrioritySlots: number;
  /** After this wait, LOW/BACKGROUND priority is promoted one level. */
  starvationPromotionMs: number;
  /** Sliding window 429 count before temporary cooldown. */
  providerCooldown429Threshold: number;
  providerCooldownMs: number;
  /** Poll interval while waiting for a permit. */
  acquirePollIntervalMs: number;
}

export default registerAs('dimoProviderBudget', (): DimoProviderBudgetConfigShape => {
  const requestTimeoutMs = parsePositiveInt(process.env.DIMO_REQUEST_TIMEOUT_MS, 10_000);
  const globalLeaseMs = parsePositiveInt(
    process.env.DIMO_GLOBAL_LEASE_MS,
    Math.max(requestTimeoutMs * 3, 30_000),
  );

  return {
    globalBudgetEnabled: parseBool(process.env.DIMO_GLOBAL_BUDGET_ENABLED, true),
    globalMaxInFlight: parsePositiveInt(process.env.DIMO_GLOBAL_MAX_IN_FLIGHT, 50),
    globalAcquireTimeoutMs: parsePositiveInt(
      process.env.DIMO_GLOBAL_ACQUIRE_TIMEOUT_MS,
      15_000,
    ),
    globalLeaseMs,
    globalRetryAfterMaxMs: parsePositiveInt(
      process.env.DIMO_GLOBAL_RETRY_AFTER_MAX_MS,
      120_000,
    ),
    globalMaxRetries: parseNonNegativeInt(process.env.DIMO_GLOBAL_MAX_RETRIES, 3),
    reservedHighPrioritySlots: parseNonNegativeInt(
      process.env.DIMO_GLOBAL_RESERVED_HIGH_SLOTS,
      10,
    ),
    starvationPromotionMs: parsePositiveInt(
      process.env.DIMO_GLOBAL_STARVATION_PROMOTION_MS,
      30_000,
    ),
    providerCooldown429Threshold: parsePositiveInt(
      process.env.DIMO_PROVIDER_COOLDOWN_429_THRESHOLD,
      5,
    ),
    providerCooldownMs: parsePositiveInt(
      process.env.DIMO_PROVIDER_COOLDOWN_MS,
      30_000,
    ),
    acquirePollIntervalMs: parsePositiveInt(
      process.env.DIMO_GLOBAL_ACQUIRE_POLL_MS,
      50,
    ),
  };
});

export function validateDimoProviderBudgetConfig(
  config: DimoProviderBudgetConfigShape,
): string[] {
  const errors: string[] = [];
  if (config.globalMaxInFlight <= 0) {
    errors.push('DIMO_GLOBAL_MAX_IN_FLIGHT must be > 0');
  }
  if (config.globalLeaseMs < 5_000) {
    errors.push('DIMO_GLOBAL_LEASE_MS must be >= 5000');
  }
  if (config.reservedHighPrioritySlots >= config.globalMaxInFlight) {
    errors.push(
      'DIMO_GLOBAL_RESERVED_HIGH_SLOTS must be < DIMO_GLOBAL_MAX_IN_FLIGHT',
    );
  }
  if (config.globalAcquireTimeoutMs <= 0) {
    errors.push('DIMO_GLOBAL_ACQUIRE_TIMEOUT_MS must be > 0');
  }
  return errors;
}
