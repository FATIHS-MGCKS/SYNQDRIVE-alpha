import {
  computeStartBoundaryWindowFrom,
  deriveTripStartBoundaryMaxLookbackMs,
  modelDelayedStartLiveBoundary,
  POSSIBLE_START_CONFIRM_MAX_WAIT_MS,
  START_BOUNDARY_LOOKBACK_MS,
} from './start-boundary-window.util';
import type { DimoTripSegment } from '../../dimo/dimo-segments.service';

const T0 = Date.parse('2026-08-29T12:00:00.000Z');
const at = (offsetMs: number) => new Date(T0 + offsetMs);

function dimoSegment(
  startMs: number,
  endMs: number,
  startedBeforeRange = false,
): DimoTripSegment {
  return {
    segmentId: `seg-${startMs}`,
    mechanism: 'changePointDetection',
    startTime: at(startMs).toISOString(),
    endTime: at(endMs).toISOString(),
    startedBeforeRange,
    isOngoing: false,
    durationSeconds: Math.round((endMs - startMs) / 1000),
    startLatitude: 51.1,
    startLongitude: 9.2,
    endLatitude: 51.3,
    endLongitude: 9.4,
    odometerStartKm: null,
    odometerEndKm: null,
    distanceKm: 12,
    maxSpeedKmh: null,
  };
}

describe('delayed-start boundary safety gate (A1–A3)', () => {
  const canonicalLookbackMs = deriveTripStartBoundaryMaxLookbackMs();

  it('A1 RESTING_STANDBY — startedBeforeRange segment still rejected even with widened lookback', () => {
    const realStart = at(10_000);
    const firstDetection = at(5 * 60_000);
    const result = modelDelayedStartLiveBoundary({
      realDimoStart: realStart,
      firstDetectionAt: firstDetection,
      confirmationDelayMs: 60_000,
      dimoSegment: dimoSegment(10_000, 20 * 60_000, true),
    });

    expect(result.possibleStartAt).toEqual(firstDetection);
    expect(result.boundaryWindowFrom.getTime()).toBeLessThan(realStart.getTime());
    expect(result.selectedDimoSegmentStart).toBeNull();
    expect(result.effectiveLiveStartEstimate).toEqual(firstDetection);
    expect(result.missingPrefixMs).toBe(4 * 60_000 + 50_000);
  });

  it('A1 RESTING_STANDBY — DIMO segment recovers when confirmation is immediate and segment in range', () => {
    const realStart = at(10_000);
    const firstDetection = at(5 * 60_000);
    const result = modelDelayedStartLiveBoundary({
      realDimoStart: realStart,
      firstDetectionAt: firstDetection,
      confirmationDelayMs: 0,
      dimoSegment: dimoSegment(10_000, 20 * 60_000),
    });

    expect(result.boundaryWindowFrom.getTime()).toBeLessThanOrEqual(realStart.getTime());
    expect(result.selectedDimoSegmentStart).toEqual(realStart);
    expect(result.effectiveLiveStartEstimate).toEqual(realStart);
    expect(result.missingPrefixMs).toBe(0);
  });

  it('A2 LONG_IDLE — startedBeforeRange prevents live recovery; canonical repair required', () => {
    const realStart = at(60_000);
    const firstDetection = at(30 * 60_000);
    const result = modelDelayedStartLiveBoundary({
      realDimoStart: realStart,
      firstDetectionAt: firstDetection,
      confirmationDelayMs: 60_000,
      dimoSegment: dimoSegment(60_000, 50 * 60_000, true),
    });

    expect(result.boundaryWindowFrom.getTime()).toBeLessThan(realStart.getTime());
    expect(result.selectedDimoSegmentStart).toBeNull();
    expect(result.effectiveLiveStartEstimate).toEqual(firstDetection);
    expect(result.missingPrefixMs).toBeGreaterThanOrEqual(29 * 60_000);
  });

  it('A3 LONG_IDLE — confirmation 30–180s after movement still truncates prefix when segment rejected', () => {
    for (const delayMs of [30_000, 90_000, 180_000]) {
      const result = modelDelayedStartLiveBoundary({
        realDimoStart: at(60_000),
        firstDetectionAt: at(30 * 60_000),
        confirmationDelayMs: delayMs,
        dimoSegment: dimoSegment(60_000, 50 * 60_000, true),
      });

      expect(result.selectedDimoSegmentStart).toBeNull();
      expect(result.missingPrefixMs).toBeGreaterThanOrEqual(28 * 60_000);
    }
  });

  it('canonical lookback is derived from max poll tier + confirmation + buffer (not fixed 5min)', () => {
    expect(canonicalLookbackMs).toBeGreaterThan(START_BOUNDARY_LOOKBACK_MS);
    const boundary = computeStartBoundaryWindowFrom(
      at(30 * 60_000),
      at(30 * 60_000 + POSSIBLE_START_CONFIRM_MAX_WAIT_MS),
      canonicalLookbackMs,
    );
    const legacyBoundary = computeStartBoundaryWindowFrom(
      at(30 * 60_000),
      at(30 * 60_000 + POSSIBLE_START_CONFIRM_MAX_WAIT_MS),
      START_BOUNDARY_LOOKBACK_MS,
    );
    expect(boundary.getTime()).toBeLessThan(legacyBoundary.getTime());
  });
});
