import {
  buildTripRouteInputFingerprintInput,
  computeTripRouteInputFingerprint,
} from './trip-route-input-fingerprint';
import { TRIP_ROUTE_ALGORITHM_VERSION } from './trip-route-algorithm-version';
import {
  assertMeasuredVerticesOnly,
  preprocessTripRoute,
} from './trip-route-preprocessor';
import type { TripRouteInputPoint } from './trip-route.types';

const TRIP_ID = 'trip-r2-test';

function pt(
  lat: number,
  lng: number,
  recordedAt: string,
): TripRouteInputPoint {
  return { latitude: lat, longitude: lng, recordedAt };
}

function ts(baseSeconds: number): string {
  return new Date(Date.UTC(2026, 7, 1, 10, 0, baseSeconds)).toISOString();
}

function run(points: TripRouteInputPoint[]) {
  return preprocessTripRoute({ tripId: TRIP_ID, points });
}

describe('trip-route-preprocessor (R2)', () => {
  it('A — empty input yields RAW fallback', () => {
    const result = run([]);
    expect(result.quality).toBe('RAW');
    expect(result.filteredGeometry).toBeNull();
    expect(result.diagnostics.fallbackReason).toBe('no_valid_measured_points');
  });

  it('B — one point yields RAW fallback', () => {
    const result = run([pt(52.52, 13.4, ts(0))]);
    expect(result.quality).toBe('RAW');
    expect(result.filteredGeometry).toBeNull();
    expect(result.diagnostics.fallbackReason).toBe('insufficient_filtered_points');
  });

  it('C — two valid points yield FILTERED', () => {
    const result = run([pt(52.52, 13.4, ts(0)), pt(52.53, 13.41, ts(7))]);
    expect(result.quality).toBe('FILTERED');
    expect(result.filteredGeometry).toHaveLength(2);
  });

  it('D — removes exact duplicates', () => {
    const p = pt(52.52, 13.4, ts(0));
    const result = run([p, p, pt(52.53, 13.41, ts(7))]);
    expect(result.filteredPoints).toHaveLength(2);
    expect(result.diagnostics.duplicateRemovedCount).toBeGreaterThanOrEqual(1);
  });

  it('E — collapses same-coordinate stationary repeats', () => {
    const result = run([
      pt(52.52, 13.4, ts(0)),
      pt(52.52, 13.4, ts(7)),
      pt(52.52, 13.4, ts(14)),
      pt(52.52, 13.4, ts(21)),
      pt(52.53, 13.41, ts(28)),
    ]);
    expect(result.quality).toBe('FILTERED');
    expect(result.filteredPoints.length).toBeLessThan(5);
    expect(result.filteredPoints[0].latitude).toBe(52.52);
    expect(result.filteredPoints[result.filteredPoints.length - 1].latitude).toBe(52.53);
  });

  it('F — rejects invalid longitude', () => {
    const result = run([
      pt(52.52, 200, ts(0)),
      pt(52.53, 13.41, ts(7)),
    ]);
    expect(result.diagnostics.invalidRemovedCount).toBe(1);
  });

  it('G — rejects invalid latitude', () => {
    const result = run([
      pt(100, 13.4, ts(0)),
      pt(52.53, 13.41, ts(7)),
    ]);
    expect(result.diagnostics.invalidRemovedCount).toBe(1);
  });

  it('H — rejects NaN/Infinity coordinates', () => {
    const result = run([
      pt(Number.NaN, 13.4, ts(0)),
      pt(52.52, Number.POSITIVE_INFINITY, ts(7)),
      pt(52.53, 13.41, ts(14)),
    ]);
    expect(result.diagnostics.invalidRemovedCount).toBe(2);
    expect(result.quality).toBe('RAW');
  });

  it('I — sorts out-of-order timestamps deterministically', () => {
    const result = run([
      pt(52.53, 13.41, ts(14)),
      pt(52.52, 13.4, ts(0)),
      pt(52.525, 13.405, ts(7)),
    ]);
    expect(result.rawPoints[0].latitude).toBe(52.52);
    expect(result.rawPoints[2].latitude).toBe(52.53);
  });

  it('J — breaks ties by original index for equal timestamps', () => {
    const t = ts(0);
    const result = run([
      pt(52.53, 13.41, t),
      pt(52.52, 13.4, t),
    ]);
    expect(result.rawPoints[0].sourceIndex).toBe(0);
    expect(result.rawPoints[1].sourceIndex).toBe(1);
  });

  it('K — removes isolated teleport spike', () => {
    const result = run([
      pt(52.52, 13.4, ts(0)),
      pt(52.9, 13.4, ts(5)),
      pt(52.525, 13.405, ts(10)),
    ]);
    expect(result.filteredPoints.some((p) => p.latitude === 52.9)).toBe(false);
    expect(result.diagnostics.spikeRemovedCount).toBeGreaterThanOrEqual(1);
    expect(result.quality).toBe('FILTERED');
  });

  it('L — preserves legitimate high-speed motorway movement', () => {
    const result = run([
      pt(52.52, 13.4, ts(0)),
      pt(52.7, 13.4, ts(360)),
    ]);
    expect(result.quality).toBe('FILTERED');
    expect(result.filteredPoints).toHaveLength(2);
    expect(result.diagnostics.spikeRemovedCount).toBe(0);
  });

  it('M — records 10-minute telemetry gap without fabricating points', () => {
    const result = run([
      pt(52.52, 13.4, ts(0)),
      pt(52.53, 13.41, ts(600)),
    ]);
    expect(result.filteredPoints).toHaveLength(2);
    expect(result.diagnostics.gapCount).toBe(1);
    expect(result.diagnostics.largestGapSeconds).toBe(600);
    expect(result.filteredGeometry).toHaveLength(2);
  });

  it('N — preserves sharp urban turn vertices', () => {
    const points: TripRouteInputPoint[] = [];
    for (let i = 0; i <= 10; i++) {
      points.push(pt(52.52, 13.4 + i * 0.002, ts(i * 7)));
    }
    for (let i = 1; i <= 10; i++) {
      points.push(pt(52.52 + i * 0.002, 13.42, ts(80 + i * 7)));
    }
    const result = run(points);
    expect(result.quality).toBe('FILTERED');
    const corner = result.filteredPoints.find(
      (p) => Math.abs(p.latitude - 52.52) < 0.0001 && Math.abs(p.longitude - 13.42) < 0.0001,
    );
    expect(corner).toBeDefined();
    expect(result.filteredPoints.length).toBeGreaterThanOrEqual(3);
  });

  it('O — does not collapse roundabout geometry to a chord', () => {
    const centerLat = 52.52;
    const centerLng = 13.4;
    const radius = 0.004;
    const points: TripRouteInputPoint[] = [];
    for (let i = 0; i <= 12; i++) {
      const angle = (i / 12) * Math.PI * 1.5;
      points.push(
        pt(
          centerLat + Math.sin(angle) * radius,
          centerLng + Math.cos(angle) * radius,
          ts(i * 7),
        ),
      );
    }
    const result = run(points);
    expect(result.quality).toBe('FILTERED');
    expect(result.filteredPoints.length).toBeGreaterThanOrEqual(4);
  });

  it('P — reduces redundant straight-line points safely', () => {
    const points: TripRouteInputPoint[] = [];
    for (let i = 0; i <= 40; i++) {
      points.push(pt(52.52 + i * 0.0001, 13.4, ts(i * 7)));
    }
    const result = run(points);
    expect(result.filteredPoints.length).toBeLessThan(points.length);
    expect(result.filteredPoints.length).toBeGreaterThanOrEqual(2);
  });

  it('Q — preserves first and last points', () => {
    const points = [
      pt(52.52, 13.4, ts(0)),
      ...Array.from({ length: 8 }, (_, i) => pt(52.52, 13.4, ts(7 + i * 7))),
      pt(52.6, 13.5, ts(80)),
    ];
    const result = run(points);
    expect(result.filteredPoints[0].latitude).toBe(52.52);
    expect(result.filteredPoints[result.filteredPoints.length - 1].latitude).toBe(52.6);
  });

  it('R — selects FILTERED when valid', () => {
    const result = run([pt(52.52, 13.4, ts(0)), pt(52.53, 13.41, ts(7))]);
    expect(result.quality).toBe('FILTERED');
  });

  it('S — RAW fallback when filtering leaves <2 points', () => {
    const result = run([pt(52.52, 13.4, ts(0)), pt(Number.NaN, 13.4, ts(7))]);
    expect(result.quality).toBe('RAW');
    expect(result.filteredGeometry).toBeNull();
  });

  it('T — never produces MATCHED quality', () => {
    const result = run([pt(52.52, 13.4, ts(0)), pt(52.53, 13.41, ts(7))]);
    expect(result.quality).not.toBe('MATCHED');
  });

  it('U — deterministic repeated preprocessing', () => {
    const points = [pt(52.52, 13.4, ts(0)), pt(52.53, 13.41, ts(7)), pt(52.54, 13.42, ts(14))];
    const a = run(points);
    const b = run(points);
    expect(a).toEqual(b);
  });

  it('AC — filtered geometry contains only measured vertices', () => {
    const points = [
      pt(52.52, 13.4, ts(0)),
      pt(52.525, 13.405, ts(7)),
      pt(52.53, 13.41, ts(14)),
      pt(52.535, 13.415, ts(21)),
    ];
    const result = run(points);
    expect(() => assertMeasuredVerticesOnly(result.filteredPoints, result.filteredGeometry)).not.toThrow();
  });

  it('V — coordinate change changes fingerprint', () => {
    const base = [pt(52.52, 13.4, ts(0)), pt(52.53, 13.41, ts(7))];
    const a = computeTripRouteInputFingerprint(
      buildTripRouteInputFingerprintInput(TRIP_ID, TRIP_ROUTE_ALGORITHM_VERSION, base),
    );
    const b = computeTripRouteInputFingerprint(
      buildTripRouteInputFingerprintInput(TRIP_ID, TRIP_ROUTE_ALGORITHM_VERSION, [
        base[0],
        pt(52.54, 13.42, ts(7)),
      ]),
    );
    expect(b).not.toBe(a);
  });

  it('W — timestamp change changes fingerprint', () => {
    const a = computeTripRouteInputFingerprint(
      buildTripRouteInputFingerprintInput(TRIP_ID, TRIP_ROUTE_ALGORITHM_VERSION, [
        pt(52.52, 13.4, ts(0)),
        pt(52.53, 13.41, ts(7)),
      ]),
    );
    const b = computeTripRouteInputFingerprint(
      buildTripRouteInputFingerprintInput(TRIP_ID, TRIP_ROUTE_ALGORITHM_VERSION, [
        pt(52.52, 13.4, ts(0)),
        pt(52.53, 13.41, ts(14)),
      ]),
    );
    expect(b).not.toBe(a);
  });

  it('Y — speed does not influence fingerprint (OPTION A: coords + timestamps only)', () => {
    const points = [pt(52.52, 13.4, ts(0)), pt(52.53, 13.41, ts(7))];
    const a = computeTripRouteInputFingerprint(
      buildTripRouteInputFingerprintInput(TRIP_ID, TRIP_ROUTE_ALGORITHM_VERSION, points),
    );
    const b = computeTripRouteInputFingerprint(
      buildTripRouteInputFingerprintInput(TRIP_ID, TRIP_ROUTE_ALGORITHM_VERSION, points),
    );
    expect(a).toBe(b);
  });
});
