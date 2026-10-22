import type { MotionCorePositionBucket } from '../../kinematics/motion-core-grid';

const LAT0 = 50.0;
const M_PER_DEG_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const T0_MS = Date.parse('2026-01-01T10:00:00Z');

export function syntheticLabel(sec: number): string {
  return new Date(T0_MS + sec * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export type LinearProfileSegment = { durationS: number; vStartKmh: number; vEndKmh: number };

export class SyntheticSpeedProfile {
  constructor(private readonly segments: LinearProfileSegment[]) {}

  get durationS(): number {
    return this.segments.reduce((a, s) => a + s.durationS, 0);
  }

  speedKmh(t: number): number {
    let acc = 0;
    for (const seg of this.segments) {
      if (t <= acc + seg.durationS) {
        const f = seg.durationS > 0 ? (t - acc) / seg.durationS : 1;
        return seg.vStartKmh + (seg.vEndKmh - seg.vStartKmh) * f;
      }
      acc += seg.durationS;
    }
    return this.segments[this.segments.length - 1]!.vEndKmh;
  }
}

function integrateX(profile: SyntheticSpeedProfile, dt = 0.01): (t: number) => number {
  const n = Math.floor(profile.durationS / dt) + 1;
  const xs = [0];
  for (let i = 1; i < n; i++) {
    const v0 = profile.speedKmh(i * dt - dt) / 3.6;
    const v1 = profile.speedKmh(i * dt) / 3.6;
    xs.push(xs[i - 1]! + ((v0 + v1) / 2) * dt);
  }
  return (t: number) => {
    const i = Math.min(Math.max(Math.floor(t / dt), 0), n - 1);
    return xs[i]!;
  };
}

export interface MakeSyntheticGridOptions {
  noiseM?: number;
  absentWhenSpeedBelowKmh?: number;
  slips?: Record<number, number>;
  jumps?: Record<number, number>;
  frozen?: [number, number];
  seed?: number;
}

/** DIMO-like 1 Hz AVG bucket grid (1-D easting trajectory). */
export function makeSyntheticMotionGrid(
  profile: SyntheticSpeedProfile,
  sampleTimes: number[],
  options: MakeSyntheticGridOptions = {},
): MotionCorePositionBucket[] {
  const rnd = mulberry32(options.seed ?? 1);
  const xAt = integrateX(profile);
  const buckets = new Map<number, number[]>();
  let lastEmittedX: number | null = null;
  const sorted = [...sampleTimes].sort((a, b) => a - b);

  for (const ts of sorted) {
    const tEff = ts + (options.slips?.[ts] ?? 0);
    let pos = xAt(ts) + (options.jumps?.[ts] ?? 0);
    if (options.noiseM) {
      pos += gauss(rnd) * options.noiseM;
    }
    if (options.frozen && ts >= options.frozen[0] && ts <= options.frozen[1]) {
      pos = xAt(options.frozen[0]);
    }
    if (options.absentWhenSpeedBelowKmh != null && profile.speedKmh(ts) < options.absentWhenSpeedBelowKmh) {
      if (lastEmittedX != null && Math.abs(pos - lastEmittedX) < 1) {
        continue;
      }
    }
    lastEmittedX = pos;
    const b = Math.floor(tEff);
    const arr = buckets.get(b) ?? [];
    arr.push(pos);
    buckets.set(b, arr);
  }

  const grid: MotionCorePositionBucket[] = [];
  const n = Math.floor(profile.durationS);
  for (let sec = 0; sec <= n; sec++) {
    const lab = syntheticLabel(sec);
    const samples = buckets.get(sec);
    if (samples && samples.length > 0) {
      const xm = samples.reduce((a, v) => a + v, 0) / samples.length;
      grid.push({
        bucketLabelUtc: lab,
        availability: 'PRESENT',
        latitude: LAT0,
        longitude: xm / M_PER_DEG_LON,
      });
    } else {
      grid.push({ bucketLabelUtc: lab, availability: 'ROW_ABSENT', latitude: null, longitude: null });
    }
  }
  return grid;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rnd: () => number): number {
  const u = rnd() || 1e-9;
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

