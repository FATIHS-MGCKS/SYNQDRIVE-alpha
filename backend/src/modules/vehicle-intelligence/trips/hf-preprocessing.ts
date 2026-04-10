import type { HighFrequencyReading } from '../../dimo/dimo-segments.service';

export interface CleanHfPoint {
  ts: number;
  speedKmh: number;
  speedMs: number;
  coolantC: number | null;
  rpm: number | null;
  throttlePct: number | null;
  loadPct: number | null;
  /** kW; DIMO + = into battery */
  tractionBatteryPowerKw: number | null;
}

const MAX_SPEED_KMH = 350;
const MAX_ACCEL_MS2 = 25;
const SMOOTHING_WINDOW = 3;

function isPlausibleSpeed(v: number): boolean {
  return v >= 0 && v <= MAX_SPEED_KMH;
}

function movingAverage(values: number[], windowSize: number): number[] {
  const half = Math.floor(windowSize / 2);
  return values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      sum += values[j];
      count++;
    }
    return sum / count;
  });
}

/**
 * Clean, validate, and smooth the raw 1-second HF time-series.
 * Returns a sorted array of usable data points with speed already in m/s.
 */
export function preprocessHighFrequency(
  raw: HighFrequencyReading[],
): CleanHfPoint[] {
  if (raw.length < 2) return [];

  const valid = raw
    .filter((r) => r.speedKmh != null && isPlausibleSpeed(r.speedKmh))
    .map((r) => ({
      ts: new Date(r.timestamp).getTime(),
      rawSpeedKmh: r.speedKmh!,
      coolantC: r.engineCoolantTempC,
      rpm: r.rpm,
      throttlePct: r.throttlePosition,
      loadPct: r.engineLoad,
      tractionBatteryPowerKw: r.tractionBatteryPowerKw ?? null,
    }))
    .sort((a, b) => a.ts - b.ts);

  if (valid.length < 2) return [];

  // Remove impossible acceleration spikes (pre-smoothing filter)
  const filtered: typeof valid = [valid[0]];
  for (let i = 1; i < valid.length; i++) {
    const dt = (valid[i].ts - valid[i - 1].ts) / 1000;
    if (dt <= 0) continue;
    const dv = Math.abs(valid[i].rawSpeedKmh - valid[i - 1].rawSpeedKmh) / 3.6;
    const accel = dv / dt;
    if (accel > MAX_ACCEL_MS2 && dt < 3) continue;
    filtered.push(valid[i]);
  }

  if (filtered.length < 2) return [];

  const smoothedSpeeds = movingAverage(
    filtered.map((p) => p.rawSpeedKmh),
    SMOOTHING_WINDOW,
  );

  return filtered.map((p, i) => ({
    ts: p.ts,
    speedKmh: smoothedSpeeds[i],
    speedMs: smoothedSpeeds[i] / 3.6,
    coolantC: p.coolantC,
    rpm: p.rpm,
    throttlePct: p.throttlePct,
    loadPct: p.loadPct,
    tractionBatteryPowerKw: p.tractionBatteryPowerKw,
  }));
}

/**
 * Split the cleaned time-series into contiguous segments.
 * A gap > maxGapMs starts a new segment.
 */
export function splitByGaps(
  points: CleanHfPoint[],
  maxGapMs = 5000,
): CleanHfPoint[][] {
  if (points.length === 0) return [];
  const segments: CleanHfPoint[][] = [[points[0]]];

  for (let i = 1; i < points.length; i++) {
    const gap = points[i].ts - points[i - 1].ts;
    if (gap > maxGapMs) {
      segments.push([points[i]]);
    } else {
      segments[segments.length - 1].push(points[i]);
    }
  }

  return segments.filter((s) => s.length >= 2);
}
