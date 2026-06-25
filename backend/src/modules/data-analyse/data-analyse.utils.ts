import {
  DEFAULT_SNAPSHOT_EXPECTED_INTERVAL_MS,
  HEALTH_STALE_THRESHOLD_MS,
  HIGH_FREQUENCY_THRESHOLD_MS,
  LAUNCH_DETECTION_MIN_INTERVAL_MS,
  MAX_PLAUSIBLE_CADENCE_INTERVAL_MS,
} from './data-analyse.constants';
import type {
  DataFreshnessStatus,
  HealthCalcFreshness,
  HfDetectionQuality,
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
