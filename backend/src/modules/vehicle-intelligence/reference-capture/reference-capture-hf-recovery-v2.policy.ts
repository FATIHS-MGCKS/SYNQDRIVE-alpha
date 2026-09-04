/**
 * DI-EV-0035C — HF historical recovery policy V2 (reference capture incremental HF path).
 *
 * PROVISIONAL defaults (8s settlement / 6s overlap) are engineering candidates only —
 * PRODUCTION_HF_POLICY_PARAMETERS_VALIDATED = NO until live calibration.
 */
import {
  computeHfQueryFrom,
  getFieldDataWatermark,
  getFieldQueryCoverage,
  HF_QUERY_OVERLAP_MS,
  normalizeHfCommittedWatermarkState,
  type HfCommittedWatermarkState,
} from './reference-capture-hf-watermark-policy';

export const HF_RECOVERY_POLICY_V2_VERSION = 'HF_RECOVERY_V2_2026-09-04';

/** Legacy overlap — unchanged when V2 disabled. */
export const LEGACY_HF_RECOVERY_OVERLAP_MS = HF_QUERY_OVERLAP_MS;

/** Provisional engineering defaults — NOT validated optimal values. */
export const PROVISIONAL_SETTLEMENT_DELAY_MS = 8000;
export const PROVISIONAL_RECOVERY_OVERLAP_MS = 6000;

export const HF_SETTLEMENT_DELAY_MS_MIN = 0;
export const HF_SETTLEMENT_DELAY_MS_MAX = 120_000;
export const HF_RECOVERY_OVERLAP_MS_MIN = 0;
export const HF_RECOVERY_OVERLAP_MS_MAX = 120_000;
export const HF_RECOVERY_SWEEP_INTERVAL_MS_MIN = 30_000;
export const HF_RECOVERY_SWEEP_INTERVAL_MS_DEFAULT = 300_000;
export const HF_RECOVERY_SWEEP_LOOKBACK_MS_DEFAULT = 30 * 60 * 1000;
export const HF_QUERY_PROVENANCE_RING_MAX = 500;

/** DI-EV-0035C.1 — provisional block poll cadence (NOT validated). */
export const PROVISIONAL_HF_POLL_INTERVAL_MS = 30_000;
export const HF_HISTORICAL_POLL_INTERVAL_MS_MIN = 5_000;
export const HF_HISTORICAL_POLL_INTERVAL_MS_MAX = 120_000;

export type HfRecoveryPolicyMode = 'LEGACY' | 'V2';

export type HfRecoveryPolicyV2Config = {
  mode: HfRecoveryPolicyMode;
  settlementDelayMs: number;
  recoveryOverlapMs: number;
  /** V2-only HF_HISTORICAL provider request cadence (ms). LEGACY ignores — polls every runner cycle. */
  hfHistoricalPollIntervalMs: number;
  recoverySweepEnabled: boolean;
  recoverySweepIntervalMs: number;
  recoverySweepLookbackMs: number;
  availabilityCalibrationEnabled: boolean;
  canaryTokenIds: number[];
};

export type HfRecoveryCursorState = {
  /** Per-field RECOVERY authority: highest closed interval end durably swept. */
  hfRecoveryCursorByField: Record<string, string>;
  lastRecoverySweepAt: string | null;
  recoverySweepCount: number;
};

export type HfQueryProvenanceRecord = {
  recordedAt: string;
  policyVersion: string;
  policyMode: HfRecoveryPolicyMode;
  tokenId: number;
  vehicleId: string;
  sessionId: string;
  captureCycleId: string;
  queryOrigin: 'FAST_LOOP' | 'RECOVERY_SWEEP' | 'AVAILABILITY_CALIBRATION';
  providerFields: string[];
  queryFrom: string;
  queryTo: string;
  requestedInterval: string;
  aggregation: string;
  requestStartedAt: string;
  requestCompletedAt: string;
  settlementDelayMs: number;
  recoveryOverlapMs: number;
  resultBucketCount: number;
  status: 'SUCCESS' | 'ZERO_RESULT' | 'PROVIDER_ERROR' | 'PERSISTENCE_FAILURE';
  requestCorrelationId: string;
};

export type HfQueryWindow = {
  queryFrom: Date;
  queryTo: Date;
  settlementDelayMs: number;
  recoveryOverlapMs: number;
  policyMode: HfRecoveryPolicyMode;
};

export function clampIntEnv(
  value: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (value == null || value.trim() === '') return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(max, Math.max(min, parsed));
}

export function parseCanaryTokenIdList(value: string | undefined): number[] {
  if (value == null || value.trim() === '') return [];
  const ids: number[] = [];
  for (const part of value.split(/[,\s]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const n = Number.parseInt(trimmed, 10);
    if (Number.isFinite(n) && n > 0) ids.push(n);
  }
  return [...new Set(ids)];
}

export function parseHfRecoveryPolicyV2ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): HfRecoveryPolicyV2Config {
  const v2Enabled = parseBooleanEnv(env.HF_RECOVERY_POLICY_V2_ENABLED, false);
  const globalCanaryOnly = parseBooleanEnv(env.HF_RECOVERY_POLICY_V2_CANARY_ONLY, true);
  const canaryTokenIds = parseCanaryTokenIdList(env.HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS);

  return {
    mode: v2Enabled ? 'V2' : 'LEGACY',
    settlementDelayMs: clampIntEnv(
      env.HF_SETTLEMENT_DELAY_MS,
      PROVISIONAL_SETTLEMENT_DELAY_MS,
      HF_SETTLEMENT_DELAY_MS_MIN,
      HF_SETTLEMENT_DELAY_MS_MAX,
    ),
    recoveryOverlapMs: clampIntEnv(
      env.HF_RECOVERY_OVERLAP_MS,
      PROVISIONAL_RECOVERY_OVERLAP_MS,
      HF_RECOVERY_OVERLAP_MS_MIN,
      HF_RECOVERY_OVERLAP_MS_MAX,
    ),
    hfHistoricalPollIntervalMs: clampIntEnv(
      env.HF_HISTORICAL_POLL_INTERVAL_MS,
      PROVISIONAL_HF_POLL_INTERVAL_MS,
      HF_HISTORICAL_POLL_INTERVAL_MS_MIN,
      HF_HISTORICAL_POLL_INTERVAL_MS_MAX,
    ),
    recoverySweepEnabled: parseBooleanEnv(env.HF_RECOVERY_SWEEP_ENABLED, false),
    recoverySweepIntervalMs: clampIntEnv(
      env.HF_RECOVERY_SWEEP_INTERVAL_MS,
      HF_RECOVERY_SWEEP_INTERVAL_MS_DEFAULT,
      HF_RECOVERY_SWEEP_INTERVAL_MS_MIN,
      24 * 60 * 60 * 1000,
    ),
    recoverySweepLookbackMs: clampIntEnv(
      env.HF_RECOVERY_SWEEP_LOOKBACK_MS,
      HF_RECOVERY_SWEEP_LOOKBACK_MS_DEFAULT,
      60_000,
      24 * 60 * 60 * 1000,
    ),
    availabilityCalibrationEnabled: parseBooleanEnv(env.HF_AVAILABILITY_CALIBRATION_ENABLED, false),
    canaryTokenIds: globalCanaryOnly ? canaryTokenIds : [],
  };
}

export function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export function resolveHfRecoveryPolicyForToken(
  config: HfRecoveryPolicyV2Config,
  tokenId: number,
): HfRecoveryPolicyV2Config {
  if (config.mode !== 'V2') {
    return { ...config, mode: 'LEGACY' };
  }
  if (config.canaryTokenIds.length === 0) {
    return config;
  }
  if (!config.canaryTokenIds.includes(tokenId)) {
    return { ...config, mode: 'LEGACY' };
  }
  return config;
}

export function getEffectiveOverlapMs(config: HfRecoveryPolicyV2Config): number {
  return config.mode === 'V2' ? config.recoveryOverlapMs : LEGACY_HF_RECOVERY_OVERLAP_MS;
}

/** Legacy: queryTo = requestStartedAt. V2: safeQueryTo = requestStartedAt - settlementDelayMs. */
export function resolveHfQueryTo(
  requestStartedAt: Date,
  config: HfRecoveryPolicyV2Config,
  bounds?: { sessionEndAt?: Date | null; maxHistoricalAt?: Date | null },
): Date {
  if (config.mode === 'LEGACY') {
    return clampQueryTo(requestStartedAt, bounds);
  }
  const safeQueryTo = new Date(requestStartedAt.getTime() - config.settlementDelayMs);
  return clampQueryTo(safeQueryTo, bounds);
}

function clampQueryTo(candidate: Date, bounds?: { sessionEndAt?: Date | null; maxHistoricalAt?: Date | null }): Date {
  let ms = candidate.getTime();
  if (bounds?.sessionEndAt) {
    ms = Math.min(ms, bounds.sessionEndAt.getTime());
  }
  if (bounds?.maxHistoricalAt) {
    ms = Math.min(ms, bounds.maxHistoricalAt.getTime());
  }
  const now = Date.now();
  ms = Math.min(ms, now);
  return new Date(ms);
}

export function buildHfQueryWindow(args: {
  watermarkState: HfCommittedWatermarkState;
  sessionStartedAt: Date;
  providerFields: string[];
  requestStartedAt: Date;
  config: HfRecoveryPolicyV2Config;
  bounds?: { sessionEndAt?: Date | null };
  /** Recovery sweep uses explicit canonical origin — do not re-derive from coverage. */
  explicitQueryFrom?: Date;
}): HfQueryWindow {
  const overlapMs = getEffectiveOverlapMs(args.config);
  const queryFrom =
    args.explicitQueryFrom ??
    computeHfQueryFrom(args.watermarkState, args.sessionStartedAt, args.providerFields, overlapMs);
  const queryTo = resolveHfQueryTo(args.requestStartedAt, args.config, args.bounds);
  return {
    queryFrom,
    queryTo,
    settlementDelayMs: args.config.mode === 'V2' ? args.config.settlementDelayMs : 0,
    recoveryOverlapMs: overlapMs,
    policyMode: args.config.mode,
  };
}

export function isValidHfQueryWindow(window: HfQueryWindow): boolean {
  return window.queryFrom.getTime() < window.queryTo.getTime();
}

export function normalizeHfRecoveryCursorState(
  state: Partial<HfRecoveryCursorState> | null | undefined,
): HfRecoveryCursorState {
  return {
    hfRecoveryCursorByField:
      state?.hfRecoveryCursorByField && typeof state.hfRecoveryCursorByField === 'object'
        ? { ...state.hfRecoveryCursorByField }
        : {},
    lastRecoverySweepAt: state?.lastRecoverySweepAt ?? null,
    recoverySweepCount: state?.recoverySweepCount ?? 0,
  };
}

export function appendQueryProvenanceRecord(
  ring: HfQueryProvenanceRecord[],
  record: HfQueryProvenanceRecord,
): HfQueryProvenanceRecord[] {
  const next = [...ring, record];
  if (next.length <= HF_QUERY_PROVENANCE_RING_MAX) return next;
  return next.slice(next.length - HF_QUERY_PROVENANCE_RING_MAX);
}

/**
 * Coverage may advance only after durable acquisition commit (including legitimate zero-result).
 */
export function shouldAdvanceQueryCoverageAfterAcquisition(args: {
  providerQuerySucceeded: boolean;
  persistenceCommitted: boolean;
}): boolean {
  return args.providerQuerySucceeded && args.persistenceCommitted;
}

export function advanceHfQueryCoverageIfEligible(
  state: HfCommittedWatermarkState,
  providerFields: string[],
  actualQueryTo: string | Date,
  eligible: boolean,
): HfCommittedWatermarkState {
  if (!eligible) return state;
  const ts = typeof actualQueryTo === 'string' ? actualQueryTo : actualQueryTo.toISOString();
  const nextCoverage = { ...state.hfQueryCoverageByField };
  for (const field of providerFields) {
    const prev = nextCoverage[field];
    if (!prev || Date.parse(ts) > Date.parse(prev)) {
      nextCoverage[field] = ts;
    }
  }
  return { ...state, hfQueryCoverageByField: nextCoverage };
}

export function shouldRunRecoverySweep(args: {
  config: HfRecoveryPolicyV2Config;
  nowMs: number;
  lastRecoverySweepAt: string | null;
}): boolean {
  if (args.config.mode !== 'V2' || !args.config.recoverySweepEnabled) return false;
  if (!args.lastRecoverySweepAt) return true;
  const last = Date.parse(args.lastRecoverySweepAt);
  if (!Number.isFinite(last)) return true;
  return args.nowMs - last >= args.config.recoverySweepIntervalMs;
}

/** Bounded recovery chunk behind settled fast-loop coverage. */
export function planRecoverySweepWindow(args: {
  watermarkState: HfCommittedWatermarkState;
  recoveryCursor: HfRecoveryCursorState;
  sessionStartedAt: Date;
  providerFields: string[];
  requestStartedAt: Date;
  config: HfRecoveryPolicyV2Config;
  maxChunkMs: number;
}): HfQueryWindow | null {
  if (args.config.mode !== 'V2' || !args.config.recoverySweepEnabled) return null;
  if (!args.providerFields.length) return null;

  const overlapMs = args.config.recoveryOverlapMs;
  const settledTo = resolveHfQueryTo(args.requestStartedAt, args.config).getTime();
  const lookbackFloor = settledTo - args.config.recoverySweepLookbackMs;

  let minCursorMs = Number.POSITIVE_INFINITY;
  for (const field of args.providerFields) {
    const cursor = args.recoveryCursor.hfRecoveryCursorByField[field];
    const coverage = getFieldQueryCoverage(args.watermarkState, field);
    const data = getFieldDataWatermark(args.watermarkState, field);
    const baseMs = cursor
      ? Date.parse(cursor)
      : coverage
        ? Date.parse(coverage) - overlapMs
        : data
          ? Date.parse(data) - overlapMs
          : args.sessionStartedAt.getTime();
    if (Number.isFinite(baseMs)) minCursorMs = Math.min(minCursorMs, baseMs);
  }
  if (!Number.isFinite(minCursorMs)) {
    minCursorMs = args.sessionStartedAt.getTime();
  }

  const chunkEndMs = Math.min(settledTo, minCursorMs + args.maxChunkMs);
  const chunkStartMs = Math.max(args.sessionStartedAt.getTime(), lookbackFloor, minCursorMs - overlapMs);
  if (chunkStartMs >= chunkEndMs) return null;

  return {
    queryFrom: new Date(chunkStartMs),
    queryTo: new Date(chunkEndMs),
    settlementDelayMs: args.config.settlementDelayMs,
    recoveryOverlapMs: overlapMs,
    policyMode: 'V2',
  };
}

export function advanceRecoveryCursorAfterSuccessfulSweep(
  cursor: HfRecoveryCursorState,
  providerFields: string[],
  sweptTo: string | Date,
): HfRecoveryCursorState {
  const ts = typeof sweptTo === 'string' ? sweptTo : sweptTo.toISOString();
  const next = { ...cursor.hfRecoveryCursorByField };
  for (const field of providerFields) {
    const prev = next[field];
    if (!prev || Date.parse(ts) > Date.parse(prev)) {
      next[field] = ts;
    }
  }
  return {
    hfRecoveryCursorByField: next,
    lastRecoverySweepAt: new Date().toISOString(),
    recoverySweepCount: cursor.recoverySweepCount + 1,
  };
}

export function buildHfObservabilitySnapshot(args: {
  window: HfQueryWindow;
  config: HfRecoveryPolicyV2Config;
  providerBucketCount: number;
  newBucketCount: number;
  duplicateBucketCount: number;
  revisionBucketCount: number;
  recoveredLateBucketCount: number;
  queryDurationMs: number;
  querySuccess: boolean;
  queryZeroResult: boolean;
  watermarkState: HfCommittedWatermarkState;
  recoveryCursor: HfRecoveryCursorState;
}): Record<string, unknown> {
  const latestBucketAgeMs =
    args.providerBucketCount > 0
      ? Math.max(0, args.window.queryTo.getTime() - args.window.queryFrom.getTime())
      : null;
  const coverageValues = Object.values(args.watermarkState.hfQueryCoverageByField)
    .map((v) => Date.parse(v))
    .filter(Number.isFinite);
  const dataValues = Object.values(args.watermarkState.hfWatermarkByField)
    .map((v) => Date.parse(v))
    .filter(Number.isFinite);
  const coverageMax = coverageValues.length ? Math.max(...coverageValues) : null;
  const dataMax = dataValues.length ? Math.max(...dataValues) : null;

  return {
    event: 'hf_acquisition_cycle',
    policy_v2_enabled: args.config.mode === 'V2',
    recovery_sweep_enabled: args.config.recoverySweepEnabled,
    policy_version: HF_RECOVERY_POLICY_V2_VERSION,
    hf_query_from: args.window.queryFrom.toISOString(),
    hf_query_to: args.window.queryTo.toISOString(),
    settlement_delay_ms: args.window.settlementDelayMs,
    overlap_ms: args.window.recoveryOverlapMs,
    provider_bucket_count: args.providerBucketCount,
    new_bucket_count: args.newBucketCount,
    duplicate_bucket_count: args.duplicateBucketCount,
    revision_bucket_count: args.revisionBucketCount,
    recovered_late_bucket_count: args.recoveredLateBucketCount,
    latest_bucket_age_ms: latestBucketAgeMs,
    recovery_sweep_count: args.recoveryCursor.recoverySweepCount,
    query_duration_ms: args.queryDurationMs,
    query_success: args.querySuccess,
    query_zero_result: args.queryZeroResult,
    query_coverage_advance_ms: coverageMax,
    data_watermark_lag_ms:
      coverageMax != null && dataMax != null ? Math.max(0, coverageMax - dataMax) : null,
    recovery_cursor_lag_ms:
      coverageMax != null
        ? Math.max(
            0,
            coverageMax -
              Math.max(
                0,
                ...Object.values(args.recoveryCursor.hfRecoveryCursorByField).map((v) => Date.parse(v)),
              ),
          )
        : null,
    parameters_validated: false,
  };
}

export function emptyWatermarkState(): HfCommittedWatermarkState {
  return normalizeHfCommittedWatermarkState({
    hfWatermarkAt: null,
    hfWatermarkByField: {},
    hfQueryCoverageByField: {},
  });
}
