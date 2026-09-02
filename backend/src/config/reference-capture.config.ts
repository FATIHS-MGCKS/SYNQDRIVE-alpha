import { registerAs } from '@nestjs/config';
import { normalizeFastGoTimeoutMs } from '../modules/vehicle-intelligence/reference-capture/reference-capture-fast-go.policy';

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
export const REFERENCE_CAPTURE_CYCLE_INTERVAL_MS_ENV = 'REFERENCE_CAPTURE_CYCLE_INTERVAL_MS';
export const REFERENCE_CAPTURE_MAX_DURATION_MS_ENV = 'REFERENCE_CAPTURE_MAX_DURATION_MS';
export const REFERENCE_CAPTURE_SLOW_CYCLE_EVERY_ENV = 'REFERENCE_CAPTURE_SLOW_CYCLE_EVERY';
export const REFERENCE_CAPTURE_RETENTION_SCHEDULER_ENABLED_ENV =
  'REFERENCE_CAPTURE_RETENTION_SCHEDULER_ENABLED';
export const REFERENCE_CAPTURE_PREARM_MAX_AGE_MS_ENV = 'REFERENCE_CAPTURE_PREARM_MAX_AGE_MS';
export const REFERENCE_CAPTURE_FAST_GO_FIRST_CYCLE_TIMEOUT_MS_ENV =
  'REFERENCE_CAPTURE_FAST_GO_FIRST_CYCLE_TIMEOUT_MS';

const DEFAULT_PREARM_MAX_AGE_MS = 15 * 60 * 1000;
const DEFAULT_FAST_GO_FIRST_CYCLE_TIMEOUT_MS = 15_000;

export default registerAs('referenceCapture', () => ({
  /** Master gate — default off. Never affects production trip FSM or schedulers. */
  enabled: parseBooleanEnv(process.env[REFERENCE_CAPTURE_ENABLED_ENV], false),
  /** Observation retention in days (RP-045). Default 180 per manifest. */
  retentionDays: parseIntEnv(process.env[REFERENCE_CAPTURE_RETENTION_DAYS_ENV], 180),
  /** DB write batch size for long-session backpressure (RP-010). */
  batchSize: parseIntEnv(process.env[REFERENCE_CAPTURE_BATCH_SIZE_ENV], 250),
  /** Max pending observations in memory before backpressure (RP-010). */
  maxPendingObservations: parseIntEnv(process.env[REFERENCE_CAPTURE_MAX_PENDING_ENV], 5000),
  /** Autonomous runner cycle interval while RECORDING. */
  cycleIntervalMs: parseIntEnv(process.env[REFERENCE_CAPTURE_CYCLE_INTERVAL_MS_ENV], 5000),
  /** Safety timeout — auto-stop recording after this duration. */
  maxRecordingDurationMs: parseIntEnv(
    process.env[REFERENCE_CAPTURE_MAX_DURATION_MS_ENV],
    4 * 60 * 60 * 1000,
  ),
  /** Execute LATEST_SLOW surface every N runner cycles. */
  slowCycleEvery: parseIntEnv(process.env[REFERENCE_CAPTURE_SLOW_CYCLE_EVERY_ENV], 6),
  /** When true, daily retention purge runs via scheduler (not automatic unless enabled). */
  retentionSchedulerEnabled: parseBooleanEnv(
    process.env[REFERENCE_CAPTURE_RETENTION_SCHEDULER_ENABLED_ENV],
    false,
  ),
  maxTransientRetries: parseIntEnv(process.env.REFERENCE_CAPTURE_MAX_TRANSIENT_RETRIES, 5),
  transientRetryBaseDelayMs: parseIntEnv(
    process.env.REFERENCE_CAPTURE_TRANSIENT_RETRY_BASE_DELAY_MS,
    2000,
  ),
  /** Maximum age of a READY pre-arm session before FAST GO must re-run PRE-ARM. */
  prearmMaxAgeMs: parseIntEnv(
    process.env[REFERENCE_CAPTURE_PREARM_MAX_AGE_MS_ENV],
    DEFAULT_PREARM_MAX_AGE_MS,
  ),
  /** Hard operator budget: first autonomous cycle must complete within this window. */
  fastGoFirstCycleTimeoutMs: normalizeFastGoTimeoutMs(
    process.env[REFERENCE_CAPTURE_FAST_GO_FIRST_CYCLE_TIMEOUT_MS_ENV],
    DEFAULT_FAST_GO_FIRST_CYCLE_TIMEOUT_MS,
  ),
  /** Estimated PostgreSQL storage multiplier over logical JSON envelope size. */
  postgresStorageMultiplier: 2.5,
}));
