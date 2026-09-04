import { registerAs } from '@nestjs/config';
import { normalizeFastGoTimeoutMs } from '../modules/vehicle-intelligence/reference-capture/reference-capture-fast-go.policy';
import {
  clampIntEnv,
  HF_RECOVERY_SWEEP_INTERVAL_MS_DEFAULT,
  HF_RECOVERY_SWEEP_LOOKBACK_MS_DEFAULT,
  HF_SETTLEMENT_DELAY_MS_MAX,
  HF_SETTLEMENT_DELAY_MS_MIN,
  HF_RECOVERY_OVERLAP_MS_MAX,
  HF_RECOVERY_OVERLAP_MS_MIN,
  HF_RECOVERY_SWEEP_INTERVAL_MS_MIN,
  PROVISIONAL_RECOVERY_OVERLAP_MS,
  PROVISIONAL_SETTLEMENT_DELAY_MS,
  parseBooleanEnv as parseHfBooleanEnv,
  parseCanaryTokenIdList,
} from '../modules/vehicle-intelligence/reference-capture/reference-capture-hf-recovery-v2.policy';

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

/** DI-EV-0035C — HF recovery policy V2 (default OFF; provisional 8s/6s unvalidated). */
export const HF_RECOVERY_POLICY_V2_ENABLED_ENV = 'HF_RECOVERY_POLICY_V2_ENABLED';
export const HF_SETTLEMENT_DELAY_MS_ENV = 'HF_SETTLEMENT_DELAY_MS';
export const HF_RECOVERY_OVERLAP_MS_ENV = 'HF_RECOVERY_OVERLAP_MS';
export const HF_RECOVERY_SWEEP_ENABLED_ENV = 'HF_RECOVERY_SWEEP_ENABLED';
export const HF_RECOVERY_SWEEP_INTERVAL_MS_ENV = 'HF_RECOVERY_SWEEP_INTERVAL_MS';
export const HF_RECOVERY_SWEEP_LOOKBACK_MS_ENV = 'HF_RECOVERY_SWEEP_LOOKBACK_MS';
export const HF_RECOVERY_POLICY_V2_CANARY_ONLY_ENV = 'HF_RECOVERY_POLICY_V2_CANARY_ONLY';
export const HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS_ENV = 'HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS';
export const HF_AVAILABILITY_CALIBRATION_ENABLED_ENV = 'HF_AVAILABILITY_CALIBRATION_ENABLED';

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
  /** HF recovery V2 — default OFF. Provisional 8s/6s NOT validated. */
  hfRecoveryPolicyV2Enabled: parseHfBooleanEnv(process.env[HF_RECOVERY_POLICY_V2_ENABLED_ENV], false),
  hfSettlementDelayMs: clampIntEnv(
    process.env[HF_SETTLEMENT_DELAY_MS_ENV],
    PROVISIONAL_SETTLEMENT_DELAY_MS,
    HF_SETTLEMENT_DELAY_MS_MIN,
    HF_SETTLEMENT_DELAY_MS_MAX,
  ),
  hfRecoveryOverlapMs: clampIntEnv(
    process.env[HF_RECOVERY_OVERLAP_MS_ENV],
    PROVISIONAL_RECOVERY_OVERLAP_MS,
    HF_RECOVERY_OVERLAP_MS_MIN,
    HF_RECOVERY_OVERLAP_MS_MAX,
  ),
  hfRecoverySweepEnabled: parseHfBooleanEnv(process.env[HF_RECOVERY_SWEEP_ENABLED_ENV], false),
  hfRecoverySweepIntervalMs: clampIntEnv(
    process.env[HF_RECOVERY_SWEEP_INTERVAL_MS_ENV],
    HF_RECOVERY_SWEEP_INTERVAL_MS_DEFAULT,
    HF_RECOVERY_SWEEP_INTERVAL_MS_MIN,
    24 * 60 * 60 * 1000,
  ),
  hfRecoverySweepLookbackMs: clampIntEnv(
    process.env[HF_RECOVERY_SWEEP_LOOKBACK_MS_ENV],
    HF_RECOVERY_SWEEP_LOOKBACK_MS_DEFAULT,
    60_000,
    24 * 60 * 60 * 1000,
  ),
  hfRecoveryPolicyV2CanaryOnly: parseHfBooleanEnv(
    process.env[HF_RECOVERY_POLICY_V2_CANARY_ONLY_ENV],
    true,
  ),
  hfRecoveryPolicyV2CanaryTokenIds: parseCanaryTokenIdList(
    process.env[HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS_ENV],
  ),
  hfAvailabilityCalibrationEnabled: parseHfBooleanEnv(
    process.env[HF_AVAILABILITY_CALIBRATION_ENABLED_ENV],
    false,
  ),
}));
