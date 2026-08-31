import { registerAs } from '@nestjs/config';

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parseIntEnv(value: string | undefined, defaultValue: number): number {
  if (value == null || value.trim() === '') return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const REFERENCE_CAPTURE_ENABLED_ENV = 'REFERENCE_CAPTURE_ENABLED';
export const REFERENCE_CAPTURE_RETENTION_DAYS_ENV = 'REFERENCE_CAPTURE_RETENTION_DAYS';
export const REFERENCE_CAPTURE_BATCH_SIZE_ENV = 'REFERENCE_CAPTURE_BATCH_SIZE';
export const REFERENCE_CAPTURE_MAX_PENDING_ENV = 'REFERENCE_CAPTURE_MAX_PENDING';

export default registerAs('referenceCapture', () => ({
  /** Master gate — default off. Never affects production trip FSM or schedulers. */
  enabled: parseBooleanEnv(process.env[REFERENCE_CAPTURE_ENABLED_ENV], false),
  /** Observation retention in days (RP-045). Default 180 per manifest. */
  retentionDays: parseIntEnv(process.env[REFERENCE_CAPTURE_RETENTION_DAYS_ENV], 180),
  /** DB write batch size for long-session backpressure (RP-010). */
  batchSize: parseIntEnv(process.env[REFERENCE_CAPTURE_BATCH_SIZE_ENV], 250),
  /** Max pending observations in memory before backpressure (RP-010). */
  maxPendingObservations: parseIntEnv(process.env[REFERENCE_CAPTURE_MAX_PENDING_ENV], 5000),
}));
