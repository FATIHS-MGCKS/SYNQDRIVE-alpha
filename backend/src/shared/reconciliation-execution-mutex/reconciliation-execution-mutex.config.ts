import { registerAs } from '@nestjs/config';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export interface ReconciliationExecutionMutexConfigShape {
  enabled: boolean;
  lockTtlMs: number;
  lockRenewEnabled: boolean;
  lockRenewIntervalMs: number;
  lockAcquireTimeoutMs: number;
}

export const RECONCILIATION_MUTEX_DEFAULTS = {
  enabled: true,
  lockTtlMs: 120_000,
  lockRenewEnabled: true,
  lockRenewIntervalMs: 30_000,
  lockAcquireTimeoutMs: 0,
} as const;

export const RECONCILIATION_MUTEX_MIN_TTL_MS = 10_000;

export default registerAs(
  'reconciliationExecutionMutex',
  (): ReconciliationExecutionMutexConfigShape => ({
    enabled: parseBool(
      process.env.RECONCILIATION_EXECUTION_MUTEX_ENABLED,
      RECONCILIATION_MUTEX_DEFAULTS.enabled,
    ),
    lockTtlMs: parsePositiveInt(
      process.env.RECONCILIATION_EXECUTION_MUTEX_TTL_MS,
      RECONCILIATION_MUTEX_DEFAULTS.lockTtlMs,
    ),
    lockRenewEnabled: parseBool(
      process.env.RECONCILIATION_EXECUTION_MUTEX_RENEW_ENABLED,
      RECONCILIATION_MUTEX_DEFAULTS.lockRenewEnabled,
    ),
    lockRenewIntervalMs: parsePositiveInt(
      process.env.RECONCILIATION_EXECUTION_MUTEX_RENEW_INTERVAL_MS,
      RECONCILIATION_MUTEX_DEFAULTS.lockRenewIntervalMs,
    ),
    lockAcquireTimeoutMs: parsePositiveInt(
      process.env.RECONCILIATION_EXECUTION_MUTEX_ACQUIRE_TIMEOUT_MS,
      RECONCILIATION_MUTEX_DEFAULTS.lockAcquireTimeoutMs,
    ),
  }),
);

export function validateReconciliationExecutionMutexConfig(
  config: ReconciliationExecutionMutexConfigShape,
): string[] {
  const errors: string[] = [];
  if (config.lockTtlMs < RECONCILIATION_MUTEX_MIN_TTL_MS) {
    errors.push(
      `RECONCILIATION_EXECUTION_MUTEX_TTL_MS must be >= ${RECONCILIATION_MUTEX_MIN_TTL_MS}`,
    );
  }
  if (config.lockRenewIntervalMs <= 0) {
    errors.push('RECONCILIATION_EXECUTION_MUTEX_RENEW_INTERVAL_MS must be > 0');
  }
  if (config.lockAcquireTimeoutMs < 0) {
    errors.push('RECONCILIATION_EXECUTION_MUTEX_ACQUIRE_TIMEOUT_MS must be >= 0');
  }
  if (config.lockRenewEnabled && config.lockRenewIntervalMs >= config.lockTtlMs) {
    errors.push(
      'RECONCILIATION_EXECUTION_MUTEX_RENEW_INTERVAL_MS must be < RECONCILIATION_EXECUTION_MUTEX_TTL_MS',
    );
  }
  const safetyMarginMs = config.lockTtlMs - config.lockRenewIntervalMs;
  if (config.enabled && config.lockRenewEnabled && safetyMarginMs < 5_000) {
    errors.push(
      'Reconciliation mutex renew interval must leave at least 5000ms safety margin below lock TTL',
    );
  }
  return errors;
}
