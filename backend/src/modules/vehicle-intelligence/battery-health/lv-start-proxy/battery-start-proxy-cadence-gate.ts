import { BatteryMeasurementQuality } from '@prisma/client';
import type { BatteryStartProxyCrankPoint } from './battery-start-proxy.policy';
import {
  BATTERY_START_PROXY_WINDOW_AFTER_MS,
  BATTERY_START_PROXY_WINDOW_BEFORE_MS,
} from './battery-start-proxy.policy';

/** Documented gate contract — bump when thresholds or decision order change. */
export const START_PROXY_CADENCE_GATE_VERSION = '1.0.0';

export const START_PROXY_RECOVERY_5S_TARGET_MS = 5_000;
export const START_PROXY_RECOVERY_30S_TARGET_MS = 30_000;
export const START_PROXY_RECOVERY_TOLERANCE_MS = 5_000;

const EXPECTED_PROVIDER_CADENCE_MS = 5_000;
const MEDIAN_CADENCE_FAIL_MS = 7_500;
const MAX_INTERVAL_CADENCE_FAIL_MS = 20_000;
const MIN_COVERAGE_RATIO = 0.15;
const DUPLICATE_SHARE_FAIL = 0.4;
const PROVIDER_DELAY_FAIL_MS = 180_000;

export type StartProxyRecoveryLabel =
  | 'RECOVERY_5S'
  | 'RECOVERY_30S'
  | 'RECOVERY_PROXY';

export type StartProxyRecoveryPoint = {
  label: StartProxyRecoveryLabel;
  voltage: number | null;
  observedAt: string;
  offsetFromTargetMs: number;
  withinTolerance: boolean;
};

export type StartProxyCadenceGateMetrics = {
  gateVersion: string;
  pointCount: number;
  pointsBeforeStart: number;
  pointsAfterStart: number;
  medianIntervalMs: number | null;
  maxIntervalMs: number | null;
  coverageRatio: number;
  nearestPreStart: {
    observedAt: string;
    offsetFromStartMs: number;
    voltage: number | null;
  } | null;
  recovery5s: StartProxyRecoveryPoint | null;
  recovery30s: StartProxyRecoveryPoint | null;
  providerDelayMs: number | null;
  duplicateShare: number;
};

export type StartProxyCadenceGateValues = {
  vPreCrank: number | null;
  vMinCrank: number | null;
  vRecovery5s: number | null;
  vRecovery30s: number | null;
  recovery5sLabel: StartProxyRecoveryLabel | null;
  recovery30sLabel: StartProxyRecoveryLabel | null;
};

export type StartProxyCadenceGateResult =
  | {
      ok: true;
      quality: typeof BatteryMeasurementQuality.VALID_PROXY;
      reasonCode: 'valid_proxy';
      reasonLabel: string;
      metrics: StartProxyCadenceGateMetrics;
      values: StartProxyCadenceGateValues;
    }
  | {
      ok: false;
      quality:
        | typeof BatteryMeasurementQuality.NO_DATA
        | typeof BatteryMeasurementQuality.INSUFFICIENT_CADENCE
        | typeof BatteryMeasurementQuality.INSUFFICIENT_COVERAGE
        | typeof BatteryMeasurementQuality.PROVIDER_DELAY
        | typeof BatteryMeasurementQuality.TIMESTAMP_INCONSISTENT
        | typeof BatteryMeasurementQuality.UNSUPPORTED_PROFILE;
      reasonCode: string;
      reasonLabel: string;
      metrics: StartProxyCadenceGateMetrics;
      values: null;
    };

type NormalizedPoint = BatteryStartProxyCrankPoint & { observedAtMs: number };

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function normalizePoints(points: BatteryStartProxyCrankPoint[]): NormalizedPoint[] {
  return points
    .map((point) => ({
      ...point,
      observedAtMs: new Date(point.timestamp).getTime(),
    }))
    .filter((point) => Number.isFinite(point.observedAtMs))
    .sort((a, b) => a.observedAtMs - b.observedAtMs);
}

function computeIntervalsMs(points: NormalizedPoint[]): number[] {
  const intervals: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    intervals.push(points[i].observedAtMs - points[i - 1].observedAtMs);
  }
  return intervals;
}

function computeDuplicateShare(points: NormalizedPoint[]): number {
  if (points.length <= 1) return 0;
  const seen = new Map<string, number>();
  for (const point of points) {
    const key = `${point.observedAtMs}:${point.voltage ?? 'null'}:${point.rpm ?? 'null'}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  let duplicates = 0;
  for (const count of seen.values()) {
    if (count > 1) {
      duplicates += count - 1;
    }
  }
  return duplicates / points.length;
}

function computeCoverageRatio(
  points: NormalizedPoint[],
  windowFromMs: number,
  windowToMs: number,
): number {
  const inWindow = points.filter(
    (point) => point.observedAtMs >= windowFromMs && point.observedAtMs <= windowToMs,
  );
  const uniqueBuckets = new Set(
    inWindow.map((point) =>
      Math.floor((point.observedAtMs - windowFromMs) / EXPECTED_PROVIDER_CADENCE_MS),
    ),
  );
  const expectedBuckets =
    Math.ceil((windowToMs - windowFromMs) / EXPECTED_PROVIDER_CADENCE_MS) + 1;
  if (expectedBuckets <= 0) return 0;
  return Math.min(1, uniqueBuckets.size / expectedBuckets);
}

function nearestPreStartPoint(
  points: NormalizedPoint[],
  tripStartMs: number,
): StartProxyCadenceGateMetrics['nearestPreStart'] {
  const before = points.filter((point) => point.observedAtMs <= tripStartMs);
  if (before.length === 0) return null;
  const nearest = before[before.length - 1];
  return {
    observedAt: nearest.timestamp,
    offsetFromStartMs: nearest.observedAtMs - tripStartMs,
    voltage: nearest.voltage,
  };
}

function nearestRecoveryPoint(
  points: NormalizedPoint[],
  tripStartMs: number,
  targetOffsetMs: number,
  strictLabel: 'RECOVERY_5S' | 'RECOVERY_30S',
): StartProxyRecoveryPoint | null {
  const targetMs = tripStartMs + targetOffsetMs;
  const afterStart = points.filter((point) => point.observedAtMs >= tripStartMs);
  if (afterStart.length === 0) return null;

  let nearest = afterStart[0];
  let nearestDistance = Math.abs(nearest.observedAtMs - targetMs);
  for (const point of afterStart.slice(1)) {
    const distance = Math.abs(point.observedAtMs - targetMs);
    if (distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }

  const offsetFromTargetMs = nearest.observedAtMs - targetMs;
  const withinTolerance =
    Math.abs(offsetFromTargetMs) <= START_PROXY_RECOVERY_TOLERANCE_MS;

  return {
    label: withinTolerance ? strictLabel : 'RECOVERY_PROXY',
    voltage: nearest.voltage,
    observedAt: nearest.timestamp,
    offsetFromTargetMs,
    withinTolerance,
  };
}

function buildMetrics(
  points: NormalizedPoint[],
  tripStartAt: Date,
  evaluatedAt: Date,
): StartProxyCadenceGateMetrics {
  const tripStartMs = tripStartAt.getTime();
  const windowFromMs = tripStartMs - BATTERY_START_PROXY_WINDOW_BEFORE_MS;
  const windowToMs = tripStartMs + BATTERY_START_PROXY_WINDOW_AFTER_MS;
  const intervals = computeIntervalsMs(points);
  const maxPointMs =
    points.length > 0 ? points[points.length - 1].observedAtMs : null;

  return {
    gateVersion: START_PROXY_CADENCE_GATE_VERSION,
    pointCount: points.length,
    pointsBeforeStart: points.filter((point) => point.observedAtMs < tripStartMs).length,
    pointsAfterStart: points.filter((point) => point.observedAtMs >= tripStartMs).length,
    medianIntervalMs: median(intervals),
    maxIntervalMs: intervals.length > 0 ? Math.max(...intervals) : null,
    coverageRatio: computeCoverageRatio(points, windowFromMs, windowToMs),
    nearestPreStart: nearestPreStartPoint(points, tripStartMs),
    recovery5s: nearestRecoveryPoint(
      points,
      tripStartMs,
      START_PROXY_RECOVERY_5S_TARGET_MS,
      'RECOVERY_5S',
    ),
    recovery30s: nearestRecoveryPoint(
      points,
      tripStartMs,
      START_PROXY_RECOVERY_30S_TARGET_MS,
      'RECOVERY_30S',
    ),
    providerDelayMs:
      maxPointMs == null ? null : Math.max(0, evaluatedAt.getTime() - maxPointMs),
    duplicateShare: computeDuplicateShare(points),
  };
}

function extractValues(
  points: NormalizedPoint[],
  tripStartMs: number,
  metrics: StartProxyCadenceGateMetrics,
): StartProxyCadenceGateValues {
  const crankZone = points.filter((point) => {
    const offset = point.observedAtMs - tripStartMs;
    return offset >= -30_000 && offset <= 30_000 && point.voltage != null;
  });
  const crankVoltages = crankZone
    .map((point) => point.voltage)
    .filter((v): v is number => v != null);

  return {
    vPreCrank: metrics.nearestPreStart?.voltage ?? null,
    vMinCrank: crankVoltages.length > 0 ? Math.min(...crankVoltages) : null,
    vRecovery5s:
      metrics.recovery5s?.withinTolerance ? metrics.recovery5s.voltage : null,
    vRecovery30s:
      metrics.recovery30s?.withinTolerance ? metrics.recovery30s.voltage : null,
    recovery5sLabel: metrics.recovery5s?.label ?? null,
    recovery30sLabel: metrics.recovery30s?.label ?? null,
  };
}

export function evaluateStartProxyCadenceGate(input: {
  points: BatteryStartProxyCrankPoint[];
  tripStartAt: Date;
  evaluatedAt?: Date;
}): StartProxyCadenceGateResult {
  const evaluatedAt = input.evaluatedAt ?? new Date();
  const normalized = normalizePoints(input.points);
  const metrics = buildMetrics(normalized, input.tripStartAt, evaluatedAt);

  if (normalized.length === 0) {
    return {
      ok: false,
      quality: BatteryMeasurementQuality.NO_DATA,
      reasonCode: 'no_data',
      reasonLabel: 'Keine Provider-Punkte im Startfenster',
      metrics,
      values: null,
    };
  }

  if (metrics.duplicateShare >= DUPLICATE_SHARE_FAIL) {
    return {
      ok: false,
      quality: BatteryMeasurementQuality.TIMESTAMP_INCONSISTENT,
      reasonCode: 'timestamp_inconsistent',
      reasonLabel: 'Zeitstempel/Werte zeigen hohen Duplikatanteil',
      metrics,
      values: null,
    };
  }

  const nonMonotonic = normalized.some(
    (point, index) => index > 0 && point.observedAtMs < normalized[index - 1].observedAtMs,
  );
  if (nonMonotonic) {
    return {
      ok: false,
      quality: BatteryMeasurementQuality.TIMESTAMP_INCONSISTENT,
      reasonCode: 'timestamp_inconsistent',
      reasonLabel: 'Provider-Zeitreihe ist nicht monoton',
      metrics,
      values: null,
    };
  }

  if (
    metrics.providerDelayMs != null &&
    metrics.providerDelayMs > PROVIDER_DELAY_FAIL_MS
  ) {
    return {
      ok: false,
      quality: BatteryMeasurementQuality.PROVIDER_DELAY,
      reasonCode: 'provider_delay',
      reasonLabel: 'Provider-Daten im Startfenster verzögert',
      metrics,
      values: null,
    };
  }

  if (
    metrics.medianIntervalMs == null ||
    metrics.medianIntervalMs > MEDIAN_CADENCE_FAIL_MS ||
    (metrics.maxIntervalMs != null && metrics.maxIntervalMs > MAX_INTERVAL_CADENCE_FAIL_MS)
  ) {
    return {
      ok: false,
      quality: BatteryMeasurementQuality.INSUFFICIENT_CADENCE,
      reasonCode: 'insufficient_cadence',
      reasonLabel: 'Provider-Kadenz zu grob für Start-Proxy-Auswertung',
      metrics,
      values: null,
    };
  }

  if (metrics.coverageRatio < MIN_COVERAGE_RATIO) {
    return {
      ok: false,
      quality: BatteryMeasurementQuality.INSUFFICIENT_COVERAGE,
      reasonCode: 'insufficient_coverage',
      reasonLabel: 'Zu wenig Abdeckung im Zielzeitraum',
      metrics,
      values: null,
    };
  }

  const values = extractValues(
    normalized,
    input.tripStartAt.getTime(),
    metrics,
  );

  return {
    ok: true,
    quality: BatteryMeasurementQuality.VALID_PROXY,
    reasonCode: 'valid_proxy',
    reasonLabel: 'Start-Proxy mit zulässiger Kadenz und Coverage',
    metrics,
    values,
  };
}

export function isStartProxyGateQualityWithValues(
  quality: BatteryMeasurementQuality,
): boolean {
  return quality === BatteryMeasurementQuality.VALID_PROXY;
}
