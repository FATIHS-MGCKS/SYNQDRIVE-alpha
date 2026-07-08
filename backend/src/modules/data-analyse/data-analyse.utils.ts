import {
  DEFAULT_SNAPSHOT_EXPECTED_INTERVAL_MS,
  HEALTH_STALE_THRESHOLD_MS,
  HIGH_FREQUENCY_THRESHOLD_MS,
  LAUNCH_DETECTION_MIN_INTERVAL_MS,
  MAX_PLAUSIBLE_CADENCE_INTERVAL_MS,
} from './data-analyse.constants';
import { resolveHfMirrorFlagStatus } from '@modules/clickhouse/clickhouse-env.util';
import type {
  DataFreshnessStatus,
  HealthCalcFreshness,
  HfAvailabilityStatus,
  HfDetectionQuality,
  HfMirrorStatus,
  HfReliabilityStatus,
  IntervalStatus,
  LaunchDetectionUsefulness,
  LaunchFeasibility,
} from './data-analyse.types';
import { LAUNCH_REQUIRED_SIGNALS } from './data-analyse-signal-catalog';

export function computeIntervalStats(
  intervalsMs: number[],
  maxPlausibleCadenceMs: number = MAX_PLAUSIBLE_CADENCE_INTERVAL_MS,
): {
  averageMs: number | null;
  medianMs: number | null;
  p95Ms: number | null;
  fastestMs: number | null;
  slowestMs: number | null;
  dropoutCount: number;
  longestGapMs: number | null;
} {
  const valid = intervalsMs.filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length === 0) {
    return {
      averageMs: null,
      medianMs: null,
      p95Ms: null,
      fastestMs: null,
      slowestMs: null,
      dropoutCount: 0,
      longestGapMs: null,
    };
  }

  const expected = DEFAULT_SNAPSHOT_EXPECTED_INTERVAL_MS;
  // Gap metrics use the FULL set (offline gaps are legitimate gap evidence).
  const dropoutCount = valid.filter((v) => v > expected * 3).length;
  const longestGapMs = Math.max(...valid);

  // Cadence metrics (avg/median/p95/fastest/slowest) exclude implausible offline
  // gaps so a single multi-day outlier cannot distort the reported cadence.
  const cadence = valid.filter((v) => v <= maxPlausibleCadenceMs);
  const basis = cadence.length > 0 ? cadence : valid;
  const sorted = [...basis].sort((a, b) => a - b);
  const sum = basis.reduce((a, b) => a + b, 0);
  const averageMs = Math.round(sum / basis.length);
  const medianMs = Math.round(percentile(sorted, 0.5));
  const p95Ms = Math.round(percentile(sorted, 0.95));
  const fastestMs = sorted[0];
  const slowestMs = sorted[sorted.length - 1];

  return {
    averageMs,
    medianMs,
    p95Ms,
    fastestMs,
    slowestMs,
    dropoutCount,
    longestGapMs,
  };
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[idx];
}

export function classifyReliabilityStatus(params: {
  sampleCount24h: number | null;
  medianIntervalMs: number | null;
  expectedIntervalMs: number | null;
  hasPersistedValue: boolean;
}): HfReliabilityStatus {
  if (!params.hasPersistedValue || params.sampleCount24h === 0) return 'MISSING';
  if (params.sampleCount24h == null || params.medianIntervalMs == null) return 'MISSING';
  const expected = params.expectedIntervalMs ?? DEFAULT_SNAPSHOT_EXPECTED_INTERVAL_MS;
  if (params.medianIntervalMs <= expected * 1.5) return 'GOOD';
  if (params.medianIntervalMs <= expected * 4) return 'WATCH';
  return 'POOR';
}

export function assessLaunchDetectionUsefulness(params: {
  signalKey: string;
  reliabilityStatus: HfReliabilityStatus;
  medianIntervalMs: number | null;
  sampleCount24h: number | null;
}): LaunchDetectionUsefulness {
  const launchSignals = new Set([
    'speed',
    'engine_load',
    'longitudinal_acceleration',
    'acceleration',
    'throttle_position',
    'throttle',
    'engine_rpm',
    'rpm',
  ]);
  if (!launchSignals.has(params.signalKey)) return 'UNKNOWN';
  if (params.reliabilityStatus === 'MISSING') return 'NOT_POSSIBLE';
  const interval = params.medianIntervalMs;
  if (interval == null || (params.sampleCount24h ?? 0) < 3) return 'UNKNOWN';
  if (interval <= LAUNCH_DETECTION_MIN_INTERVAL_MS * 2) return 'POSSIBLE';
  if (interval <= LAUNCH_DETECTION_MIN_INTERVAL_MS * 8) return 'LIMITED';
  return 'NOT_POSSIBLE';
}

export function classifyIntervalStatus(
  observedIntervalMs: number | null,
  expectedIntervalMs: number | null,
  hasValue: boolean,
): IntervalStatus {
  if (!hasValue) return 'Missing';
  if (observedIntervalMs == null || expectedIntervalMs == null) return 'Unknown';
  if (observedIntervalMs <= expectedIntervalMs * 1.5) return 'OK';
  if (observedIntervalMs <= expectedIntervalMs * 3) return 'Delayed';
  return 'Sparse';
}

export function classifyDataFreshness(
  lastSeenMs: number | null,
  nowMs: number,
  onlineThresholdMs: number,
  standbyThresholdMs: number,
): DataFreshnessStatus {
  if (lastSeenMs == null) return 'insufficient_data';
  const age = nowMs - lastSeenMs;
  if (age < 0) return 'unknown';
  if (age <= onlineThresholdMs) return 'fresh';
  if (age <= standbyThresholdMs) return 'stale';
  return 'offline';
}

export function classifyHfDetectionQuality(
  averageIntervalMs: number | null,
  hasPersistedHf: boolean,
): HfDetectionQuality {
  if (!hasPersistedHf && averageIntervalMs == null) return 'Not available';
  const interval = averageIntervalMs ?? DEFAULT_SNAPSHOT_EXPECTED_INTERVAL_MS;
  if (interval <= HIGH_FREQUENCY_THRESHOLD_MS) return 'Good for detection';
  if (interval <= LAUNCH_DETECTION_MIN_INTERVAL_MS * 4) return 'Borderline';
  return 'Too sparse';
}

export function assessLaunchFeasibility(params: {
  availableSignalNames: string[];
  speedIntervalMs: number | null;
  hasWaypointStream: boolean;
  snapshotOnly: boolean;
}): {
  feasibility: LaunchFeasibility;
  recommendation: string;
  reasons: string[];
  missingSignals: string[];
} {
  const available = new Set(params.availableSignalNames.map((s) => s.toLowerCase()));
  const missingSignals = LAUNCH_REQUIRED_SIGNALS.filter(
    (s) => !available.has(s.toLowerCase()) && !aliasPresent(s, available),
  );

  const reasons: string[] = [];
  if (params.snapshotOnly) {
    reasons.push(
      'Only snapshot-level telemetry available (typical ~30s DIMO poll).',
    );
  }
  if (params.speedIntervalMs != null) {
    reasons.push(`Observed speed sample interval ~${Math.round(params.speedIntervalMs / 1000)}s.`);
  }
  if (!params.hasWaypointStream) {
    reasons.push('No high-frequency waypoint stream persisted in ClickHouse.');
  }
  if (missingSignals.length > 0) {
    reasons.push(`Missing signals: ${missingSignals.join(', ')}.`);
  }

  let feasibility: LaunchFeasibility;
  let recommendation: string;

  const speedOk =
    params.speedIntervalMs != null &&
    params.speedIntervalMs <= LAUNCH_DETECTION_MIN_INTERVAL_MS * 2;
  const hasAccel = available.has('longitudinal_acceleration') || available.has('acceleration');

  if (params.speedIntervalMs == null && !params.hasWaypointStream) {
    feasibility = 'Not enough data';
    recommendation = 'Cannot assess launch-like events — insufficient persisted telemetry.';
  } else if (speedOk && (hasAccel || params.hasWaypointStream)) {
    feasibility = 'Possible but weak';
    recommendation = 'Can be used for rough aggressive start detection with caveats.';
  } else if (params.snapshotOnly || (params.speedIntervalMs ?? Infinity) > LAUNCH_DETECTION_MIN_INTERVAL_MS * 4) {
    feasibility = 'Not reliable';
    recommendation =
      'Cannot reliably detect launch-like events with current interval — need faster acceleration/speed/throttle samples.';
  } else {
    feasibility = 'Possible but weak';
    recommendation = 'Limited detection possible; confirm with HF streams before production use.';
  }

  return { feasibility, recommendation, reasons, missingSignals };
}

function aliasPresent(required: string, available: Set<string>): boolean {
  const aliases: Record<string, string[]> = {
    speed: ['speed', 'speed_kmh'],
    longitudinal_acceleration: ['acceleration', 'longitudinal_acceleration'],
    throttle_position: ['throttle', 'throttle_position', 'engine_load'],
    engine_rpm: ['rpm', 'engine_rpm'],
    movement_start: ['ignition', 'movement_start'],
    trip_start_context: ['ignition', 'trip_start_context'],
  };
  const list = aliases[required];
  if (!list) return false;
  return list.some((a) => available.has(a));
}

export function classifyHealthFreshness(
  lastAt: Date | string | null | undefined,
  nowMs: number,
): HealthCalcFreshness {
  if (!lastAt) return 'not_available';
  const ms = lastAt instanceof Date ? lastAt.getTime() : new Date(lastAt).getTime();
  if (!Number.isFinite(ms)) return 'unknown';
  if (nowMs - ms <= HEALTH_STALE_THRESHOLD_MS) return 'current';
  return 'stale';
}

export function formatSignalValue(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.length > 0 ? `[${value.length} items]` : null;
  if (typeof value === 'object') return '[object]';
  return String(value);
}

export function filterConnectedVehicles<T extends { connectionStatus: string }>(
  vehicles: T[],
): T[] {
  return vehicles.filter(
    (v) => v.connectionStatus === 'online' || v.connectionStatus === 'standby',
  );
}

export function tenantVehicleWhere(orgId: string, vehicleId: string) {
  return { id: vehicleId, organizationId: orgId };
}

/**
 * Pure HF-availability decision used by the Data Analyse page. Keeps the
 * "is there REAL high-frequency telemetry?" logic in one testable place so the
 * UI can never contradict itself (e.g. "HF active" + "snapshot-only").
 *
 * Concepts are kept strictly separate:
 *   - telemetry_waypoints   → route/waypoint stream (lat/lng/speed)
 *   - telemetry_hf_points   → real 1s/post-trip HF signal points
 *   - sub-2s cadence        → a per-signal interval at the HF threshold (<=2s)
 *
 * `snapshotOnly` means there is NO HF evidence of any kind — only
 * snapshot/latest-state telemetry (~30s). Crucially, "waypoints missing" is
 * NOT the same as "HF missing": HF points alone make the vehicle HF-capable.
 */
export interface HfAvailabilityInput {
  waypointCount: number | null;
  hfPointCount24h: number | null;
  hasSubSecondCadence: boolean;
  /**
   * ~30s snapshot/latest-state samples (24h). Optional — only used to tell
   * `snapshot_only` (vehicle reports, but no HF) apart from `missing` (no
   * telemetry at all). Older callers omit it; the aggregated status then
   * collapses both into `missing`/`unknown` conservatively.
   */
  snapshotSampleCount24h?: number | null;
}

/** Combined HF/waypoint volume (24h) below which HF is treated as `sparse`. */
const HF_SPARSE_SAMPLE_THRESHOLD = 20;

export interface HfAvailabilityDecision {
  /** Real high-frequency evidence exists (waypoints OR hf_points OR sub-2s). */
  available: boolean;
  /** No HF evidence of any kind — snapshot/latest-state telemetry only. */
  snapshotOnly: boolean;
  hasWaypoints: boolean;
  hasHfPoints: boolean;
  /** Aggregated, operator-facing label (single source of truth for the UI). */
  status: HfAvailabilityStatus;
}

export function deriveHfAvailability(
  input: HfAvailabilityInput,
): HfAvailabilityDecision {
  const hasWaypoints = (input.waypointCount ?? 0) > 0;
  const hasHfPoints = (input.hfPointCount24h ?? 0) > 0;
  const available = hasWaypoints || hasHfPoints || input.hasSubSecondCadence;

  const status = deriveHfAvailabilityStatus(input, {
    hasWaypoints,
    hasHfPoints,
    available,
  });

  return {
    available,
    snapshotOnly: !available,
    hasWaypoints,
    hasHfPoints,
    status,
  };
}

function deriveHfAvailabilityStatus(
  input: HfAvailabilityInput,
  derived: { hasWaypoints: boolean; hasHfPoints: boolean; available: boolean },
): HfAvailabilityStatus {
  // Sub-2s cadence is the strongest possible signal — definitely HF-capable.
  if (input.hasSubSecondCadence) return 'hf_available';

  if (derived.hasWaypoints || derived.hasHfPoints) {
    const combined = (input.waypointCount ?? 0) + (input.hfPointCount24h ?? 0);
    return combined >= HF_SPARSE_SAMPLE_THRESHOLD ? 'hf_available' : 'sparse';
  }

  // No HF evidence. Decide between snapshot-only, missing, and unknown using
  // whatever telemetry-presence info the caller supplied.
  const waypointKnown = input.waypointCount != null;
  const hfKnown = input.hfPointCount24h != null;
  const snapshotKnown = input.snapshotSampleCount24h != null;

  if ((input.snapshotSampleCount24h ?? 0) > 0) return 'snapshot_only';
  if (waypointKnown || hfKnown || snapshotKnown) return 'missing';
  return 'unknown';
}

/**
 * Derives the HF mirror status from the environment flag the way HfMirrorService
 * reads it. Read-only diagnostic — does not toggle anything. Returns 'unknown'
 * only when the flag is absent AND we cannot otherwise infer it.
 */
export function resolveHfMirrorStatus(
  raw: string | undefined = process.env.HF_MIRROR_ENABLED,
): HfMirrorStatus {
  const status = resolveHfMirrorFlagStatus(raw);
  return status;
}

/**
 * Human-readable explanation for a skipped trip enrichment, derived from the
 * granular reason persisted in `vehicle_trips.behavior_enrichment_error` by the
 * TripEnrichmentOrchestrator. Keeps the Data Analyse "Trip processing" trace
 * explainable ("why was this trip not enriched?") instead of just showing the
 * opaque `SKIPPED_NO_HF_DATA` status.
 */
export function describeEnrichmentSkip(error: string | null | undefined): string {
  switch (error) {
    case 'capability':
      return 'vehicle not enrichable (missing DIMO token / vehicle).';
    case 'insufficient_points':
      return 'high-frequency stream too sparse (<10 raw / <5 clean points).';
    case 'no_hf_data':
      return 'no data / trip not eligible (no endTime / too short).';
    default:
      return 'insufficient high-frequency data (cloud/snapshot-only vehicle).';
  }
}
