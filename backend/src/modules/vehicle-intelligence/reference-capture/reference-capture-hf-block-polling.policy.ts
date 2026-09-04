/**
 * DI-EV-0035C.1 — HF historical block polling scalability testbed (Reference Capture V2 only).
 *
 * API poll cadence != telemetry bucket resolution. Provisional 30s block polling is NOT validated.
 */
import {
  HF_REQUESTED_INTERVAL,
  type HfCommittedWatermarkState,
} from './reference-capture-hf-watermark-policy';
import type { HfRecoveryPolicyMode, HfRecoveryPolicyV2Config } from './reference-capture-hf-recovery-v2.policy';
import {
  PROVISIONAL_HF_POLL_INTERVAL_MS,
  HF_HISTORICAL_POLL_INTERVAL_MS_MIN,
  HF_HISTORICAL_POLL_INTERVAL_MS_MAX,
  type HfQueryWindow,
} from './reference-capture-hf-recovery-v2.policy';

export {
  PROVISIONAL_HF_POLL_INTERVAL_MS,
  HF_HISTORICAL_POLL_INTERVAL_MS_MIN,
  HF_HISTORICAL_POLL_INTERVAL_MS_MAX,
};

/** Controlled calibration matrix (ms). */
export const HF_POLL_CALIBRATION_CANDIDATES_MS = [10_000, 20_000, 30_000, 60_000] as const;

export const HF_BUCKET_AGGREGATION_INTERVAL = HF_REQUESTED_INTERVAL;

export const HF_30S_BLOCK_HYPOTHESIS = {
  statement:
    'One HF_HISTORICAL provider request approximately every 30 seconds can return historical aggregate buckets at ~1s/2s temporal density, making it substantially more request-efficient for Driving Intelligence than very frequent polling.',
  status: 'NOT_VALIDATED' as const,
};

export type HfBlockPollingConfig = {
  pollIntervalMs: number;
  /** When LEGACY, poll cadence follows runner cycle (every HF surface execution). */
  policyMode: HfRecoveryPolicyMode;
};

export function resolveHfBlockPollingConfig(
  config: HfRecoveryPolicyV2Config,
): HfBlockPollingConfig {
  return {
    pollIntervalMs: config.hfHistoricalPollIntervalMs,
    policyMode: config.mode,
  };
}

export function clampHfPollIntervalMs(value: number): number {
  return Math.min(
    HF_HISTORICAL_POLL_INTERVAL_MS_MAX,
    Math.max(HF_HISTORICAL_POLL_INTERVAL_MS_MIN, value),
  );
}

/** V2: poll only when interval elapsed. LEGACY: every runner cycle (surface always due). */
export function isHfHistoricalPollDue(args: {
  nowMs: number;
  lastHfHistoricalPollAt: string | null | undefined;
  pollIntervalMs: number;
  policyMode: HfRecoveryPolicyMode;
}): boolean {
  if (args.policyMode !== 'V2') return true;
  if (!args.lastHfHistoricalPollAt) return true;
  const last = Date.parse(args.lastHfHistoricalPollAt);
  if (!Number.isFinite(last)) return true;
  return args.nowMs - last >= args.pollIntervalMs;
}

/**
 * With coverage-driven queryFrom (coverage - overlap), slower polling does not leave unqueried gaps
 * as long as each poll advances coverage to safeQueryTo.
 */
export function verifyNoUnqueriedGap(args: {
  previousQueryCoverageTo: string | Date;
  nextQueryFrom: Date;
  recoveryOverlapMs: number;
}): boolean {
  const prevMs =
    typeof args.previousQueryCoverageTo === 'string'
      ? Date.parse(args.previousQueryCoverageTo)
      : args.previousQueryCoverageTo.getTime();
  if (!Number.isFinite(prevMs)) return true;
  const overlapStart = prevMs - args.recoveryOverlapMs;
  return args.nextQueryFrom.getTime() <= overlapStart + 1;
}

export function countUniqueTemporalBucketStarts(
  bucketTimestamps: string[],
): number {
  const seen = new Set<string>();
  for (const ts of bucketTimestamps) {
    const ms = Date.parse(ts);
    if (Number.isFinite(ms)) seen.add(new Date(ms).toISOString());
  }
  return seen.size;
}

export function computeBucketTemporalSpanMs(bucketTimestamps: string[]): {
  oldestReturnedBucketAgeMs: number | null;
  newestReturnedBucketAgeMs: number | null;
} {
  const parsed = bucketTimestamps.map((t) => Date.parse(t)).filter(Number.isFinite);
  if (!parsed.length) return { oldestReturnedBucketAgeMs: null, newestReturnedBucketAgeMs: null };
  const min = Math.min(...parsed);
  const max = Math.max(...parsed);
  const now = Date.now();
  return {
    oldestReturnedBucketAgeMs: Math.max(0, now - max),
    newestReturnedBucketAgeMs: Math.max(0, now - min),
  };
}

export function buildHfBlockDensityObservability(args: {
  window: HfQueryWindow;
  pollIntervalMs: number;
  policyMode: HfRecoveryPolicyMode;
  providerBucketCount: number;
  newBucketCount: number;
  duplicateBucketCount: number;
  revisionBucketCount: number;
  uniqueTemporalBucketStartCount: number;
  bucketTimestamps: string[];
  queryDurationMs: number;
  querySuccess: boolean;
  queryZeroResult: boolean;
  providerError: boolean;
}): Record<string, unknown> {
  const windowDurationMs = args.window.queryTo.getTime() - args.window.queryFrom.getTime();
  const span = computeBucketTemporalSpanMs(args.bucketTimestamps);
  const bucketsPerRequest =
    args.querySuccess && args.providerBucketCount > 0
      ? args.providerBucketCount
      : args.querySuccess
        ? 0
        : null;
  const requestsPerVehicleHour =
    args.policyMode === 'V2' && args.pollIntervalMs > 0
      ? 3_600_000 / args.pollIntervalMs
      : null;
  const temporalDensityPerMinute =
    args.uniqueTemporalBucketStartCount > 0 && windowDurationMs > 0
      ? (args.uniqueTemporalBucketStartCount / windowDurationMs) * 60_000
      : null;

  return {
    poll_interval_ms: args.policyMode === 'V2' ? args.pollIntervalMs : null,
    hf_api_poll_cadence_ms: args.policyMode === 'V2' ? args.pollIntervalMs : null,
    hf_provider_request_interval: HF_BUCKET_AGGREGATION_INTERVAL,
    hf_bucket_aggregation_interval: HF_BUCKET_AGGREGATION_INTERVAL,
    query_window_duration_ms: windowDurationMs,
    unique_temporal_bucket_start_count: args.uniqueTemporalBucketStartCount,
    oldest_returned_bucket_age_ms: span.oldestReturnedBucketAgeMs,
    newest_returned_bucket_age_ms: span.newestReturnedBucketAgeMs,
    provider_query_duration_ms: args.queryDurationMs,
    provider_query_success: args.querySuccess,
    provider_zero_result: args.queryZeroResult,
    provider_error: args.providerError,
    buckets_per_provider_request: bucketsPerRequest,
    requests_per_vehicle_hour: requestsPerVehicleHour,
    temporal_bucket_density_per_minute: temporalDensityPerMinute,
    hf_30s_block_polling_validated: false,
    parameters_validated: false,
  };
}

export type FleetRequestLoadRow = {
  activeVehicles: number;
  pollIntervalMs: number;
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
};

const REQUEST_LOAD_VEHICLE_COUNTS = [100, 500, 1000, 5000] as const;
const REQUEST_LOAD_POLL_INTERVALS_MS = [5_000, 10_000, 20_000, 30_000, 60_000] as const;

export function computeFleetRequestLoadModel(): FleetRequestLoadRow[] {
  const rows: FleetRequestLoadRow[] = [];
  for (const vehicles of REQUEST_LOAD_VEHICLE_COUNTS) {
    for (const intervalMs of REQUEST_LOAD_POLL_INTERVALS_MS) {
      const perVehiclePerSecond = 1000 / intervalMs;
      const rps = vehicles * perVehiclePerSecond;
      rows.push({
        activeVehicles: vehicles,
        pollIntervalMs: intervalMs,
        requestsPerSecond: rps,
        requestsPerMinute: rps * 60,
        requestsPerHour: rps * 3600,
      });
    }
  }
  return rows;
}

/**
 * Deterministic fleet stagger: spread vehicle poll instants across [0, pollIntervalMs).
 * Stable across process restarts (tokenId-based, not random).
 */
export function computeFleetStaggerOffsetMs(tokenId: number, pollIntervalMs: number): number {
  if (pollIntervalMs <= 0) return 0;
  const normalized = Math.abs(Math.trunc(tokenId));
  return normalized % pollIntervalMs;
}

export function computeStaggeredPollDeadlineMs(args: {
  tokenId: number;
  pollIntervalMs: number;
  lastPollAtMs: number | null;
  nowMs: number;
}): number {
  const offset = computeFleetStaggerOffsetMs(args.tokenId, args.pollIntervalMs);
  if (args.lastPollAtMs == null) {
    return args.nowMs;
  }
  const elapsed = args.nowMs - args.lastPollAtMs;
  if (elapsed >= args.pollIntervalMs) {
    return args.nowMs;
  }
  return args.lastPollAtMs + args.pollIntervalMs;
}

/** Distribute N simulated vehicles across poll window buckets (for planning tests). */
export function distributeFleetStaggerBuckets(
  vehicleTokenIds: number[],
  pollIntervalMs: number,
  bucketCount = 10,
): number[] {
  const buckets = new Array(bucketCount).fill(0);
  const bucketWidth = pollIntervalMs / bucketCount;
  for (const tokenId of vehicleTokenIds) {
    const offset = computeFleetStaggerOffsetMs(tokenId, pollIntervalMs);
    const idx = Math.min(bucketCount - 1, Math.floor(offset / bucketWidth));
    buckets[idx] += 1;
  }
  return buckets;
}

export function getMaxCoverageTimestamp(state: HfCommittedWatermarkState): string | null {
  const values = Object.values(state.hfQueryCoverageByField)
    .map((v) => Date.parse(v))
    .filter(Number.isFinite);
  if (!values.length) return null;
  return new Date(Math.max(...values)).toISOString();
}
