import { registerAs } from '@nestjs/config';

export const TIRE_DS4_SHADOW_ENABLED_ENV = 'TIRE_DS4_SHADOW_ENABLED';
export const TIRE_DS4_SHADOW_CATCHUP_ENABLED_ENV = 'TIRE_DS4_SHADOW_CATCHUP_ENABLED';
export const TIRE_DS4_SHADOW_CATCHUP_INTERVAL_MS_ENV = 'TIRE_DS4_SHADOW_CATCHUP_INTERVAL_MS';
export const TIRE_DS4_SHADOW_CATCHUP_BATCH_SIZE_ENV = 'TIRE_DS4_SHADOW_CATCHUP_BATCH_SIZE';
export const TIRE_DS4_SHADOW_MAX_ATTEMPTS_ENV = 'TIRE_DS4_SHADOW_MAX_ATTEMPTS';
export const TIRE_DS4_SHADOW_RETRY_BASE_MS_ENV = 'TIRE_DS4_SHADOW_RETRY_BASE_MS';

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parsePositiveIntEnv(value: string | undefined, defaultValue: number): number {
  if (value == null || value.trim() === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

export default registerAs('tireDs4Shadow', () => ({
  enabled: parseBooleanEnv(process.env[TIRE_DS4_SHADOW_ENABLED_ENV], false),
  catchupEnabled: parseBooleanEnv(process.env[TIRE_DS4_SHADOW_CATCHUP_ENABLED_ENV], true),
  catchupIntervalMs: parsePositiveIntEnv(process.env[TIRE_DS4_SHADOW_CATCHUP_INTERVAL_MS_ENV], 300_000),
  catchupBatchSize: parsePositiveIntEnv(process.env[TIRE_DS4_SHADOW_CATCHUP_BATCH_SIZE_ENV], 50),
  maxAttempts: parsePositiveIntEnv(process.env[TIRE_DS4_SHADOW_MAX_ATTEMPTS_ENV], 24),
  retryBaseMs: parsePositiveIntEnv(process.env[TIRE_DS4_SHADOW_RETRY_BASE_MS_ENV], 60_000),
}));
