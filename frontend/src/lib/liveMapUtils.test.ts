import { describe, expect, it } from 'vitest';
import {
  bearingDeg,
  deriveVehicleState,
  distanceM,
  easeInOutCubic,
  interpolateLngLat,
  isMeaningfulMovement,
  MOVEMENT_THRESHOLD_M,
  stableHeadingDeg,
} from './liveMapUtils';

describe('liveMapUtils — map lifecycle helpers', () => {
  const berlin: [number, number] = [13.405, 52.52];
  const nearby: [number, number] = [13.40501, 52.52001];
  const far: [number, number] = [13.41, 52.525];

  it('distanceM returns zero for identical points', () => {
    expect(distanceM(berlin, berlin)).toBe(0);
  });

  it('isMeaningfulMovement treats sub-threshold jitter as non-movement', () => {
    expect(isMeaningfulMovement(berlin, nearby, MOVEMENT_THRESHOLD_M)).toBe(false);
    expect(isMeaningfulMovement(berlin, far, MOVEMENT_THRESHOLD_M)).toBe(true);
  });

  it('stableHeadingDeg returns null when history has no meaningful segment', () => {
    expect(stableHeadingDeg([berlin, nearby])).toBeNull();
  });

  it('stableHeadingDeg uses the last meaningful segment', () => {
    const heading = stableHeadingDeg([berlin, nearby, far]);
    expect(heading).not.toBeNull();
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(heading!).toBeLessThan(360);
    expect(heading).toBeCloseTo(bearingDeg(berlin, far), 0);
  });

  it('deriveVehicleState prioritizes GPS motion over ignition/engine load', () => {
    expect(deriveVehicleState(true, false, 0)).toBe('MOVING');
    expect(deriveVehicleState(false, true, 0)).toBe('IDLE');
    expect(deriveVehicleState(false, false, 12)).toBe('IDLE');
    expect(deriveVehicleState(false, false, 0)).toBe('PARKED');
  });

  it('interpolateLngLat and easeInOutCubic support smooth marker motion', () => {
    const mid = interpolateLngLat(berlin, far, 0.5);
    expect(mid[0]).toBeCloseTo((berlin[0] + far[0]) / 2, 5);
    expect(mid[1]).toBeCloseTo((berlin[1] + far[1]) / 2, 5);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBe(0.5);
  });
});
