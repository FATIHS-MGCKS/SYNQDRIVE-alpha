import type {
  HfSignalGroup,
  HfSignalPoint,
  HfWindowCoverage,
  HfWindowScalarStats,
  HfWindowStatsJson,
  HfWindowSummary,
} from '@modules/clickhouse/clickhouse-hf.types';

/**
 * HF window bucket size for post-trip evidence aggregation.
 *
 * **60 seconds** — chosen deliberately:
 * - Post-trip HF is ~1 Hz; one window ≈ 60 samples → stable min/max/avg without
 *   scanning raw points on every Data Analyse query.
 * - Halves row volume vs 30s while still resolving gaps >3s inside a minute.
 * - Aligns with the snapshot tier (~30s) as the next coarser analytics layer
 *   between raw 1s points and trip-level summaries.
 */
export const HF_WINDOW_SIZE_MS = 60_000;

/** Gaps longer than this on the speed stream count as missing data. */
export const HF_WINDOW_GAP_THRESHOLD_MS = 3_000;

/** Expected ~1 Hz HF cadence after post-trip fetch. */
export const HF_WINDOW_EXPECTED_INTERVAL_MS = 1_000;

const SPEED_SIGNAL = 'speed';
const RPM_SIGNAL = 'powertrainCombustionEngineSpeed';
const THROTTLE_SIGNAL = 'obdThrottlePosition';
const LOAD_SIGNAL = 'obdEngineLoad';
const TRACTION_SIGNAL = 'powertrainTractionBatteryCurrentPower';
const SOC_SIGNAL = 'powertrainTractionBatteryStateOfChargeCurrent';

export interface HfWindowProducerContext {
  orgId: string;
  vehicleId: string;
  tripId: string;
  bookingId?: string | null;
}

interface WindowBucket {
  index: number;
  windowStart: Date;
  windowEnd: Date;
  points: HfSignalPoint[];
}

/**
 * Builds ReplacingMergeTree-safe HF window rows from normalized HF points.
 * Pure — no ClickHouse / Nest dependencies.
 */
export function buildHfWindowSummaries(
  ctx: HfWindowProducerContext,
  points: HfSignalPoint[],
): HfWindowSummary[] {
  if (!points.length) return [];

  const sorted = [...points].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  );
  const tripStartMs = sorted[0]!.recordedAt.getTime();
  const tripEndMs = sorted[sorted.length - 1]!.recordedAt.getTime();

  const buckets = new Map<number, WindowBucket>();

  for (const point of sorted) {
    const t = point.recordedAt.getTime();
    const index = Math.floor((t - tripStartMs) / HF_WINDOW_SIZE_MS);
    let bucket = buckets.get(index);
    if (!bucket) {
      const windowStartMs = tripStartMs + index * HF_WINDOW_SIZE_MS;
      const windowEndMs = Math.min(
        windowStartMs + HF_WINDOW_SIZE_MS,
        tripEndMs,
      );
      bucket = {
        index,
        windowStart: new Date(windowStartMs),
        windowEnd: new Date(windowEndMs),
        points: [],
      };
      buckets.set(index, bucket);
    }
    bucket.points.push(point);
  }

  const summaries: HfWindowSummary[] = [];

  for (const bucket of [...buckets.values()].sort((a, b) => a.index - b.index)) {
    const byGroup = groupPointsBySignalGroup(bucket.points);
    const speedTimestamps = bucket.points
      .filter((p) => p.signalName === SPEED_SIGNAL && p.valueFloat != null)
      .map((p) => p.recordedAt.getTime())
      .sort((a, b) => a - b);
    const gapStats = computeGapStats(speedTimestamps);
    const gpsCount = countGpsPoints(bucket.points);

    for (const [group, groupPoints] of byGroup.entries()) {
      if (groupPoints.length === 0) continue;

      const intervals = computeIntervals(
        groupPoints.map((p) => p.recordedAt.getTime()).sort((a, b) => a - b),
      );
      const statsJson = buildStatsJson(group, groupPoints);
      const coverage = classifyWindowCoverage(group, groupPoints, statsJson);

      const speedValues = scalarValues(groupPoints, SPEED_SIGNAL);
      const tractionValues = scalarValues(groupPoints, TRACTION_SIGNAL);
      const socValues = scalarValues(groupPoints, SOC_SIGNAL);

      const accel = computeAccelFromSpeed(speedTimestamps, bucket.points);

      summaries.push({
        orgId: ctx.orgId,
        vehicleId: ctx.vehicleId,
        tripId: ctx.tripId,
        bookingId: ctx.bookingId ?? null,
        windowStart: bucket.windowStart,
        windowEnd: bucket.windowEnd,
        signalGroup: group,
        pointCount: groupPoints.length,
        sampleIntervalMinMs: intervals.min,
        sampleIntervalMaxMs: intervals.max,
        sampleIntervalAvgMs: intervals.avg,
        maxSpeedKmh: speedValues.length ? Math.max(...speedValues) : null,
        maxAccelMps2: accel.max,
        minAccelMps2: accel.min,
        maxTractionKw: tractionValues.length ? Math.max(...tractionValues) : null,
        minTractionKw: tractionValues.length ? Math.min(...tractionValues) : null,
        socDeltaPct:
          socValues.length >= 2
            ? Math.max(...socValues) - Math.min(...socValues)
            : null,
        gpsPointCount: group === 'gps' ? gpsCount : 0,
        missingGapCount: group === 'speed' ? gapStats.gapCount : 0,
        largestGapMs: group === 'speed' ? gapStats.largestGapMs : null,
        coverage,
        statsJson,
      });
    }
  }

  return summaries;
}

function groupPointsBySignalGroup(
  points: HfSignalPoint[],
): Map<HfSignalGroup, HfSignalPoint[]> {
  const map = new Map<HfSignalGroup, HfSignalPoint[]>();
  for (const p of points) {
    const list = map.get(p.signalGroup) ?? [];
    list.push(p);
    map.set(p.signalGroup, list);
  }
  return map;
}

function countGpsPoints(points: HfSignalPoint[]): number {
  const latTimes = new Set(
    points
      .filter((p) => p.signalName === 'currentLocationLatitude')
      .map((p) => p.recordedAt.getTime()),
  );
  return latTimes.size;
}

function scalarValues(points: HfSignalPoint[], signalName: string): number[] {
  return points
    .filter((p) => p.signalName === signalName && p.valueFloat != null)
    .map((p) => p.valueFloat as number)
    .filter((v) => Number.isFinite(v));
}

function buildScalarStats(values: number[]): HfWindowScalarStats | null {
  if (!values.length) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: sum / values.length,
    count: values.length,
  };
}

function buildStatsJson(
  group: HfSignalGroup,
  points: HfSignalPoint[],
): HfWindowStatsJson {
  const signalCounts: Record<string, number> = {};
  for (const p of points) {
    signalCounts[p.signalName] = (signalCounts[p.signalName] ?? 0) + 1;
  }

  const scalars: Record<string, HfWindowScalarStats> = {};
  const maybeAdd = (name: string, values: number[]) => {
    const stats = buildScalarStats(values);
    if (stats) scalars[name] = stats;
  };

  maybeAdd('speed', scalarValues(points, SPEED_SIGNAL));
  maybeAdd('rpm', scalarValues(points, RPM_SIGNAL));
  maybeAdd('throttle', scalarValues(points, THROTTLE_SIGNAL));
  maybeAdd('engineLoad', scalarValues(points, LOAD_SIGNAL));
  maybeAdd('tractionPowerKw', scalarValues(points, TRACTION_SIGNAL));
  maybeAdd('socPercent', scalarValues(points, SOC_SIGNAL));

  const socCount =
    group === 'battery' ? scalarValues(points, SOC_SIGNAL).length : undefined;

  return {
    signalCounts,
    ...(Object.keys(scalars).length > 0 ? { scalars } : {}),
    ...(socCount != null && socCount > 0 ? { socCount } : {}),
  };
}

function computeIntervals(timestampsMs: number[]): {
  min: number | null;
  max: number | null;
  avg: number | null;
} {
  if (timestampsMs.length < 2) {
    return { min: null, max: null, avg: null };
  }
  const deltas: number[] = [];
  for (let i = 1; i < timestampsMs.length; i++) {
    deltas.push(timestampsMs[i]! - timestampsMs[i - 1]!);
  }
  const sum = deltas.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...deltas),
    max: Math.max(...deltas),
    avg: sum / deltas.length,
  };
}

function computeGapStats(timestampsMs: number[]): {
  gapCount: number;
  largestGapMs: number | null;
} {
  if (timestampsMs.length < 2) {
    return { gapCount: 0, largestGapMs: null };
  }
  let gapCount = 0;
  let largestGapMs = 0;
  for (let i = 1; i < timestampsMs.length; i++) {
    const delta = timestampsMs[i]! - timestampsMs[i - 1]!;
    if (delta > HF_WINDOW_GAP_THRESHOLD_MS) {
      gapCount++;
      largestGapMs = Math.max(largestGapMs, delta);
    }
  }
  return {
    gapCount,
    largestGapMs: largestGapMs > 0 ? largestGapMs : null,
  };
}

function computeAccelFromSpeed(
  speedTimestampsMs: number[],
  points: HfSignalPoint[],
): { min: number | null; max: number | null } {
  if (speedTimestampsMs.length < 2) {
    return { min: null, max: null };
  }

  const speedByTime = new Map<number, number>();
  for (const p of points) {
    if (p.signalName !== SPEED_SIGNAL || p.valueFloat == null) continue;
    speedByTime.set(p.recordedAt.getTime(), p.valueFloat);
  }

  const accels: number[] = [];
  for (let i = 1; i < speedTimestampsMs.length; i++) {
    const t0 = speedTimestampsMs[i - 1]!;
    const t1 = speedTimestampsMs[i]!;
    const v0 = speedByTime.get(t0);
    const v1 = speedByTime.get(t1);
    if (v0 == null || v1 == null) continue;
    const dtSec = (t1 - t0) / 1000;
    if (dtSec <= 0) continue;
    const mps0 = (v0 * 1000) / 3600;
    const mps1 = (v1 * 1000) / 3600;
    accels.push((mps1 - mps0) / dtSec);
  }

  if (!accels.length) return { min: null, max: null };
  return { min: Math.min(...accels), max: Math.max(...accels) };
}

function classifyWindowCoverage(
  group: HfSignalGroup,
  points: HfSignalPoint[],
  stats: HfWindowStatsJson,
): HfWindowCoverage {
  if (points.length === 0) return 'unavailable';

  const expectedSamples = HF_WINDOW_SIZE_MS / HF_WINDOW_EXPECTED_INTERVAL_MS;
  const primaryCount =
    group === 'speed'
      ? (stats.scalars?.speed?.count ?? points.length)
      : group === 'gps'
        ? countGpsPoints(points)
        : points.length;

  const ratio = primaryCount / expectedSamples;
  if (ratio >= 0.7) return 'good';
  if (ratio >= 0.35) return 'medium';
  if (primaryCount > 0) return 'weak';
  return 'unavailable';
}
