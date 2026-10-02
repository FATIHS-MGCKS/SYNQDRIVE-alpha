import { registerAs } from '@nestjs/config';

/** Master raw scan/runtime gate — default false; F4-PR1 reader only (no production wiring). */
export const RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV = 'RAW_FUEL_REFUEL_FALLBACK_ENABLED';

/** F2 candidate staging gate only — MUST NEVER authorize VehicleEnergyEvent promotion. */
export const RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV =
  'RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED';

/** F10.6.8-B durable candidate recovery scheduler — default false. */
export const RFRF_CANDIDATE_RECOVERY_ENABLED_ENV = 'RFRF_CANDIDATE_RECOVERY_ENABLED';

export const RFRF_CANDIDATE_RECOVERY_INTERVAL_MS_ENV =
  'RFRF_CANDIDATE_RECOVERY_INTERVAL_MS';

export const RFRF_CANDIDATE_RECOVERY_BATCH_SIZE_ENV =
  'RFRF_CANDIDATE_RECOVERY_BATCH_SIZE';

export const RFRF_CANDIDATE_RECOVERY_LEASE_MS_ENV = 'RFRF_CANDIDATE_RECOVERY_LEASE_MS';

export const RFRF_CANDIDATE_RECOVERY_DEFAULT_INTERVAL_MS = 120_000;
export const RFRF_CANDIDATE_RECOVERY_DEFAULT_BATCH_SIZE = 20;
export const RFRF_CANDIDATE_RECOVERY_DEFAULT_LEASE_MS = 5 * 60 * 1000;

/**
 * Cutover instant preserved for F6+ rollout enforcement.
 * F4 does not discard delayed evidence using this value.
 */
export const RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV = 'RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT';

export interface RawFuelRefuelFallbackConfig {
  /** Master raw branch scan gate. Absent/malformed => false. */
  masterEnabled: boolean;
  /** F2 candidate persistence gate. Independent of master; never implies VEE promotion. */
  persistEnabled: boolean;
  /** Parsed ISO cutover instant when valid; null when absent or malformed. */
  cutoverAt: Date | null;
  /** F10.6.8-B candidate-centric recovery scheduler. */
  candidateRecoveryEnabled: boolean;
  candidateRecoveryIntervalMs: number;
  candidateRecoveryBatchSize: number;
  candidateRecoveryLeaseMs: number;
}

/**
 * Fail-closed boolean parser for RFRF flags.
 * Absent => false. Malformed => false (never implicit true).
 */
export function parseRawFuelRefuelFallbackBoolean(value: string | undefined): boolean {
  if (value == null || value.trim() === '') return false;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return false;
}

function parseOptionalIsoDate(value: string | undefined): Date | null {
  if (value == null || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadRawFuelRefuelFallbackConfig(
  env: NodeJS.ProcessEnv = process.env,
): RawFuelRefuelFallbackConfig {
  return {
    masterEnabled: parseRawFuelRefuelFallbackBoolean(
      env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV],
    ),
    persistEnabled: parseRawFuelRefuelFallbackBoolean(
      env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV],
    ),
    cutoverAt: parseOptionalIsoDate(env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV]),
    candidateRecoveryEnabled: parseRawFuelRefuelFallbackBoolean(
      env[RFRF_CANDIDATE_RECOVERY_ENABLED_ENV],
    ),
    candidateRecoveryIntervalMs: parsePositiveInt(
      env[RFRF_CANDIDATE_RECOVERY_INTERVAL_MS_ENV],
      RFRF_CANDIDATE_RECOVERY_DEFAULT_INTERVAL_MS,
    ),
    candidateRecoveryBatchSize: parsePositiveInt(
      env[RFRF_CANDIDATE_RECOVERY_BATCH_SIZE_ENV],
      RFRF_CANDIDATE_RECOVERY_DEFAULT_BATCH_SIZE,
    ),
    candidateRecoveryLeaseMs: parsePositiveInt(
      env[RFRF_CANDIDATE_RECOVERY_LEASE_MS_ENV],
      RFRF_CANDIDATE_RECOVERY_DEFAULT_LEASE_MS,
    ),
  };
}

/** Fail-closed test defaults — candidate recovery scheduler explicitly OFF. */
export function defaultRawFuelRefuelFallbackConfigForTests(
  overrides: Partial<RawFuelRefuelFallbackConfig> = {},
): RawFuelRefuelFallbackConfig {
  return {
    masterEnabled: false,
    persistEnabled: false,
    cutoverAt: null,
    candidateRecoveryEnabled: false,
    candidateRecoveryIntervalMs: RFRF_CANDIDATE_RECOVERY_DEFAULT_INTERVAL_MS,
    candidateRecoveryBatchSize: RFRF_CANDIDATE_RECOVERY_DEFAULT_BATCH_SIZE,
    candidateRecoveryLeaseMs: RFRF_CANDIDATE_RECOVERY_DEFAULT_LEASE_MS,
    ...overrides,
  };
}

export default registerAs('rawFuelRefuelFallback', () => loadRawFuelRefuelFallbackConfig());

/** Convenience for unit tests and future F4-PR2 wiring. */
export function isRawFuelRefuelFallbackMasterEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return loadRawFuelRefuelFallbackConfig(env).masterEnabled;
}

export function isRawFuelRefuelFallbackPersistEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return loadRawFuelRefuelFallbackConfig(env).persistEnabled;
}

/** F10.6.8-B — master + persist + dedicated recovery flag. */
export function canExecuteRawRefuelCandidateRecovery(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const config = loadRawFuelRefuelFallbackConfig(env);
  return (
    config.masterEnabled &&
    config.persistEnabled &&
    config.candidateRecoveryEnabled
  );
}

/**
 * Persist flag gates F2 staging only — never VehicleEnergyEvent promotion (F5 authority).
 * This helper exists to make the contract explicit in tests and future call sites.
 */
export function canRawRefuelFallbackAuthorizeVehicleEnergyEventPromotion(): false {
  return false;
}

/**
 * F5 convergence authorization gate (conceptual env reserved for F5).
 * MUST remain false for all F4 work — not a production flag in F4-PR3.
 */
export const RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV =
  'RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED';

/**
 * Strict authority reader for F5 convergence — only canonical `true` (case/whitespace tolerant).
 * Does NOT accept 1/yes/on like the general permissive RFRF flag parser.
 */
export function parseRfrfNativeFallbackConvergenceAuthorized(
  value: string | undefined,
): boolean {
  if (value == null || value.trim() === '') return false;
  return value.trim().toLowerCase() === 'true';
}

/** F5-PR1 fail-closed reader — authorizes convergence evaluation only, never VEE insert. */
export function isRfrfNativeFallbackConvergenceAuthorized(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return parseRfrfNativeFallbackConvergenceAuthorized(
    env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV],
  );
}

/** F5-PR2 promotion execution authority — separate from convergence authorization. */
export const RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV =
  'RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED';

/**
 * Strict authority reader for F5-PR2 promotion execution — only canonical `true`.
 * Does NOT accept 1/yes/on like the general permissive RFRF flag parser.
 */
export function parseRfrfFallbackPromotionExecutionAuthorized(
  value: string | undefined,
): boolean {
  if (value == null || value.trim() === '') return false;
  return value.trim().toLowerCase() === 'true';
}

/** F5-PR2 fail-closed reader — authorizes fallback VehicleEnergyEvent insert only. */
export function isRfrfFallbackPromotionExecutionAuthorized(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return parseRfrfFallbackPromotionExecutionAuthorized(
    env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV],
  );
}

/** Hard authority boundary — fallback VehicleEnergyEvent creation gated by F5-PR2 promotion execution flag. */
export function canCreateFallbackVehicleEnergyEvent(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isRfrfFallbackPromotionExecutionAuthorized(env);
}

export interface FallbackPromotionAuthorityEvaluation {
  authorized: boolean;
  detail:
    | 'authorized'
    | 'promotion_execution_not_authorized'
    | 'convergence_not_authorized';
}

/**
 * F5-PR2 authoritative promotion gate — requires BOTH convergence and promotion execution.
 * Neither flag alone may authorize fallback VehicleEnergyEvent insert.
 */
export function evaluateFallbackPromotionAuthority(
  env: NodeJS.ProcessEnv = process.env,
): FallbackPromotionAuthorityEvaluation {
  if (!isRfrfFallbackPromotionExecutionAuthorized(env)) {
    return { authorized: false, detail: 'promotion_execution_not_authorized' };
  }
  if (!isRfrfNativeFallbackConvergenceAuthorized(env)) {
    return { authorized: false, detail: 'convergence_not_authorized' };
  }
  return { authorized: true, detail: 'authorized' };
}

/** Convenience boolean for tests and call sites that need conjunction only. */
export function canExecuteFallbackVehicleEnergyEventPromotion(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return evaluateFallbackPromotionAuthority(env).authorized;
}

/** F5-PR3 post-commit G2 handoff authority — separate from promotion execution. */
export const RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV =
  'RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED';

/**
 * Strict authority reader for F5-PR3 G2 handoff — only canonical `true`.
 * Does NOT accept 1/yes/on like the general permissive RFRF flag parser.
 */
export function parseRfrfFallbackG2HandoffAuthorized(value: string | undefined): boolean {
  if (value == null || value.trim() === '') return false;
  return value.trim().toLowerCase() === 'true';
}

/** F5-PR3 fail-closed reader — authorizes post-commit fallback G2 handoff only. */
export function isRfrfFallbackG2HandoffAuthorized(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return parseRfrfFallbackG2HandoffAuthorized(env[RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV]);
}

export interface FallbackG2HandoffAuthorityEvaluation {
  authorized: boolean;
  detail:
    | 'authorized'
    | 'handoff_not_authorized'
    | 'promotion_execution_not_authorized'
    | 'convergence_not_authorized';
}

/**
 * F5-PR3 authoritative G2 handoff gate — requires convergence, promotion execution,
 * and handoff flags. No individual flag may authorize fallback G2 participation.
 */
export function evaluateFallbackG2HandoffAuthority(
  env: NodeJS.ProcessEnv = process.env,
): FallbackG2HandoffAuthorityEvaluation {
  if (!isRfrfFallbackG2HandoffAuthorized(env)) {
    return { authorized: false, detail: 'handoff_not_authorized' };
  }
  if (!isRfrfFallbackPromotionExecutionAuthorized(env)) {
    return { authorized: false, detail: 'promotion_execution_not_authorized' };
  }
  if (!isRfrfNativeFallbackConvergenceAuthorized(env)) {
    return { authorized: false, detail: 'convergence_not_authorized' };
  }
  return { authorized: true, detail: 'authorized' };
}

/** Convenience boolean for tests and call sites that need full handoff conjunction. */
export function canExecuteFallbackG2Handoff(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return evaluateFallbackG2HandoffAuthority(env).authorized;
}

export const SYNQDRIVE_RAW_FUEL_FALLBACK_DETECTION_SOURCE =
  'SYNQDRIVE_RAW_FUEL_FALLBACK' as const;

export function isSynqdriveRawFuelFallbackDetectionSource(
  detectionSource: string | null | undefined,
): boolean {
  return detectionSource === SYNQDRIVE_RAW_FUEL_FALLBACK_DETECTION_SOURCE;
}
