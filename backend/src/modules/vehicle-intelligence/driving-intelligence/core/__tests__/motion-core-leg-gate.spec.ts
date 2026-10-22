import {
  computeC4AdaptiveL3,
  withImplausibleLegEndpointsQuarantined,
  implausibleOneSecondLegSpeedKmh,
  MOTION_CORE_IMPLAUSIBLE_1S_LEG_ABSOLUTE_BACKSTOP_KMH,
  type MotionCorePositionBucket,
} from '../index';

const T0 = Date.parse('2026-01-01T10:00:00Z');
const lab = (i: number) => new Date(T0 + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const LAT0 = 51.0;
const MLAT = 111_320;
const MLON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);

function lineGrid(distM: number[]): MotionCorePositionBucket[] {
  return distM.map((d, i) => ({
    bucketLabelUtc: lab(i),
    availability: 'PRESENT',
    latitude: LAT0,
    longitude: d / MLON,
  }));
}

/** Processor-equivalent: quarantine view for FSM, C4 on raw buckets. */
function processorC4(buckets: MotionCorePositionBucket[]) {
  withImplausibleLegEndpointsQuarantined(buckets);
  return computeC4AdaptiveL3(buckets);
}

describe('motion core 1 s leg gate', () => {
  function freezeJumpGrid(jumpM: number): MotionCorePositionBucket[] {
    const dist: number[] = [];
    for (let i = 0; i <= 19; i++) dist.push(i * 10);
    dist[20] = dist[19]!;
    dist.push(dist[19]! + jumpM);
    for (let i = 22; i < 81; i++) dist.push(dist[21]! + (i - 21) * 10);
    return lineGrid(dist);
  }

  it('rejects 1000 m jump after 1 s freeze (81 s line grid) via processor C4 path', () => {
    const buckets = freezeJumpGrid(1000);
    expect(buckets).toHaveLength(81);
    const c4 = processorC4(buckets);
    expect(c4).toHaveLength(81);
    const s21 = c4[21]!;
    expect(s21.label).toBe(buckets[21]!.bucketLabelUtc);
    expect(s21.valueKmh).toBeNull();
    expect(s21?.quality).toBe('OUTLIER_REJECTED');
    expect(s21?.flags).toContain('IMPLAUSIBLE_1S_LEG_ENDPOINT_UNCERTAIN');
    const s22 = c4[22]!;
    expect(s22.valueKmh).not.toBeNull();
    expect(s22.valueKmh!).toBeLessThan(100);
    expect(s22.valueKmh!).toBeGreaterThan(30);
  });

  it('does not bridge C1 over 5000 m jump (t=22 stays plausible, not km/h teleport)', () => {
    const buckets = freezeJumpGrid(5000);
    const c4 = processorC4(buckets);
    const s22 = c4[22]!;
    expect(s22.valueKmh).not.toBeNull();
    expect(s22.valueKmh!).toBeLessThan(100);
    expect(s22.valueKmh!).not.toBeCloseTo(2281.5, 0);
  });

  function uniformSpeedProfileKmh(targetKmh: number, n = 40) {
    const v = targetKmh / 3.6;
    const dist = Array.from({ length: n }, (_, i) => i * v);
    return lineGrid(dist);
  }

  it.each([200, 250, 260, 300])('preserves numeric C4 on uniform %i km/h synthetic profile', (targetKmh) => {
    const buckets = uniformSpeedProfileKmh(targetKmh);
    const c4 = computeC4AdaptiveL3(buckets);
    const mid = c4.filter((s) => s.label >= lab(5) && s.label <= lab(34));
    expect(mid.every((s) => s.valueKmh != null)).toBe(true);
    expect(mid.every((s) => Math.abs((s.valueKmh ?? 0) - targetKmh) < 2)).toBe(true);
  });

  it('rejects uniform 900 km/h synthetic profile via absolute 1 s leg backstop', () => {
    const buckets = uniformSpeedProfileKmh(900);
    const c4 = computeC4AdaptiveL3(buckets);
    const mid = c4.filter((s) => s.label >= lab(5) && s.label <= lab(34));
    expect(mid.every((s) => s.valueKmh == null)).toBe(true);
    expect(mid.every((s) => s.quality === 'OUTLIER_REJECTED')).toBe(true);
  });

  it('uses absolute backstop when neighbour legs are insufficient', () => {
    expect(implausibleOneSecondLegSpeedKmh(MOTION_CORE_IMPLAUSIBLE_1S_LEG_ABSOLUTE_BACKSTOP_KMH + 1, [])).toBe(
      true,
    );
    expect(implausibleOneSecondLegSpeedKmh(900, [900, 900, 900, 900])).toBe(true);
    expect(implausibleOneSecondLegSpeedKmh(260, [255, 258, 260, 262, 259, 261])).toBe(false);
  });

  it('allows plausible 1 s leg after normal GPS gap (2 s) without quarantine', () => {
    const buckets: MotionCorePositionBucket[] = [];
    for (let i = 0; i < 30; i++) {
      buckets.push({
        bucketLabelUtc: lab(i),
        availability: 'PRESENT',
        latitude: LAT0,
        longitude: (i * 10) / MLON,
      });
    }
    buckets.push({
      bucketLabelUtc: lab(32),
      availability: 'PRESENT',
      latitude: LAT0,
      longitude: (31 * 10) / MLON,
    });
    for (let i = 33; i < 40; i++) {
      buckets.push({
        bucketLabelUtc: lab(i),
        availability: 'PRESENT',
        latitude: LAT0,
        longitude: ((i - 1) * 10) / MLON,
      });
    }
    const c4 = computeC4AdaptiveL3(buckets);
    const afterGap = c4.find((s) => s.label === lab(33));
    expect(afterGap?.valueKmh).not.toBeNull();
    expect(afterGap?.quality).not.toBe('OUTLIER_REJECTED');
  });
});
